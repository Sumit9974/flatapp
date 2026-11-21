import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { CategoryPicker } from '../bills/CategoryPicker';
import { Category, loadCategories, Template } from '../bills/model';
import { Button, Card, Field, Grid, Hint, Loading, Screen } from '../components/ui';
import { useCurrentFlat } from '../flats/FlatProvider';
import { check, messageOf, unwrap } from '../lib/errors';
import { monthStart, ordinal, parseAmount, toIsoDate } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useNav } from '../nav/NavProvider';

export function RecurringEditScreen({ id }: { id?: string }) {
  const editing = typeof id === 'string';
  const { flat } = useCurrentFlat();
  const { back, setTitleOverride } = useNav();
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [amount, setAmount] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [remind, setRemind] = useState('3');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);

  useEffect(() => {
    setTitleOverride(editing ? 'Edit recurring bill' : 'New recurring bill');
  }, [editing, setTitleOverride]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const cats = await loadCategories(flat.id);
      if (!active) return;
      setCategories(cats);
      if (!id) return;
      const t: Template = unwrap(await supabase.from('bill_templates').select('*').eq('id', id).single());
      if (!active) return;
      setCategory(cats.find((c) => c.id === t.category_id) ?? null);
      setAmount(t.amount === null ? '' : String(t.amount));
      setDueDay(String(t.due_day));
      setRemind(String(t.remind_days_before));
    };
    load().catch((e: unknown) => {
      if (active) setError(messageOf(e));
    });
    return () => {
      active = false;
    };
  }, [flat.id, id]);

  if (categories === null) return error ? <Screen><Hint tone="error">{error}</Hint></Screen> : <Loading />;

  /**
   * Adding a recurring bill also creates this month's entry. When its due day has already passed,
   * that entry would be overdue at once and send reminders every 2 days, though it is usually paid
   * already: ask, and mark it paid in one tap.
   */
  const afterAdding = async (templateId: string, name: string, day: number) => {
    const today = new Date();
    const next = "Next month's appears on the 1st.";
    if (day >= today.getDate()) {
      Alert.alert('Recurring bill added', `This month's ${name} is now in Bills. ${next}`);
      return;
    }
    const thisMonth = await supabase
      .from('bills')
      .select('id')
      .eq('template_id', templateId)
      .eq('month', toIsoDate(monthStart(today)))
      .maybeSingle();
    const billId = thisMonth.data?.id;
    if (!billId) {
      Alert.alert('Recurring bill added', `This month's ${name} is now in Bills. ${next}`);
      return;
    }
    Alert.alert('Recurring bill added', `This month's ${name} was due on the ${ordinal(day)}. Is it already paid? ${next}`, [
      { text: 'Not yet', style: 'cancel' },
      {
        text: 'Already paid',
        onPress: () => {
          supabase
            .rpc('mark_bill', { p_bill: billId, p_paid: true })
            .then(({ error: e }) => {
              if (e) Alert.alert('Could not mark it paid', e.message);
            });
        },
      },
    ]);
  };

  const save = async () => {
    if (category === null) return setError('Pick a category.');
    const parsed = parseAmount(amount);
    if (Number.isNaN(parsed)) return setError('Amount must be a number, with at most 2 decimals.');
    const day = Number(dueDay.trim());
    if (!Number.isInteger(day) || day < 1 || day > 28) return setError('Due day must be from 1 to 28, so it exists in every month.');
    const r = Number(remind.trim());
    if (!Number.isInteger(r) || r < 0 || r > 10) return setError('Remind 0 to 10 days before the due day.');
    setBusy('save');
    setError(null);
    try {
      if (id) {
        check(await supabase.from('bill_templates').update({ amount: parsed, due_day: day, remind_days_before: r }).eq('id', id));
      } else {
        const created = unwrap(
          await supabase
            .from('bill_templates')
            .insert({ flat_id: flat.id, category_id: category.id, amount: parsed, due_day: day, remind_days_before: r })
            .select('id')
            .single(),
        );
        await afterAdding(created.id, category.name, day);
      }
      back();
    } catch (e: unknown) {
      setError(messageOf(e));
      setBusy(null);
    }
  };

  const remove = () =>
    Alert.alert('Delete this recurring bill?', 'Bills it already created stay, with their history. No new ones will be added.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setBusy('delete');
          void supabase
            .from('bill_templates')
            .delete()
            .eq('id', id ?? '')
            .then(({ error: e }) => {
              if (e) {
                setError(e.message);
                setBusy(null);
              } else back();
            });
        },
      },
    ]);

  return (
    <Screen>
      <Card title="Category">
        {editing ? (
          <Hint>{`${category?.name ?? ''}. To change the category, delete this one and add a new recurring bill.`}</Hint>
        ) : (
          <CategoryPicker flatId={flat.id} categories={categories} selectedId={category?.id ?? null} onSelect={setCategory} onAdded={(c) => setCategories((l) => [...(l ?? []), c])} />
        )}
      </Card>
      <Card title="Every month">
        <Field label="Amount (₹)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="Optional, if it changes every month" />
        <Grid columns={2} gap={10}>
          <Field label="Due day (1 to 28)" value={dueDay} onChangeText={setDueDay} keyboardType="number-pad" maxLength={2} />
          <Field label="Remind days before" value={remind} onChangeText={setRemind} keyboardType="number-pad" maxLength={2} />
        </Grid>
        {error ? <Hint tone="error">{error}</Hint> : null}
        <Button label={editing ? 'Save' : 'Add recurring bill'} onPress={() => void save()} busy={busy === 'save'} />
        {editing ? <Button label="Delete" variant="dangerGhost" icon="trash" onPress={remove} busy={busy === 'delete'} /> : null}
      </Card>
    </Screen>
  );
}
