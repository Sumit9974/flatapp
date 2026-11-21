-- FlatApp phase 1: people, flats, members, bills.
--
-- Why it is shaped this way:
-- * Every table is closed by row-level security and opened only to the flat's current members.
-- * Joining or creating a flat goes through SECURITY DEFINER functions: a person cannot be a member
--   before they are one, so a plain INSERT policy could never let them in.
-- * A bill's status changes only through mark_bill(), which writes the history row in the same
--   transaction. Clients cannot UPDATE status columns at all (column-level grants), and nobody can
--   edit or delete history: requirements say every mark/unmark must stay traceable.
-- * Recurring bills are templates; a daily job and an insert trigger create each month's entry,
--   and UNIQUE (template_id, month) makes that safe to run any number of times.

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1), 'Flatmate'), 40)
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- flats and members
create type public.member_role as enum ('admin', 'member');

create table public.flats (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  invite_code text not null unique check (invite_code ~ '^[A-Z0-9]{6}$'),
  timezone text not null default 'Asia/Kolkata',
  home_lat double precision check (home_lat between -90 and 90),
  home_lng double precision check (home_lng between -180 and 180),
  radius_m integer not null default 200 check (radius_m between 100 and 1000),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.flat_members (
  flat_id uuid not null references public.flats (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'member',
  joined_at timestamptz not null default now(),
  -- Kept (not deleted) when someone leaves, so their name still shows on old bills.
  left_at timestamptz,
  primary key (flat_id, user_id)
);

create index flat_members_user_idx on public.flat_members (user_id) where left_at is null;

create function public.is_flat_member(p_flat uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.flat_members m
    where m.flat_id = p_flat and m.user_id = auth.uid() and m.left_at is null
  );
$$;

create function public.is_flat_admin(p_flat uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.flat_members m
    where m.flat_id = p_flat and m.user_id = auth.uid() and m.left_at is null and m.role = 'admin'
  );
$$;

-- People you share (or shared) a flat with: whose names you may see.
create function public.shares_a_flat_with(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.flat_members mine
    join public.flat_members theirs on theirs.flat_id = mine.flat_id
    where mine.user_id = auth.uid() and mine.left_at is null and theirs.user_id = p_user
  );
$$;

create function public.new_invite_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O, 1/I
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.flats f where f.invite_code = code);
  end loop;
  return code;
end $$;

-- ---------------------------------------------------------------- bills
create table public.bill_categories (
  id uuid primary key default gen_random_uuid(),
  flat_id uuid not null references public.flats (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  is_builtin boolean not null default false,
  created_at timestamptz not null default now(),
  unique (flat_id, name)
);

create table public.bill_templates (
  id uuid primary key default gen_random_uuid(),
  flat_id uuid not null references public.flats (id) on delete cascade,
  category_id uuid not null references public.bill_categories (id),
  amount numeric(10, 2) check (amount >= 0),
  due_day smallint not null check (due_day between 1 and 28),
  remind_days_before smallint not null default 3 check (remind_days_before between 0 and 10),
  active boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);

create type public.bill_status as enum ('unpaid', 'paid');

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  flat_id uuid not null references public.flats (id) on delete cascade,
  category_id uuid not null references public.bill_categories (id),
  template_id uuid references public.bill_templates (id) on delete set null,
  month date not null check (extract(day from month) = 1),
  title text not null check (char_length(title) between 1 and 60),
  amount numeric(10, 2) check (amount >= 0),
  due_date date,
  status public.bill_status not null default 'unpaid',
  marked_by uuid references auth.users (id),
  marked_at timestamptz,
  note text check (char_length(note) <= 200),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  unique (template_id, month),
  check ((status = 'paid') = (marked_by is not null and marked_at is not null))
);

create index bills_flat_month_idx on public.bills (flat_id, month desc);

create table public.bill_history (
  id bigint generated always as identity primary key,
  bill_id uuid not null references public.bills (id) on delete cascade,
  flat_id uuid not null references public.flats (id) on delete cascade,
  actor_id uuid not null references auth.users (id),
  action text not null check (action in ('created', 'marked_paid', 'marked_unpaid', 'edited')),
  reason text check (char_length(reason) <= 200),
  details jsonb,
  at timestamptz not null default now()
);

create index bill_history_bill_idx on public.bill_history (bill_id, at desc);

-- History for creation and plain edits. Status changes write their own row in mark_bill().
create function public.log_bill_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  changes jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.bill_history (bill_id, flat_id, actor_id, action, details)
    values (new.id, new.flat_id, coalesce(auth.uid(), new.created_by), 'created',
            jsonb_build_object('source', case when new.template_id is null then 'manual' else 'recurring' end));
    return new;
  end if;

  if new.status is distinct from old.status then
    return new;
  end if;
  if new.title is distinct from old.title then
    changes := changes || jsonb_build_object('title', jsonb_build_array(old.title, new.title));
  end if;
  if new.amount is distinct from old.amount then
    changes := changes || jsonb_build_object('amount', jsonb_build_array(old.amount, new.amount));
  end if;
  if new.due_date is distinct from old.due_date then
    changes := changes || jsonb_build_object('due_date', jsonb_build_array(old.due_date, new.due_date));
  end if;
  if new.note is distinct from old.note then
    changes := changes || jsonb_build_object('note', jsonb_build_array(old.note, new.note));
  end if;
  if new.category_id is distinct from old.category_id then
    changes := changes || jsonb_build_object('category_id', jsonb_build_array(old.category_id, new.category_id));
  end if;
  if changes <> '{}'::jsonb then
    insert into public.bill_history (bill_id, flat_id, actor_id, action, details)
    values (new.id, new.flat_id, coalesce(auth.uid(), new.created_by), 'edited', changes);
  end if;
  return new;
end $$;

create trigger bills_log_change
  after insert or update on public.bills
  for each row execute function public.log_bill_change();

-- Creates this month's entry for every active template (or just one). Safe to repeat.
create function public.generate_recurring_bills(p_template uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  created integer;
begin
  insert into public.bills (flat_id, category_id, template_id, month, title, amount, due_date, created_by)
  select t.flat_id,
         t.category_id,
         t.id,
         m.month,
         c.name || ', ' || to_char(m.month, 'Mon YYYY'),
         t.amount,
         make_date(extract(year from m.month)::int, extract(month from m.month)::int, t.due_day),
         t.created_by
  from public.bill_templates t
  join public.bill_categories c on c.id = t.category_id
  join public.flats f on f.id = t.flat_id
  cross join lateral (select date_trunc('month', now() at time zone f.timezone)::date as month) m
  where t.active and (p_template is null or t.id = p_template)
  on conflict (template_id, month) do nothing;
  get diagnostics created = row_count;
  return created;
end $$;

create function public.on_template_saved() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.active then
    perform public.generate_recurring_bills(new.id);
  end if;
  return new;
end $$;

create trigger bill_templates_generate
  after insert or update of active on public.bill_templates
  for each row execute function public.on_template_saved();

-- ---------------------------------------------------------------- RPCs
create function public.create_flat(p_name text) returns public.flats
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  flat public.flats;
begin
  if me is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  if char_length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Give the flat a name' using errcode = '22023'; end if;

  insert into public.flats (name, invite_code, created_by)
  values (trim(p_name), public.new_invite_code(), me)
  returning * into flat;

  insert into public.flat_members (flat_id, user_id, role) values (flat.id, me, 'admin');

  insert into public.bill_categories (flat_id, name, is_builtin)
  select flat.id, n, true
  from unnest(array['Light bill', 'WiFi', 'Gas', 'Rent', 'Water', 'Grocery', 'Maintenance']) as n;

  return flat;
end $$;

create function public.join_flat(p_code text) returns public.flats
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  flat public.flats;
begin
  if me is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  select * into flat from public.flats f where f.invite_code = upper(trim(coalesce(p_code, '')));
  if not found then raise exception 'No flat has that invite code' using errcode = 'P0002'; end if;

  insert into public.flat_members (flat_id, user_id, role)
  values (flat.id, me, 'member')
  on conflict (flat_id, user_id) do update set left_at = null, joined_at = now()
    where public.flat_members.left_at is not null;
  return flat;
end $$;

create function public.leave_flat(p_flat uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  others integer;
  other_admins integer;
begin
  if not public.is_flat_member(p_flat) then raise exception 'You are not in this flat' using errcode = '42501'; end if;
  select count(*) filter (where user_id <> me),
         count(*) filter (where user_id <> me and role = 'admin')
    into others, other_admins
  from public.flat_members where flat_id = p_flat and left_at is null;
  if public.is_flat_admin(p_flat) and others > 0 and other_admins = 0 then
    raise exception 'Make someone else admin before you leave' using errcode = '23514';
  end if;
  update public.flat_members set left_at = now() where flat_id = p_flat and user_id = me;
end $$;

create function public.set_member_role(p_flat uuid, p_user uuid, p_role public.member_role) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_flat_admin(p_flat) then raise exception 'Only an admin can do that' using errcode = '42501'; end if;
  if p_role = 'member' and not exists (
    select 1 from public.flat_members
    where flat_id = p_flat and left_at is null and role = 'admin' and user_id <> p_user
  ) then
    raise exception 'A flat needs at least one admin' using errcode = '23514';
  end if;
  update public.flat_members set role = p_role
  where flat_id = p_flat and user_id = p_user and left_at is null;
  if not found then raise exception 'That person is not in this flat' using errcode = 'P0002'; end if;
end $$;

create function public.remove_member(p_flat uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_flat_admin(p_flat) then raise exception 'Only an admin can do that' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'Use Leave flat to remove yourself' using errcode = '22023'; end if;
  update public.flat_members set left_at = now()
  where flat_id = p_flat and user_id = p_user and left_at is null;
  if not found then raise exception 'That person is not in this flat' using errcode = 'P0002'; end if;
end $$;

create function public.reset_invite_code(p_flat uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  code text;
begin
  if not public.is_flat_admin(p_flat) then raise exception 'Only an admin can do that' using errcode = '42501'; end if;
  code := public.new_invite_code();
  update public.flats set invite_code = code where id = p_flat;
  return code;
end $$;

create function public.update_flat_home(p_flat uuid, p_lat double precision, p_lng double precision, p_radius integer)
returns public.flats
language plpgsql security definer set search_path = '' as $$
declare
  flat public.flats;
begin
  if not public.is_flat_admin(p_flat) then raise exception 'Only an admin can do that' using errcode = '42501'; end if;
  update public.flats set home_lat = p_lat, home_lng = p_lng, radius_m = p_radius
  where id = p_flat returning * into flat;
  return flat;
end $$;

create function public.rename_flat(p_flat uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_flat_admin(p_flat) then raise exception 'Only an admin can do that' using errcode = '42501'; end if;
  update public.flats set name = trim(p_name) where id = p_flat;
end $$;

-- The only way to change a bill's status. Marking paid twice keeps the first person's mark.
create function public.mark_bill(p_bill uuid, p_paid boolean, p_reason text default null) returns public.bills
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  bill public.bills;
begin
  select * into bill from public.bills where id = p_bill for update;
  if not found or not public.is_flat_member(bill.flat_id) then
    raise exception 'Bill not found' using errcode = 'P0002';
  end if;

  if p_paid then
    if bill.status = 'paid' then return bill; end if;
    update public.bills set status = 'paid', marked_by = me, marked_at = now()
    where id = p_bill returning * into bill;
    insert into public.bill_history (bill_id, flat_id, actor_id, action)
    values (bill.id, bill.flat_id, me, 'marked_paid');
  else
    if bill.status = 'unpaid' then return bill; end if;
    if char_length(trim(coalesce(p_reason, ''))) = 0 then
      raise exception 'Say why it is being marked unpaid' using errcode = '22023';
    end if;
    update public.bills set status = 'unpaid', marked_by = null, marked_at = null
    where id = p_bill returning * into bill;
    insert into public.bill_history (bill_id, flat_id, actor_id, action, reason)
    values (bill.id, bill.flat_id, me, 'marked_unpaid', left(trim(p_reason), 200));
  end if;
  return bill;
end $$;

-- ---------------------------------------------------------------- row-level security
alter table public.profiles enable row level security;
alter table public.flats enable row level security;
alter table public.flat_members enable row level security;
alter table public.bill_categories enable row level security;
alter table public.bill_templates enable row level security;
alter table public.bills enable row level security;
alter table public.bill_history enable row level security;

create policy "see yourself and flatmates" on public.profiles
  for select to authenticated using (id = auth.uid() or public.shares_a_flat_with(id));
create policy "edit your own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "members see their flat" on public.flats
  for select to authenticated using (public.is_flat_member(id));

create policy "members see the member list" on public.flat_members
  for select to authenticated using (public.is_flat_member(flat_id));

create policy "members see categories" on public.bill_categories
  for select to authenticated using (public.is_flat_member(flat_id));
create policy "members add categories" on public.bill_categories
  for insert to authenticated with check (public.is_flat_member(flat_id) and not is_builtin);

create policy "members see recurring bills" on public.bill_templates
  for select to authenticated using (public.is_flat_member(flat_id));
create policy "members add recurring bills" on public.bill_templates
  for insert to authenticated with check (public.is_flat_member(flat_id) and created_by = auth.uid());
create policy "members change recurring bills" on public.bill_templates
  for update to authenticated using (public.is_flat_member(flat_id)) with check (public.is_flat_member(flat_id));
create policy "members delete recurring bills" on public.bill_templates
  for delete to authenticated using (public.is_flat_member(flat_id));

create policy "members see bills" on public.bills
  for select to authenticated using (public.is_flat_member(flat_id));
create policy "members add one-off bills" on public.bills
  for insert to authenticated
  with check (public.is_flat_member(flat_id) and created_by = auth.uid() and status = 'unpaid' and template_id is null);
create policy "members edit bills" on public.bills
  for update to authenticated using (public.is_flat_member(flat_id)) with check (public.is_flat_member(flat_id));

create policy "members see bill history" on public.bill_history
  for select to authenticated using (public.is_flat_member(flat_id));

-- ---------------------------------------------------------------- grants
-- The project does not expose new tables automatically: grant exactly what the app needs,
-- to signed-in users only. Status/marked_* are not updatable by clients (mark_bill() only).
-- Start from nothing: a table-wide UPDATE grant from default privileges would override the
-- column lists below.
revoke all on all tables in schema public from anon, authenticated;
grant select, update (display_name) on public.profiles to authenticated;
grant select on public.flats to authenticated;
grant select on public.flat_members to authenticated;
grant select, insert (flat_id, name) on public.bill_categories to authenticated;
grant select, insert, delete on public.bill_templates to authenticated;
grant update (amount, due_day, remind_days_before, active) on public.bill_templates to authenticated;
grant select on public.bills to authenticated;
grant insert (flat_id, category_id, month, title, amount, due_date, note) on public.bills to authenticated;
grant update (category_id, title, amount, due_date, note) on public.bills to authenticated;
grant select on public.bill_history to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.create_flat(text),
  public.join_flat(text),
  public.leave_flat(uuid),
  public.set_member_role(uuid, uuid, public.member_role),
  public.remove_member(uuid, uuid),
  public.reset_invite_code(uuid),
  public.update_flat_home(uuid, double precision, double precision, integer),
  public.rename_flat(uuid, text),
  public.mark_bill(uuid, boolean, text),
  public.is_flat_member(uuid),
  public.is_flat_admin(uuid),
  public.shares_a_flat_with(uuid)
to authenticated;

-- ---------------------------------------------------------------- daily job
-- 00:05 UTC = 05:35 IST: creates the month's recurring bills on the 1st (and catches up any day).
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
select cron.schedule('flatapp-recurring-bills', '5 0 * * *', $$select public.generate_recurring_bills()$$);

-- ---------------------------------------------------------------- realtime
-- Open screens refresh when a flatmate marks a bill or joins. Realtime still applies the RLS above.
alter publication supabase_realtime add table public.bills, public.bill_history, public.flat_members;
