-- FlatApp: unique flat names per person, and admins can delete a flat with all its data.
--
-- Why: on 2026-11-21 a double tap on "Create flat" made two flats with the same name for one person.
-- The user's rule: a person must never end up with two flats of the same name. It is per person, not
-- global, so two unrelated flat groups can both call theirs "Home". An advisory lock per user makes
-- create/join one-at-a-time, so a double tap cannot race past the check.
-- Delete: the admin asked to be able to delete the flat and its data. It cascades to members,
-- categories, recurring bills, bills and bill history; the caller must type the flat's name.

create or replace function public.has_flat_named(p_user uuid, p_name text, p_except uuid default null)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.flat_members m
    join public.flats f on f.id = m.flat_id
    where m.user_id = p_user
      and m.left_at is null
      and lower(f.name) = lower(trim(p_name))
      and (p_except is null or f.id <> p_except)
  );
$$;

create or replace function public.create_flat(p_name text) returns public.flats
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  flat public.flats;
begin
  if me is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  if char_length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Give the flat a name' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended('flatapp:' || me::text, 0));
  if public.has_flat_named(me, p_name) then
    raise exception 'You already have a flat called %', trim(p_name) using errcode = '23505';
  end if;

  insert into public.flats (name, invite_code, created_by)
  values (trim(p_name), public.new_invite_code(), me)
  returning * into flat;

  insert into public.flat_members (flat_id, user_id, role) values (flat.id, me, 'admin');

  insert into public.bill_categories (flat_id, name, is_builtin)
  select flat.id, n, true
  from unnest(array['Light bill', 'WiFi', 'Gas', 'Rent', 'Water', 'Grocery', 'Maintenance']) as n;

  return flat;
end $$;

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

  insert into public.flat_members (flat_id, user_id, role)
  values (flat.id, me, 'member')
  on conflict (flat_id, user_id) do update set left_at = null, joined_at = now()
    where public.flat_members.left_at is not null;
  return flat;
end $$;

create or replace function public.rename_flat(p_flat uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_flat_admin(p_flat) then raise exception 'Only an admin can do that' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Give the flat a name' using errcode = '22023'; end if;
  if exists (
    select 1 from public.flat_members m
    where m.flat_id = p_flat and m.left_at is null and public.has_flat_named(m.user_id, p_name, p_flat)
  ) then
    raise exception 'Someone in this flat already has another flat called %', trim(p_name) using errcode = '23505';
  end if;
  update public.flats set name = trim(p_name) where id = p_flat;
end $$;

-- Deletes the flat and everything in it, for everyone. The name must be typed back as confirmation.
create function public.delete_flat(p_flat uuid, p_confirm_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  flat_name text;
begin
  if not public.is_flat_admin(p_flat) then raise exception 'Only an admin can delete the flat' using errcode = '42501'; end if;
  select name into flat_name from public.flats where id = p_flat;
  if lower(trim(coalesce(p_confirm_name, ''))) <> lower(flat_name) then
    raise exception 'Type the flat name exactly to confirm' using errcode = '22023';
  end if;
  delete from public.flats where id = p_flat;
end $$;

revoke execute on function public.has_flat_named(uuid, text, uuid) from public, anon;
revoke execute on function public.delete_flat(uuid, text) from public, anon;
grant execute on function public.delete_flat(uuid, text) to authenticated;
