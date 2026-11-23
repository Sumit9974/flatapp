-- FlatApp: Home/Out that does not get lost or go stale.
--
-- Why:
-- * The phone sent Home/Out once, at the moment it crossed the circle, and forgot it if that call
--   failed. Leaving the flat is exactly when the phone drops off the flat's WiFi, so "Out" was the
--   update most likely to be lost, and the flat then showed "Home" until the next crossing. The app
--   now keeps the last crossing on the phone and sends it again until it lands, so a report can
--   reach the server minutes or hours late. p_at carries the time of the crossing itself, so that:
--     - "since" stays the real time the person left or arrived;
--     - a late report never overwrites a newer state already stored;
--     - a late correction updates the screen without pushing a stale "X left home" to everyone.
-- * Flatmates could not tell a fresh "Home" from one the phone stopped checking days ago (phone off,
--   app stopped by the battery saver). checked_at is the last time this person's phone confirmed
--   their state. The phone re-checks about every 30 minutes and whenever the app opens; the app
--   shows "Not sure" when a phone has been quiet for hours.

alter table public.presence add column checked_at timestamptz;

-- Rows from before this change: their last update is the best "checked" time there is.
update public.presence set checked_at = updated_at where state is not null and checked_at is null;

-- Replaces report_presence(uuid, text). Two-argument calls (older app builds) still work because
-- p_at is optional, but the old signature has to go: next to the new one it would make those calls
-- ambiguous.
drop function public.report_presence(uuid, text);

create function public.report_presence(p_flat uuid, p_state text, p_at timestamptz default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  -- A phone clock running fast must not put a crossing in the future.
  at_ timestamptz := least(coalesce(p_at, now()), now());
  row_ public.presence;
begin
  if not public.is_flat_member(p_flat) then raise exception 'You are not in this flat' using errcode = '42501'; end if;
  if p_state not in ('home', 'out') then raise exception 'Unknown state' using errcode = '22023'; end if;
  select * into row_ from public.presence where flat_id = p_flat and user_id = me for update;
  if found and not row_.sharing then return; end if;

  -- Same state again, or a crossing older than the state already stored: the phone is alive and
  -- nothing changed.
  if found and (row_.state = p_state or (row_.since is not null and at_ < row_.since)) then
    update public.presence set checked_at = now(), updated_at = now() where flat_id = p_flat and user_id = me;
    return;
  end if;

  insert into public.presence (flat_id, user_id, state, since, checked_at, updated_at)
  values (p_flat, me, p_state, at_, now(), now())
  on conflict (flat_id, user_id) do update set state = excluded.state, since = excluded.since,
    checked_at = now(), updated_at = now(),
    manual = case when excluded.state = 'home' then null else public.presence.manual end;

  -- Tell flatmates only while it is news. A crossing that reached the server late (phone was
  -- offline) still updates every screen, just without a push.
  if at_ > now() - interval '45 minutes' then
    perform public.notify_flat(p_flat, me, 'presence',
      public.display_name(me) || case when p_state = 'home' then ' got home' else ' left home' end, null, 'presence');
  end if;
end $$;

-- New functions are executable by everyone by default on Supabase: close it, then open it to
-- signed-in people only.
revoke execute on function public.report_presence(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.report_presence(uuid, text, timestamptz) to authenticated;

notify pgrst, 'reload schema';
