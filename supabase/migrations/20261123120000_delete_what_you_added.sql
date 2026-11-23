-- FlatApp: delete what you added, so a mistake can be undone (the user's request, 2026-11-23).
--
-- Rules (agreed with the user):
-- * Whoever added it, or an admin, may delete it: the same rule notices and documents already follow.
-- * Bills are hidden, not erased (deleted_at). The app promises that every paid/unpaid change stays
--   traceable, and a recurring bill that was erased would come back the next morning: the daily job
--   re-creates any missing month, and UNIQUE (template_id, month) only holds it off while the row
--   exists. The history gets a "deleted" line with who and why, and the flat is notified, since it is
--   money. A paid bill needs a reason, like marking it unpaid does.
-- * Polls, buy list items and repairs are deleted outright, with their votes and answers (their
--   foreign keys cascade). Close, cancel and fixed stay for normal endings; delete is for mistakes.
-- * No time limit. Notices, documents and contacts could already be deleted; nothing changes there.

alter table public.bills
  add column deleted_at timestamptz,
  add column deleted_by uuid references auth.users (id),
  add constraint bills_deleted_pair check ((deleted_at is null) = (deleted_by is null));

alter table public.bill_history drop constraint bill_history_action_check;
alter table public.bill_history add constraint bill_history_action_check
  check (action in ('created', 'marked_paid', 'marked_unpaid', 'edited', 'deleted'));

-- A deleted bill can still be read (its screen explains what happened, and open lists hear the change
-- through Realtime), but no longer edited.
drop policy "members edit bills" on public.bills;
create policy "members edit bills" on public.bills
  for update to authenticated
  using (public.is_flat_member(flat_id) and deleted_at is null)
  with check (public.is_flat_member(flat_id));

-- Same as before, plus: a deleted bill cannot be marked.
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
  if bill.deleted_at is not null then
    raise exception 'This bill was deleted' using errcode = 'P0002';
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

-- Same as before, minus deleted bills.
create or replace function public.send_bill_reminders() returns integer
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
    where bl.status = 'unpaid' and bl.due_date is not null and bl.deleted_at is null
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

create function public.delete_bill(p_bill uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  bill public.bills;
  why text := nullif(left(trim(coalesce(p_reason, '')), 200), '');
begin
  select * into bill from public.bills where id = p_bill for update;
  if not found or not public.is_flat_member(bill.flat_id) then raise exception 'Bill not found' using errcode = 'P0002'; end if;
  if bill.deleted_at is not null then return; end if;
  if bill.created_by <> me and not public.is_flat_admin(bill.flat_id) then
    raise exception 'Only whoever added it, or an admin, can delete it' using errcode = '42501';
  end if;
  if bill.status = 'paid' and why is null then
    raise exception 'Say why a paid bill is being deleted' using errcode = '22023';
  end if;
  update public.bills set deleted_at = now(), deleted_by = me where id = p_bill;
  insert into public.bill_history (bill_id, flat_id, actor_id, action, reason)
  values (bill.id, bill.flat_id, me, 'deleted', why);
  perform public.notify_flat(bill.flat_id, me, 'bills', public.display_name(me) || ' deleted ' || bill.title, why, 'bill:' || bill.id);
end $$;

create function public.delete_poll(p_poll uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.polls;
begin
  select * into p from public.polls where id = p_poll for update;
  if not found or not public.is_flat_member(p.flat_id) then raise exception 'Poll not found' using errcode = 'P0002'; end if;
  if p.created_by <> auth.uid() and not public.is_flat_admin(p.flat_id) then
    raise exception 'Only whoever started it, or an admin, can delete it' using errcode = '42501';
  end if;
  delete from public.polls where id = p_poll;
end $$;

create function public.delete_buy(p_item uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  item public.buy_items;
begin
  select * into item from public.buy_items where id = p_item for update;
  if not found or not public.is_flat_member(item.flat_id) then raise exception 'Item not found' using errcode = 'P0002'; end if;
  if item.proposed_by <> auth.uid() and not public.is_flat_admin(item.flat_id) then
    raise exception 'Only whoever proposed it, or an admin, can delete it' using errcode = '42501';
  end if;
  delete from public.buy_items where id = p_item;
end $$;

create function public.delete_repair(p_repair uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.repairs;
begin
  select * into r from public.repairs where id = p_repair for update;
  if not found or not public.is_flat_member(r.flat_id) then raise exception 'Repair not found' using errcode = 'P0002'; end if;
  if r.reported_by <> auth.uid() and not public.is_flat_admin(r.flat_id) then
    raise exception 'Only whoever reported it, or an admin, can delete it' using errcode = '42501';
  end if;
  delete from public.repairs where id = p_repair;
end $$;

-- New functions are executable by everyone by default on Supabase: close them, then open them to
-- signed-in people only. mark_bill and send_bill_reminders keep their existing grants (replaced in place).
revoke execute on function
  public.delete_bill(uuid, text),
  public.delete_poll(uuid),
  public.delete_buy(uuid),
  public.delete_repair(uuid)
from public, anon, authenticated;
grant execute on function
  public.delete_bill(uuid, text),
  public.delete_poll(uuid),
  public.delete_buy(uuid),
  public.delete_repair(uuid)
to authenticated;

notify pgrst, 'reload schema';
