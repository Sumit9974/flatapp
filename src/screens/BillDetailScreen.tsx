import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { amountText, Bill, describeHistory, HistoryEntry } from '../bills/model';
import { Icon } from '../components/Icon';
import { Button, Card, Field, Grid, Hint, HStack, LinkButton, Loading, Notice, Row, Screen, Stat, type } from '../components/ui';
import { categoryStyle } from '../data/meta';
import { useCurrentFlat, useFlats } from '../flats/FlatProvider';
import { check, messageOf, unwrap, unwrapMaybe } from '../lib/errors';
import { daysInMonth, formatDateTime, formatDay, formatMonthLong, fromIsoDate, parseAmount, toIsoDate } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useLive } from '../lib/useLive';
import { useNav } from '../nav/NavProvider';
import { colors } from '../theme';

interface Loaded {
  bill: Bill;
  category: string;
  history: HistoryEntry[];
}

export function BillDetailScreen({ id }: { id: string }) {
  const { userId } = useAuth();
  const { role } = useCurrentFlat();
  const { nameOf } = useFlats();
  const { setTitleOverride, back } = useNav();
  const [notice, setNotice] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);
  const [busy, setBusy] = useState<'paid' | 'unpaid' | 'save' | 'delete' | null>(null);
  const [askReason, setAskReason] = useState(false);
  const [reason, setReason] = useState('');
  const [askDeleteReason, setAskDeleteReason] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [editing, setEditing] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  const [dueInput, setDueInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  const live = useLive<Loaded | null>(
    `bill:${id}`,
    async () => {
      const bill = unwrapMaybe(await supabase.from('bills').select('*').eq('id', id).maybeSingle());
      if (bill === null) return null;
      const [cat, history] = await Promise.all([
        supabase.from('bill_categories').select('name').eq('id', bill.category_id).maybeSingle(),
        supabase.from('bill_history').select('*').eq('bill_id', id).order('at', { ascending: false }),
      ]);
      return { bill, category: unwrapMaybe(cat)?.name ?? 'Bill', history: unwrap(history) };
    },
    [
      { table: 'bills', filter: `id=eq.${id}` },
      { table: 'bill_history', filter: `bill_id=eq.${id}` },
    ],
  );

  const category = live.data?.category ?? null;
  useEffect(() => {
    if (category) setTitleOverride(category);
  }, [category, setTitleOverride]);

  if (live.data === null && !live.error) return <Loading />;
  if (live.data === null) {
    return (
      <Screen>
        <Notice message={live.error ?? 'This bill does not exist any more, or you are no longer in its flat.'} tone="error" onDismiss={() => void live.reload()} />
      </Screen>
    );
  }

  const { bill, history } = live.data;
  const c = categoryStyle(live.data.category);
  const month = fromIsoDate(bill.month);
  const todayIso = toIsoDate(new Date());
  const paid = bill.status === 'paid';
  const deleted = bill.deleted_at !== null;
  const deletion = deleted ? history.find((h) => h.action === 'deleted') : undefined;
  // Same rule as the server (delete_bill): whoever added it, or an admin.
  const canDelete = !deleted && (bill.created_by === userId || role === 'admin');
  const overdue = !paid && bill.due_date !== null && bill.due_date < todayIso;
  const dueText = bill.due_date ? `${formatDay(fromIsoDate(bill.due_date))} ${month.getFullYear()}` : 'No due date';

  const mark = async (toPaid: boolean) => {
    if (!toPaid && reason.trim().length === 0) {
      setNotice({ text: 'Say why it is being marked unpaid.', tone: 'error' });
      return;
    }
    setBusy(toPaid ? 'paid' : 'unpaid');
    setNotice(null);
    try {
      const { data: updated, error } = await supabase.rpc('mark_bill', { p_bill: bill.id, p_paid: toPaid, p_reason: toPaid ? undefined : reason.trim() });
      if (error) throw error;
      if (toPaid && updated.marked_by !== userId) {
        setNotice({ text: `${nameOf(updated.marked_by)} had already marked it paid.`, tone: 'info' });
      } else {
        setNotice({ text: toPaid ? 'Marked paid. Everyone in the flat gets a notification.' : 'Marked unpaid.', tone: 'info' });
      }
      setAskReason(false);
      setReason('');
      await live.reload();
    } catch (e: unknown) {
      setNotice({ text: messageOf(e), tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  // A deleted bill is hidden, not erased: its history stays, and a recurring month is not re-created.
  const remove = async (why: string | null) => {
    setBusy('delete');
    setNotice(null);
    try {
      const { error } = await supabase.rpc('delete_bill', { p_bill: bill.id, p_reason: why ?? undefined });
      if (error) throw error;
      back();
    } catch (e: unknown) {
      setNotice({ text: messageOf(e), tone: 'error' });
      setBusy(null);
    }
  };

  // A paid bill needs a reason, like marking it unpaid does; an unpaid one just a confirmation.
  const startDelete = () => {
    if (paid) {
      setDeleteReason('');
      setAskDeleteReason(true);
      return;
    }
    Alert.alert(`Delete ${bill.title}?`, 'It disappears from Bills for everyone. Its history is kept, and the flat is told.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void remove(null) },
    ]);
  };

  const confirmPaidDelete = () => {
    if (deleteReason.trim().length === 0) {
      setNotice({ text: 'Say why a paid bill is being deleted.', tone: 'error' });
      return;
    }
    void remove(deleteReason.trim());
  };

  const startEdit = () => {
    setAmountInput(bill.amount === null ? '' : String(bill.amount));
    setDueInput(bill.due_date === null ? '' : String(fromIsoDate(bill.due_date).getDate()));
    setNoteInput(bill.note ?? '');
    setEditError(null);
    setEditing(true);
  };

  const save = async () => {
    const amount = parseAmount(amountInput);
    if (Number.isNaN(amount)) {
      setEditError('Amount must be a number, with at most 2 decimals.');
      return;
    }
    let due: string | null = null;
    if (dueInput.trim() !== '') {
      const day = Number(dueInput.trim());
      if (!Number.isInteger(day) || day < 1 || day > daysInMonth(month)) {
        setEditError(`Due day must be from 1 to ${daysInMonth(month)}.`);
        return;
      }
      due = toIsoDate(new Date(month.getFullYear(), month.getMonth(), day));
    }
    setBusy('save');
    try {
      check(await supabase.from('bills').update({ amount, due_date: due, note: noteInput.trim() || null }).eq('id', bill.id));
      setEditing(false);
      setNotice({ text: 'Saved. The change is in the history.', tone: 'info' });
      await live.reload();
    } catch (e: unknown) {
      setEditError(messageOf(e));
    } finally {
      setBusy(null);
    }
  };

  const statusColor = paid ? colors.good : overdue ? colors.bad : colors.warn;

  return (
    <Screen onRefresh={live.onRefresh} refreshing={live.refreshing}>
      {notice ? <Notice message={notice.text} tone={notice.tone} onDismiss={() => setNotice(null)} /> : null}

      <Card>
        <HStack gap={10}>
          <View style={[styles.cat, { backgroundColor: c.bg }]}>
            <Icon name={c.icon} size={22} color={c.fg} />
          </View>
          <View style={styles.flex}>
            <Text style={type.smallStrong}>{`${live.data.category} · ${bill.template_id ? 'Recurring' : 'One-off'}`}</Text>
            <Text style={type.title}>{bill.title}</Text>
          </View>
        </HStack>
        <Text style={type.big}>{bill.amount === null ? 'No amount' : amountText(bill.amount)}</Text>
        <Grid columns={2} gap={8}>
          <Stat label="Due" value={dueText} />
          <Stat label="Month" value={formatMonthLong(month)} />
        </Grid>
        {bill.note ? <Hint>{bill.note}</Hint> : null}
      </Card>

      {deleted ? (
        <Card tone="bad">
          <Text style={[styles.statusWord, { color: colors.bad }]}>Deleted</Text>
          <Text style={type.body}>
            {`Deleted by ${nameOf(bill.deleted_by)}, ${formatDateTime(new Date(bill.deleted_at ?? deletion?.at ?? ''))}.${deletion?.reason ? ` Reason: ${deletion.reason}` : ''}`}
          </Text>
          <Hint>{`It is no longer in Bills. ${paid ? `It had been marked paid by ${nameOf(bill.marked_by)}.` : 'It was unpaid.'}`}</Hint>
        </Card>
      ) : null}

      {!deleted ? (
      <Card tone={paid ? 'good' : overdue ? 'bad' : 'warn'}>
        <View>
          <Text style={[styles.statusWord, { color: statusColor }]}>{paid ? 'Paid' : overdue ? 'Overdue' : 'Unpaid'}</Text>
          <Text style={type.body}>
            {paid && bill.marked_at
              ? `Marked paid by ${nameOf(bill.marked_by)}, ${formatDateTime(new Date(bill.marked_at))}`
              : overdue
                ? `It was due on ${formatDay(fromIsoDate(bill.due_date ?? todayIso))}. Nobody has marked it paid yet.`
                : bill.due_date
                  ? `Due on ${formatDay(fromIsoDate(bill.due_date))}.`
                  : 'No due date.'}
          </Text>
        </View>
        {!paid ? (
          <>
            <Button label="Mark paid" icon="check" onPress={() => void mark(true)} busy={busy === 'paid'} />
            <Hint>Everyone in the flat sees who marked it, and when.</Hint>
          </>
        ) : askReason ? (
          <>
            <Field label="Why is it unpaid?" value={reason} onChangeText={setReason} maxLength={200} placeholder="For example: payment failed" />
            <Grid columns={2} gap={8}>
              <Button label="Cancel" variant="secondary" onPress={() => setAskReason(false)} />
              <Button label="Mark unpaid" variant="danger" onPress={() => void mark(false)} busy={busy === 'unpaid'} />
            </Grid>
          </>
        ) : (
          <Button label="Mark unpaid" variant="secondary" onPress={() => setAskReason(true)} />
        )}
      </Card>
      ) : null}

      {!deleted ? (
      <Card title="Details" action={editing ? undefined : <LinkButton label="Edit" onPress={startEdit} />}>
        {editing ? (
          <>
            <Grid columns={2} gap={10}>
              <Field label="Amount (₹)" value={amountInput} onChangeText={setAmountInput} keyboardType="decimal-pad" placeholder="Optional" />
              <Field label={`Due day (1-${daysInMonth(month)})`} value={dueInput} onChangeText={setDueInput} keyboardType="number-pad" maxLength={2} placeholder="Optional" />
            </Grid>
            <Field label="Note" value={noteInput} onChangeText={setNoteInput} maxLength={200} multiline placeholder="Optional" />
            {editError ? <Hint tone="error">{editError}</Hint> : null}
            <Grid columns={2} gap={8}>
              <Button label="Cancel" variant="secondary" onPress={() => setEditing(false)} />
              <Button label="Save" onPress={() => void save()} busy={busy === 'save'} />
            </Grid>
          </>
        ) : (
          <>
            <Row label="Amount" value={bill.amount === null ? 'Not set' : amountText(bill.amount)} />
            <Row label="Due date" value={dueText} />
            <Row label="Repeats" value={bill.template_id ? 'Every month' : 'Does not repeat'} />
          </>
        )}
      </Card>
      ) : null}

      <Card title="History">
        {history.map((h, i) => {
          const line = describeHistory(h, nameOf);
          const dot =
            h.action === 'marked_paid'
              ? colors.good
              : h.action === 'marked_unpaid' || h.action === 'deleted'
                ? colors.bad
                : h.action === 'edited'
                  ? colors.primary
                  : '#8A93A6';
          return (
            <View key={h.id} style={[styles.tl, i === 0 && styles.tlFirst]}>
              <View style={[styles.tlDot, { backgroundColor: dot }]} />
              <View style={styles.flex}>
                <Text style={type.body}>{line.text}</Text>
                <Text style={type.tiny}>{line.when}</Text>
              </View>
            </View>
          );
        })}
        <Text style={type.tiny}>History cannot be edited or deleted.</Text>
      </Card>

      {canDelete && askDeleteReason ? (
        <Card tone="danger">
          <Field
            label="Why delete a paid bill?"
            value={deleteReason}
            onChangeText={setDeleteReason}
            maxLength={200}
            placeholder="For example: added twice by mistake"
          />
          <Grid columns={2} gap={8}>
            <Button label="Cancel" variant="secondary" onPress={() => setAskDeleteReason(false)} />
            <Button label="Delete bill" variant="danger" onPress={confirmPaidDelete} busy={busy === 'delete'} />
          </Grid>
          <Hint>It disappears from Bills for everyone. Its history is kept, and the flat is told.</Hint>
        </Card>
      ) : canDelete ? (
        <Button label="Delete bill" icon="trash" variant="dangerGhost" onPress={startDelete} busy={busy === 'delete'} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cat: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  statusWord: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 22 },
  tl: { flexDirection: 'row', gap: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.divider },
  tlFirst: { borderTopColor: 'transparent', paddingTop: 0 },
  tlDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
});
