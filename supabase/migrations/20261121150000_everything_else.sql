-- FlatApp phase 2: dinner, buy list, presence, flat info, contacts, documents, notices, polls,
-- repairs, and in-app notifications (with per-person preferences and bill reminders).
--
-- Shape, same rules as phase 1: every table is closed by RLS and opened to the flat's current
-- members only; anything that changes shared state goes through a SECURITY DEFINER function, which
-- also writes the notifications for everyone else in the flat. Clients get SELECT, plus INSERT /
-- UPDATE / DELETE only where a plain row edit is the whole story (flat info, contacts, documents,
-- notices). Push notifications (Firebase) come later and will read the same notifications table.

-- ================================================================== helpers
create function public.display_name(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select display_name from public.profiles where id = p_user), 'Someone');
$$;

create function public.flat_today(p_flat uuid) returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone coalesce((select timezone from public.flats where id = p_flat), 'Asia/Kolkata'))::date;
$$;

-- Dinner "day" runs from 4:00 am to 4:00 am, so a late order still counts as tonight.
create function public.dinner_day(p_flat uuid) returns date
language sql stable security definer set search_path = '' as $$
  select ((now() at time zone coalesce((select timezone from public.flats where id = p_flat), 'Asia/Kolkata')) - interval '4 hours')::date;
$$;

-- ================================================================== notifications
create table public.notification_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  dinner boolean not null default true,
  bills boolean not null default true,
  buy boolean not null default true,
  notices boolean not null default true,
  presence boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id bigint generated always as identity primary key,
  flat_id uuid not null references public.flats (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('dinner', 'bills', 'buy', 'notices', 'presence')),
  title text not null,
  body text,
  target text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- One row per current member except the actor, unless that member switched the kind off.
