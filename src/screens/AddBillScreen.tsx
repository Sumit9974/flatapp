import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CategoryPicker } from '../bills/CategoryPicker';
import { Category, loadCategories } from '../bills/model';
import { Button, Card, Field, Grid, Hint, IconButton, Loading, Screen, type } from '../components/ui';
import { useCurrentFlat } from '../flats/FlatProvider';
import { messageOf, unwrap } from '../lib/errors';
import { addMonths, daysInMonth, formatMonthLong, formatMonthShort, fromIsoDate, monthStart, parseAmount, toIsoDate } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useLive } from '../lib/useLive';
import { useNav } from '../nav/NavProvider';

/** Problems with what was typed, each shown under its own field. */
interface Problems {
  category?: string;
  name?: string;
  amount?: string;
  dueDay?: string;
  save?: string;
}

export function AddBillScreen({ month: monthParam }: { month: string }) {
  const { flat } = useCurrentFlat();
  const { navigate, back } = useNav();
  const [added, setAdded] = useState<Category[]>([]);
  const [category, setCategory] = useState<Category | null>(null);
  const [month, setMonth] = useState(() => monthStart(fromIsoDate(monthParam)));
  // null until the person types their own name; until then "Grocery, Nov 2026" is suggested.
  const [customTitle, setCustomTitle] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [note, setNote] = useState('');
  const [problems, setProblems] = useState<Problems>({});
  const [busy, setBusy] = useState(false);

  const live = useLive(`categories:${flat.id}`, () => loadCategories(flat.id));
  if (live.data === null) return live.error ? <Screen><Hint tone="error">{live.error}</Hint></Screen> : <Loading />;
  const categories = [...live.data, ...added.filter((a) => !live.data?.some((c) => c.id === a.id))].sort((a, b) => a.name.localeCompare(b.name));

  const title = customTitle ?? (category ? `${category.name}, ${formatMonthShort(month)}` : '');
  const clear = (field: keyof Problems) => setProblems((p) => ({ ...p, [field]: undefined, save: undefined }));

  const save = async () => {
    const found: Problems = {};
    if (category === null) found.category = 'Pick a category, or tap New to add one.';
    const name = title.trim();
    if (name.length === 0) found.name = 'Give the bill a name.';
    else if (name.length > 60) found.name = 'Keep the name to 60 characters.';
    const parsedAmount = parseAmount(amount);
    if (parsedAmount !== null && Number.isNaN(parsedAmount)) found.amount = 'Type a number, like 1350 or 1350.50.';
    let due: string | null = null;
    if (dueDay.trim() !== '') {
      const day = Number(dueDay.trim());
      if (!Number.isInteger(day) || day < 1 || day > daysInMonth(month)) found.dueDay = `A day from 1 to ${daysInMonth(month)}.`;
      else due = toIsoDate(new Date(month.getFullYear(), month.getMonth(), day));
    }
    setProblems(found);
    if (Object.keys(found).length > 0 || category === null) return;

    setBusy(true);
    try {
      const created = unwrap(
        await supabase
          .from('bills')
          .insert({ flat_id: flat.id, category_id: category.id, month: toIsoDate(month), title: name, amount: parsedAmount, due_date: due, note: note.trim() || null })
          .select('id')
          .single(),
      );
      back();
      navigate({ name: 'billDetail', id: created.id });
    } catch (e: unknown) {
      setProblems({ save: messageOf(e) });
      setBusy(false);
    }
  };

  const anyProblem = Object.values(problems).some(Boolean);

  return (
    <Screen>
      <Card title="Category">
        <CategoryPicker
          flatId={flat.id}
          categories={categories}
          selectedId={category?.id ?? null}
          onSelect={(c) => {
            setCategory(c);
            clear('category');
          }}
          onAdded={(c) => setAdded((l) => [...l, c])}
        />
        {problems.category ? <Hint tone="error">{problems.category}</Hint> : null}
      </Card>
      <Card title="Details">
        <Field
          label="Name"
          value={title}
          onChangeText={(t) => {
            setCustomTitle(t);
            clear('name');
          }}
          maxLength={60}
          placeholder="Pick a category, or type a name"
          error={problems.name}
        />
        <Grid columns={2} gap={10}>
          <Field
            label="Amount (₹)"
            value={amount}
            onChangeText={(t) => {
              setAmount(t);
              clear('amount');
            }}
            keyboardType="decimal-pad"
            placeholder="Optional"
            error={problems.amount}
          />
          <Field
            label="Due day"
            value={dueDay}
            onChangeText={(t) => {
              setDueDay(t);
              clear('dueDay');
            }}
            keyboardType="number-pad"
            maxLength={2}
            placeholder={`1 to ${daysInMonth(month)}`}
            error={problems.dueDay}
          />
        </Grid>
        <View style={styles.month}>
          <IconButton icon="back" label="Previous month" bordered onPress={() => setMonth((m) => addMonths(m, -1))} />
          <Text style={type.bodyStrong}>{formatMonthLong(month)}</Text>
          <IconButton icon="next" label="Next month" bordered onPress={() => setMonth((m) => addMonths(m, 1))} />
        </View>
        <Field label="Note" value={note} onChangeText={setNote} maxLength={200} multiline placeholder="Optional, for example: DMart monthly stock" />
        {problems.save ? <Hint tone="error">{`Could not add the bill: ${problems.save}`}</Hint> : null}
        {anyProblem && !problems.save ? <Hint tone="error">Fix the field marked in red above.</Hint> : null}
        <Button label="Add bill" onPress={() => void save()} busy={busy} />
        <Hint>One-off bills like groceries get no reminders. For rent, light bill and WiFi use Recurring bills.</Hint>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  month: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
