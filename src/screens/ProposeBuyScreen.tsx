import { useState } from 'react';
import { Button, Card, Chip, Chips, Field, FieldLabel, Hint, Screen } from '../components/ui';
import { useCurrentFlat } from '../flats/FlatProvider';
import { parseAmount, toIsoDate } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useNav } from '../nav/NavProvider';

const DEADLINES = [
  { key: 'none', label: 'No deadline', days: null },
  { key: 'tomorrow', label: 'Tomorrow', days: 1 },
  { key: '3days', label: 'In 3 days', days: 3 },
  { key: 'week', label: 'In a week', days: 7 },
] as const;

export function ProposeBuyScreen() {
  const { flat } = useCurrentFlat();
  const { back } = useNav();
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [note, setNote] = useState('');
  const [deadline, setDeadline] = useState<(typeof DEADLINES)[number]['key']>('tomorrow');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (name.trim().length === 0) return setError('Say what to buy.');
    const amount = parseAmount(cost);
    if (Number.isNaN(amount)) return setError('Cost must be a number, with at most 2 decimals.');
    const days = DEADLINES.find((d) => d.key === deadline)?.days ?? null;
    const now = new Date();
    const date = days === null ? null : toIsoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc('propose_buy', {
      p_flat: flat.id,
      p_name: name.trim(),
      p_cost: amount ?? undefined,
      p_note: note.trim(),
      p_deadline: date ?? undefined,
    });
    if (e) {
      setError(e.message);
      setBusy(false);
    } else back();
  };

  return (
    <Screen>
      <Hint>Everyone votes In or Out. The In list is who to add to the GPay split. You start as In.</Hint>
      <Card>
        <Field label="What to buy" value={name} onChangeText={setName} maxLength={60} placeholder="For example: Mop and bucket" />
        <Field label="Estimated cost (₹)" value={cost} onChangeText={setCost} keyboardType="decimal-pad" placeholder="Optional" />
        <Field label="Note or link" value={note} onChangeText={setNote} maxLength={300} multiline placeholder="Optional" />
        <FieldLabel>Vote by</FieldLabel>
        <Chips>
          {DEADLINES.map((d) => (
            <Chip key={d.key} label={d.label} selected={deadline === d.key} onPress={() => setDeadline(d.key)} />
          ))}
        </Chips>
        {error ? <Hint tone="error">{error}</Hint> : null}
        <Button label="Propose to the flat" onPress={() => void save()} busy={busy} />
      </Card>
    </Screen>
  );
}
