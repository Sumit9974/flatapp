-- FlatApp: phone push notifications, plus a fix for proposing a buy without a cost or deadline.
--
-- Push: each phone registers its Firebase (FCM) token. Every insert into public.notifications —
-- dinner changes, bill marks and reminders, buy list, notices, polls, repairs, members — is also
-- sent to the recipients' phones by the `push` Edge Function. The database calls the function once
-- per insert statement through pg_net, which is asynchronous: a slow or failing Firebase never
-- slows or fails the change that caused the notification. The call carries a shared secret that
-- lives only in Vault; the function reads it back from Vault to check the caller.

create extension if not exists pg_net with schema extensions;

-- ================================================================== device tokens
create table public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null default 'android' check (platform in ('android', 'ios')),
  updated_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);
-- Closed to clients: only the functions below read or write it.
alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;

-- A phone belongs to whoever signed in on it last, so the token moves with them.
create function public.register_push_token(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if p_token is null or char_length(p_token) not between 20 and 4096 then
    raise exception 'That is not a push token' using errcode = '22023';
  end if;
  insert into public.push_tokens (token, user_id, updated_at) values (p_token, auth.uid(), now())
  on conflict (token) do update set user_id = excluded.user_id, updated_at = now();
end $$;

-- On sign-out: this phone stops getting this person's notifications.
create function public.unregister_push_token(p_token text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
$$;

-- "Send a test" in Settings: one notification to yourself, pushed like any other.
create function public.send_test_notification(p_flat uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_flat_member(p_flat) then raise exception 'You are not in this flat' using errcode = '42501'; end if;
  insert into public.notifications (flat_id, user_id, actor_id, kind, title, body, target)
  values (p_flat, auth.uid(), null, 'notices', 'Test notification', 'Phone notifications are working.', null);
end $$;

-- ================================================================== the call to the Edge Function
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'push_webhook_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'push_webhook_secret',
      'Shared secret: database trigger -> push Edge Function');
  end if;
end $$;

create function public.push_new_notifications() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  messages jsonb;
  secret text;
begin
  -- One message per (notification, phone). FCM data values must all be strings.
  select coalesce(jsonb_agg(jsonb_build_object(
           'token', t.token,
           'title', n.title,
           'body', coalesce(nullif(n.body, ''), f.name),
           'data', jsonb_build_object(
             'notification_id', n.id::text,
             'flat_id', n.flat_id::text,
             'kind', n.kind,
             'target', coalesce(n.target, '')))), '[]'::jsonb)
    into messages
  from new_rows n
  join public.push_tokens t on t.user_id = n.user_id
  join public.flats f on f.id = n.flat_id;

  if jsonb_array_length(messages) = 0 then return null; end if;

  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_webhook_secret';
  perform net.http_post(
    url := 'https://ficuxluywyeerxygillb.supabase.co/functions/v1/push',
    body := jsonb_build_object('messages', messages),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', secret),
    timeout_milliseconds := 15000);
  return null;
end $$;

create trigger notifications_push
  after insert on public.notifications
  referencing new table as new_rows
  for each statement execute function public.push_new_notifications();

-- ================================================================== fix: propose a buy
-- Cost, note and deadline are optional in the app, which leaves them out of the call. Without
-- defaults no function matched and the server answered 404. Same body, now with defaults.
create or replace function public.propose_buy(p_flat uuid, p_name text, p_cost numeric default null,
  p_note text default null, p_deadline date default null)
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

-- ================================================================== grants
-- New functions are executable by everyone by default on Supabase; close them, then open the
-- three the app calls.
revoke execute on function
  public.register_push_token(text),
  public.unregister_push_token(text),
  public.send_test_notification(uuid),
  public.push_new_notifications()
from public, anon, authenticated;
grant execute on function
  public.register_push_token(text),
  public.unregister_push_token(text),
  public.send_test_notification(uuid)
to authenticated;