create function public.notify_flat(p_flat uuid, p_actor uuid, p_kind text, p_title text, p_body text, p_target text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (flat_id, user_id, actor_id, kind, title, body, target)
  select p_flat, m.user_id, p_actor, p_kind, p_title, p_body, p_target
  from public.flat_members m
  left join public.notification_prefs np on np.user_id = m.user_id
  where m.flat_id = p_flat
    and m.left_at is null
    and (p_actor is null or m.user_id <> p_actor)
    and coalesce(case p_kind
      when 'dinner' then np.dinner
      when 'bills' then np.bills
      when 'buy' then np.buy
      when 'notices' then np.notices
      when 'presence' then np.presence
    end, p_kind <> 'presence');
end $$;

create function public.mark_notifications_read(p_flat uuid) returns void
language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now()
  where user_id = auth.uid() and flat_id = p_flat and read_at is null;
$$;

create function public.save_notification_prefs(p_dinner boolean, p_bills boolean, p_buy boolean, p_notices boolean, p_presence boolean)
returns void
language sql security definer set search_path = '' as $$
  insert into public.notification_prefs (user_id, dinner, bills, buy, notices, presence, updated_at)
  values (auth.uid(), p_dinner, p_bills, p_buy, p_notices, p_presence, now())
  on conflict (user_id) do update set dinner = excluded.dinner, bills = excluded.bills, buy = excluded.buy,
    notices = excluded.notices, presence = excluded.presence, updated_at = now();
$$;

-- ================================================================== bills: notify on marks, plus daily reminders
create or replace function public.mark_bill(p_bill uuid, p_paid boolean, p_reason text default null) returns public.bills
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
    perform public.notify_flat(bill.flat_id, me, 'bills',
      public.display_name(me) || ' marked ' || bill.title || ' paid', null, 'bill:' || bill.id);
  else
    if bill.status = 'unpaid' then return bill; end if;
    if char_length(trim(coalesce(p_reason, ''))) = 0 then
      raise exception 'Say why it is being marked unpaid' using errcode = '22023';
    end if;
    update public.bills set status = 'unpaid', marked_by = null, marked_at = null
    where id = p_bill returning * into bill;
    insert into public.bill_history (bill_id, flat_id, actor_id, action, reason)
    values (bill.id, bill.flat_id, me, 'marked_unpaid', left(trim(p_reason), 200));
    perform public.notify_flat(bill.flat_id, me, 'bills',
      public.display_name(me) || ' marked ' || bill.title || ' unpaid', left(trim(p_reason), 200), 'bill:' || bill.id);
  end if;
  return bill;
end $$;

-- Recurring bills only: on the reminder day, on the due day, then every 2 days while overdue.
create function public.send_bill_reminders() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  b record;
  today date;
  sent integer := 0;
begin
  for b in
    select bl.*, t.remind_days_before
    from public.bills bl
    join public.bill_templates t on t.id = bl.template_id
    where bl.status = 'unpaid' and bl.due_date is not null
  loop
    today := public.flat_today(b.flat_id);
    if b.due_date - b.remind_days_before = today and b.remind_days_before > 0 then
      perform public.notify_flat(b.flat_id, null, 'bills', b.title || ' is due in ' || b.remind_days_before || ' days', null, 'bill:' || b.id);
      sent := sent + 1;
    elsif b.due_date = today then
      perform public.notify_flat(b.flat_id, null, 'bills', b.title || ' is due today', null, 'bill:' || b.id);
      sent := sent + 1;
    elsif b.due_date < today and (today - b.due_date) % 2 = 0 then
      perform public.notify_flat(b.flat_id, null, 'bills', b.title || ' is overdue',
        'It was due on ' || to_char(b.due_date, 'FMDD Mon') || '. Nobody has marked it paid.', 'bill:' || b.id);
      sent := sent + 1;
    end if;
  end loop;
  return sent;
end $$;

select cron.schedule('flatapp-bill-reminders', '30 3 * * *', $$select public.send_bill_reminders()$$);

-- ================================================================== dinner
create type public.dinner_choice as enum ('home', 'out', 'online', 'skip');

create table public.dinner_status (
  flat_id uuid not null references public.flats (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  choice public.dinner_choice not null,
  note text check (char_length(note) <= 80),
  updated_at timestamptz not null default now(),
  primary key (flat_id, user_id, day)
);

create table public.dinner_joins (
  flat_id uuid not null references public.flats (id) on delete cascade,
  day date not null,
  host_id uuid not null references auth.users (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (flat_id, day, host_id, user_id)
);

-- p_choice null = back to "Not decided".
create function public.set_dinner(p_flat uuid, p_choice public.dinner_choice, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  d date;
  label text;
begin
  if not public.is_flat_member(p_flat) then raise exception 'You are not in this flat' using errcode = '42501'; end if;
  d := public.dinner_day(p_flat);
  if p_choice is null then
    delete from public.dinner_status where flat_id = p_flat and user_id = me and day = d;
    delete from public.dinner_joins where flat_id = p_flat and day = d and host_id = me;
    return;
  end if;
  insert into public.dinner_status (flat_id, user_id, day, choice, note, updated_at)
  values (p_flat, me, d, p_choice, nullif(left(trim(coalesce(p_note, '')), 80), ''), now())
  on conflict (flat_id, user_id, day) do update set choice = excluded.choice, note = excluded.note, updated_at = now();
  if p_choice <> 'online' then
    delete from public.dinner_joins where flat_id = p_flat and day = d and host_id = me;
  end if;
  label := case p_choice when 'home' then 'eating at home' when 'out' then 'eating out'
                         when 'online' then 'ordering online' else 'not eating' end;
  perform public.notify_flat(p_flat, me, 'dinner', public.display_name(me) || ': ' || label,
    nullif(left(trim(coalesce(p_note, '')), 80), ''), 'dinner');
end $$;

create function public.toggle_dinner_join(p_flat uuid, p_host uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  d date;
begin
  if not public.is_flat_member(p_flat) then raise exception 'You are not in this flat' using errcode = '42501'; end if;
  d := public.dinner_day(p_flat);
  if not exists (select 1 from public.dinner_status where flat_id = p_flat and user_id = p_host and day = d and choice = 'online') then
    raise exception 'That order is not open any more' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.dinner_joins where flat_id = p_flat and day = d and host_id = p_host and user_id = me) then
    delete from public.dinner_joins where flat_id = p_flat and day = d and host_id = p_host and user_id = me;
    return false;
  end if;
  insert into public.dinner_joins (flat_id, day, host_id, user_id) values (p_flat, d, p_host, me);
  insert into public.notifications (flat_id, user_id, actor_id, kind, title, target)
  select p_flat, p_host, me, 'dinner', public.display_name(me) || ' joined your order', 'dinner'
  where coalesce((select dinner from public.notification_prefs where user_id = p_host), true);
  return true;
end $$;

-- ================================================================== buy list
create type public.buy_status as enum ('open', 'bought', 'cancelled');

create table public.buy_items (
  id uuid primary key default gen_random_uuid(),
  flat_id uuid not null references public.flats (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  est_cost numeric(10, 2) check (est_cost >= 0),
  note text check (char_length(note) <= 300),
  deadline date,
  status public.buy_status not null default 'open',
  final_amount numeric(10, 2) check (final_amount >= 0),
  proposed_by uuid not null references auth.users (id),
  closed_by uuid references auth.users (id),
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
create index buy_items_flat_idx on public.buy_items (flat_id, created_at desc);

create table public.buy_votes (
  item_id uuid not null references public.buy_items (id) on delete cascade,
  flat_id uuid not null references public.flats (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  vote_in boolean not null,
  updated_at timestamptz not null default now(),
  primary key (item_id, user_id)
);

create function public.propose_buy(p_flat uuid, p_name text, p_cost numeric, p_note text, p_deadline date)
returns public.buy_items
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  item public.buy_items;
begin
  if not public.is_flat_member(p_flat) then raise exception 'You are not in this flat' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Say what to buy' using errcode = '22023'; end if;
  insert into public.buy_items (flat_id, name, est_cost, note, deadline, proposed_by)
  values (p_flat, trim(p_name), p_cost, nullif(trim(coalesce(p_note, '')), ''), p_deadline, me)
  returning * into item;
  -- The proposer is in by default; they can change it.
  insert into public.buy_votes (item_id, flat_id, user_id, vote_in) values (item.id, p_flat, me, true);
  perform public.notify_flat(p_flat, me, 'buy',
    public.display_name(me) || ' proposed ' || item.name || coalesce(' (Rs ' || trim(to_char(item.est_cost, 'FM9,99,99,990')) || ')', ''),
    'Vote In or Out.', 'buy');
  return item;
end $$;

-- p_in null clears your vote.
create function public.vote_buy(p_item uuid, p_in boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  item public.buy_items;
begin
  select * into item from public.buy_items where id = p_item;
  if not found or not public.is_flat_member(item.flat_id) then raise exception 'Item not found' using errcode = 'P0002'; end if;
  if item.status <> 'open' then raise exception 'Voting on this item has closed' using errcode = '22023'; end if;
  if p_in is null then
    delete from public.buy_votes where item_id = p_item and user_id = auth.uid();
  else
    insert into public.buy_votes (item_id, flat_id, user_id, vote_in, updated_at)
    values (p_item, item.flat_id, auth.uid(), p_in, now())
    on conflict (item_id, user_id) do update set vote_in = excluded.vote_in, updated_at = now();
  end if;
end $$;

create function public.close_buy(p_item uuid, p_status public.buy_status, p_final numeric default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  item public.buy_items;
  ins text;
begin
  select * into item from public.buy_items where id = p_item for update;
  if not found or not public.is_flat_member(item.flat_id) then raise exception 'Item not found' using errcode = 'P0002'; end if;
  if item.proposed_by <> me and not public.is_flat_admin(item.flat_id) then
    raise exception 'Only whoever proposed it, or an admin, can close it' using errcode = '42501';
  end if;
  if p_status = 'open' or item.status <> 'open' then raise exception 'This item is already closed' using errcode = '22023'; end if;
  update public.buy_items set status = p_status, final_amount = p_final, closed_by = me, closed_at = now() where id = p_item;
  select string_agg(public.display_name(v.user_id), ', ' order by v.updated_at) into ins
  from public.buy_votes v where v.item_id = p_item and v.vote_in;
  perform public.notify_flat(item.flat_id, me, 'buy',
    item.name || case when p_status = 'bought' then ' was bought' else ' was cancelled' end,
    case when p_status = 'bought' then 'Split in GPay with: ' || coalesce(ins, 'nobody voted In') end, 'buy');
end $$;

-- ================================================================== presence
create table public.presence (
  flat_id uuid not null references public.flats (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  state text check (state in ('home', 'out')),
  since timestamptz,
  sharing boolean not null default true,
  manual text check (manual in ('late', 'away')),
  manual_note text check (char_length(manual_note) <= 80),
  manual_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (flat_id, user_id)
);

-- Called by the phone's geofence (or the app on open). Only Home or Out is ever stored.
create function public.report_presence(p_flat uuid, p_state text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  row_ public.presence;
begin
  if not public.is_flat_member(p_flat) then raise exception 'You are not in this flat' using errcode = '42501'; end if;
  if p_state not in ('home', 'out') then raise exception 'Unknown state' using errcode = '22023'; end if;
  select * into row_ from public.presence where flat_id = p_flat and user_id = me;
  if found and not row_.sharing then return; end if;
  if found and row_.state = p_state then
    update public.presence set updated_at = now() where flat_id = p_flat and user_id = me;
    return;
  end if;
  insert into public.presence (flat_id, user_id, state, since, updated_at)
  values (p_flat, me, p_state, now(), now())
  on conflict (flat_id, user_id) do update set state = excluded.state, since = now(), updated_at = now(),
    manual = case when excluded.state = 'home' then null else public.presence.manual end;
  perform public.notify_flat(p_flat, me, 'presence',
    public.display_name(me) || case when p_state = 'home' then ' got home' else ' left home' end, null, 'presence');
end $$;

-- p_manual null clears it; 'late' = coming late, 'away' = away for days.
create function public.set_presence_status(p_flat uuid, p_manual text, p_note text default null, p_until timestamptz default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_flat_member(p_flat) then raise exception 'You are not in this flat' using errcode = '42501'; end if;
  if p_manual is not null and p_manual not in ('late', 'away') then raise exception 'Unknown status' using errcode = '22023'; end if;
  insert into public.presence (flat_id, user_id, manual, manual_note, manual_until, updated_at)
  values (p_flat, auth.uid(), p_manual, nullif(left(trim(coalesce(p_note, '')), 80), ''), p_until, now())
  on conflict (flat_id, user_id) do update set manual = excluded.manual, manual_note = excluded.manual_note,
    manual_until = excluded.manual_until, updated_at = now();
end $$;

create function public.set_presence_sharing(p_flat uuid, p_sharing boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_flat_member(p_flat) then raise exception 'You are not in this flat' using errcode = '42501'; end if;
  insert into public.presence (flat_id, user_id, sharing, updated_at)
  values (p_flat, auth.uid(), p_sharing, now())
  on conflict (flat_id, user_id) do update set sharing = excluded.sharing, updated_at = now(),
    -- Stopping sharing also forgets the last state, so nobody sees a stale "Home".
    state = case when excluded.sharing then public.presence.state else null end,
    since = case when excluded.sharing then public.presence.since else null end;
end $$;

-- ================================================================== flat info, contacts, documents
create table public.flat_info (
  flat_id uuid primary key references public.flats (id) on delete cascade,
  owner_name text check (char_length(owner_name) <= 60),
  owner_phone text check (char_length(owner_phone) <= 20),
  rent_amount numeric(10, 2) check (rent_amount >= 0),
  rent_due_day smallint check (rent_due_day between 1 and 31),
  pay_note text check (char_length(pay_note) <= 200),
  wifi_name text check (char_length(wifi_name) <= 60),
  wifi_password text check (char_length(wifi_password) <= 63),
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);

create function public.stamp_flat_info() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;
create trigger flat_info_stamp before insert or update on public.flat_info
  for each row execute function public.stamp_flat_info();

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  flat_id uuid not null references public.flats (id) on delete cascade,
  role text not null check (char_length(role) between 1 and 30),
  name text not null check (char_length(name) between 1 and 40),
  phone text not null check (char_length(phone) between 3 and 20),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  flat_id uuid not null references public.flats (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  storage_path text not null unique,
  size_bytes bigint,
  mime text,
  uploaded_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);

-- Private bucket; files live under <flat_id>/..., readable and writable by that flat's members.
insert into storage.buckets (id, name, public, file_size_limit)
values ('flat-docs', 'flat-docs', false, 10485760)
on conflict (id) do nothing;

create function public.is_member_of_folder(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  folder text := split_part(p_name, '/', 1);
begin
  if folder !~ '^[0-9a-f-]{36}$' then return false; end if;
  return public.is_flat_member(folder::uuid);
end $$;

create policy "flat members read their documents" on storage.objects
  for select to authenticated using (bucket_id = 'flat-docs' and public.is_member_of_folder(name));
create policy "flat members upload documents" on storage.objects
  for insert to authenticated with check (bucket_id = 'flat-docs' and public.is_member_of_folder(name));
create policy "flat members delete documents" on storage.objects
  for delete to authenticated using (bucket_id = 'flat-docs' and public.is_member_of_folder(name));

-- ================================================================== notices
create table public.notices (
  id uuid primary key default gen_random_uuid(),
  flat_id uuid not null references public.flats (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  pinned boolean not null default false,
  author_id uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);
create index notices_flat_idx on public.notices (flat_id, created_at desc);

create function public.post_notice(p_flat uuid, p_body text) returns public.notices
language plpgsql security definer set search_path = '' as $$
declare
  n public.notices;
begin
  if not public.is_flat_member(p_flat) then raise exception 'You are not in this flat' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_body, ''))) = 0 then raise exception 'Write something first' using errcode = '22023'; end if;
  insert into public.notices (flat_id, body, author_id) values (p_flat, trim(p_body), auth.uid()) returning * into n;
  perform public.notify_flat(p_flat, auth.uid(), 'notices', public.display_name(auth.uid()) || ' posted a notice', left(n.body, 140), 'notices');
  return n;
end $$;

create function public.pin_notice(p_notice uuid, p_pinned boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  n public.notices;
begin
  select * into n from public.notices where id = p_notice;
  if not found or not public.is_flat_member(n.flat_id) then raise exception 'Notice not found' using errcode = 'P0002'; end if;
  if n.author_id <> auth.uid() and not public.is_flat_admin(n.flat_id) then
    raise exception 'Only the author or an admin can pin it' using errcode = '42501';
  end if;
  update public.notices set pinned = p_pinned where id = p_notice;
end $$;

-- ================================================================== polls
create table public.polls (
  id uuid primary key default gen_random_uuid(),
  flat_id uuid not null references public.flats (id) on delete cascade,
  question text not null check (char_length(question) between 1 and 120),
  closes_at timestamptz,
  closed boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls (id) on delete cascade,
  flat_id uuid not null references public.flats (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 60),
  position smallint not null
);

create table public.poll_votes (
  poll_id uuid not null references public.polls (id) on delete cascade,
  option_id uuid not null references public.poll_options (id) on delete cascade,
  flat_id uuid not null references public.flats (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  voted_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

create function public.create_poll(p_flat uuid, p_question text, p_options text[], p_closes_at timestamptz default null)
returns public.polls
language plpgsql security definer set search_path = '' as $$
declare
  p public.polls;
  opts text[];
begin
  if not public.is_flat_member(p_flat) then raise exception 'You are not in this flat' using errcode = '42501'; end if;
  select array_agg(trim(o)) into opts from unnest(p_options) o where char_length(trim(o)) > 0;
  if char_length(trim(coalesce(p_question, ''))) = 0 then raise exception 'Ask a question' using errcode = '22023'; end if;
  if coalesce(array_length(opts, 1), 0) < 2 or array_length(opts, 1) > 6 then
    raise exception 'Give 2 to 6 answers' using errcode = '22023';
  end if;
  insert into public.polls (flat_id, question, closes_at, created_by) values (p_flat, trim(p_question), p_closes_at, auth.uid())
  returning * into p;
  insert into public.poll_options (poll_id, flat_id, label, position)
  select p.id, p_flat, o, ord::smallint from unnest(opts) with ordinality as t(o, ord);
  perform public.notify_flat(p_flat, auth.uid(), 'notices', public.display_name(auth.uid()) || ' started a poll', p.question, 'polls');
  return p;
end $$;

-- p_option null removes your vote.
create function public.vote_poll(p_poll uuid, p_option uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.polls;
begin
  select * into p from public.polls where id = p_poll;
  if not found or not public.is_flat_member(p.flat_id) then raise exception 'Poll not found' using errcode = 'P0002'; end if;
  if p.closed or (p.closes_at is not null and p.closes_at < now()) then raise exception 'This poll has closed' using errcode = '22023'; end if;
  if p_option is null then
    delete from public.poll_votes where poll_id = p_poll and user_id = auth.uid();
    return;
  end if;
  if not exists (select 1 from public.poll_options where id = p_option and poll_id = p_poll) then
    raise exception 'That answer is not in this poll' using errcode = '22023';
  end if;
  insert into public.poll_votes (poll_id, option_id, flat_id, user_id) values (p_poll, p_option, p.flat_id, auth.uid())
  on conflict (poll_id, user_id) do update set option_id = excluded.option_id, voted_at = now();
end $$;

create function public.close_poll(p_poll uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.polls;
begin
  select * into p from public.polls where id = p_poll;
  if not found or not public.is_flat_member(p.flat_id) then raise exception 'Poll not found' using errcode = 'P0002'; end if;
  if p.created_by <> auth.uid() and not public.is_flat_admin(p.flat_id) then
    raise exception 'Only whoever started it, or an admin, can close it' using errcode = '42501';
  end if;
  update public.polls set closed = true where id = p_poll;
end $$;

-- ================================================================== repairs
create table public.repairs (
  id uuid primary key default gen_random_uuid(),
  flat_id uuid not null references public.flats (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  details text check (char_length(details) <= 500),
  status text not null default 'open' check (status in ('open', 'fixed')),
  reported_by uuid not null default auth.uid() references auth.users (id),
  fixed_by uuid references auth.users (id),
  fixed_at timestamptz,
  created_at timestamptz not null default now()
);

create function public.report_repair(p_flat uuid, p_title text, p_details text) returns public.repairs
language plpgsql security definer set search_path = '' as $$
declare
  r public.repairs;
begin
  if not public.is_flat_member(p_flat) then raise exception 'You are not in this flat' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_title, ''))) = 0 then raise exception 'Say what broke' using errcode = '22023'; end if;
  insert into public.repairs (flat_id, title, details, reported_by)
  values (p_flat, trim(p_title), nullif(trim(coalesce(p_details, '')), ''), auth.uid()) returning * into r;
  perform public.notify_flat(p_flat, auth.uid(), 'notices', public.display_name(auth.uid()) || ' reported a repair', r.title, 'repairs');
  return r;
end $$;

create function public.fix_repair(p_repair uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.repairs;
begin
  select * into r from public.repairs where id = p_repair;
  if not found or not public.is_flat_member(r.flat_id) then raise exception 'Repair not found' using errcode = 'P0002'; end if;
  if r.status = 'fixed' then return; end if;
  update public.repairs set status = 'fixed', fixed_by = auth.uid(), fixed_at = now() where id = p_repair;
  perform public.notify_flat(r.flat_id, auth.uid(), 'notices', public.display_name(auth.uid()) || ' marked a repair fixed', r.title, 'repairs');
end $$;

-- Someone joining is news for the whole flat.
create or replace function public.join_flat(p_code text) returns public.flats
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  flat public.flats;
begin
  if me is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  select * into flat from public.flats f where f.invite_code = upper(trim(coalesce(p_code, '')));
  if not found then raise exception 'No flat has that invite code' using errcode = 'P0002'; end if;

  perform pg_advisory_xact_lock(hashtextextended('flatapp:' || me::text, 0));
  if public.has_flat_named(me, flat.name, flat.id) then
    raise exception 'You are already in another flat called %. Ask an admin to rename one of them first.', flat.name
      using errcode = '23505';
  end if;
  if public.is_flat_member(flat.id) then return flat; end if;

  insert into public.flat_members (flat_id, user_id, role)
  values (flat.id, me, 'member')
  on conflict (flat_id, user_id) do update set left_at = null, joined_at = now()
    where public.flat_members.left_at is not null;
  perform public.notify_flat(flat.id, me, 'notices', public.display_name(me) || ' joined ' || flat.name, null, 'members');
  return flat;
end $$;

-- ================================================================== row-level security
alter table public.notification_prefs enable row level security;
alter table public.notifications enable row level security;
alter table public.dinner_status enable row level security;
alter table public.dinner_joins enable row level security;
alter table public.buy_items enable row level security;
alter table public.buy_votes enable row level security;
alter table public.presence enable row level security;
alter table public.flat_info enable row level security;
alter table public.contacts enable row level security;
alter table public.documents enable row level security;
alter table public.notices enable row level security;
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
alter table public.repairs enable row level security;

create policy "own prefs" on public.notification_prefs for select to authenticated using (user_id = auth.uid());
create policy "own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "members see dinner" on public.dinner_status for select to authenticated using (public.is_flat_member(flat_id));
create policy "members see dinner joins" on public.dinner_joins for select to authenticated using (public.is_flat_member(flat_id));
create policy "members see buy items" on public.buy_items for select to authenticated using (public.is_flat_member(flat_id));
create policy "members see buy votes" on public.buy_votes for select to authenticated using (public.is_flat_member(flat_id));
create policy "members see presence" on public.presence for select to authenticated using (public.is_flat_member(flat_id));
create policy "members see flat info" on public.flat_info for select to authenticated using (public.is_flat_member(flat_id));
create policy "members add flat info" on public.flat_info for insert to authenticated with check (public.is_flat_member(flat_id));
create policy "members edit flat info" on public.flat_info for update to authenticated
  using (public.is_flat_member(flat_id)) with check (public.is_flat_member(flat_id));
create policy "members see contacts" on public.contacts for select to authenticated using (public.is_flat_member(flat_id));
create policy "members add contacts" on public.contacts for insert to authenticated
  with check (public.is_flat_member(flat_id) and created_by = auth.uid());
create policy "members delete contacts" on public.contacts for delete to authenticated using (public.is_flat_member(flat_id));
create policy "members see documents" on public.documents for select to authenticated using (public.is_flat_member(flat_id));
create policy "members add documents" on public.documents for insert to authenticated
  with check (public.is_flat_member(flat_id) and uploaded_by = auth.uid() and split_part(storage_path, '/', 1) = flat_id::text);
create policy "uploader or admin deletes documents" on public.documents for delete to authenticated
  using (public.is_flat_member(flat_id) and (uploaded_by = auth.uid() or public.is_flat_admin(flat_id)));
create policy "members see notices" on public.notices for select to authenticated using (public.is_flat_member(flat_id));
create policy "author or admin deletes notices" on public.notices for delete to authenticated
  using (public.is_flat_member(flat_id) and (author_id = auth.uid() or public.is_flat_admin(flat_id)));
create policy "members see polls" on public.polls for select to authenticated using (public.is_flat_member(flat_id));
create policy "members see poll options" on public.poll_options for select to authenticated using (public.is_flat_member(flat_id));
create policy "members see poll votes" on public.poll_votes for select to authenticated using (public.is_flat_member(flat_id));
create policy "members see repairs" on public.repairs for select to authenticated using (public.is_flat_member(flat_id));

-- ================================================================== grants
revoke all on public.notification_prefs, public.notifications, public.dinner_status, public.dinner_joins,
  public.buy_items, public.buy_votes, public.presence, public.flat_info, public.contacts, public.documents,
  public.notices, public.polls, public.poll_options, public.poll_votes, public.repairs
  from anon, authenticated;

grant select on public.notification_prefs, public.notifications, public.dinner_status, public.dinner_joins,
  public.buy_items, public.buy_votes, public.presence, public.flat_info, public.contacts, public.documents,
  public.notices, public.polls, public.poll_options, public.poll_votes, public.repairs
  to authenticated;
grant insert (flat_id, owner_name, owner_phone, rent_amount, rent_due_day, pay_note, wifi_name, wifi_password),
  update (owner_name, owner_phone, rent_amount, rent_due_day, pay_note, wifi_name, wifi_password)
  on public.flat_info to authenticated;
grant insert (flat_id, role, name, phone), delete on public.contacts to authenticated;
grant insert (flat_id, title, storage_path, size_bytes, mime), delete on public.documents to authenticated;
grant delete on public.notices to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.mark_notifications_read(uuid),
  public.save_notification_prefs(boolean, boolean, boolean, boolean, boolean),
  public.mark_bill(uuid, boolean, text),
  public.set_dinner(uuid, public.dinner_choice, text),
  public.toggle_dinner_join(uuid, uuid),
  public.dinner_day(uuid),
  public.propose_buy(uuid, text, numeric, text, date),
  public.vote_buy(uuid, boolean),
  public.close_buy(uuid, public.buy_status, numeric),
  public.report_presence(uuid, text),
  public.set_presence_status(uuid, text, text, timestamptz),
  public.set_presence_sharing(uuid, boolean),
  public.post_notice(uuid, text),
  public.pin_notice(uuid, boolean),
  public.create_poll(uuid, text, text[], timestamptz),
  public.vote_poll(uuid, uuid),
  public.close_poll(uuid),
  public.report_repair(uuid, text, text),
  public.fix_repair(uuid),
  public.join_flat(text),
  -- used inside the storage policies, which run as the signed-in user
  public.is_member_of_folder(text)
to authenticated;

-- ================================================================== realtime
alter publication supabase_realtime add table
  public.notifications, public.dinner_status, public.dinner_joins, public.buy_items, public.buy_votes,
  public.presence, public.notices, public.polls, public.poll_votes, public.repairs, public.flat_info,
  public.contacts, public.documents;
