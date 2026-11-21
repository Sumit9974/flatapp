import { useState } from 'react';
import { Button, Card, Chip, Chips, Field, FieldLabel, Hint, LinkButton, Screen } from '../components/ui';
import { useCurrentFlat } from '../flats/FlatProvider';
import { supabase } from '../lib/supabase';
import { useNav } from '../nav/NavProvider';

const CLOSES = [
  { key: 'none', label: 'No end date', days: null },
  { key: '1', label: 'Tomorrow', days: 1 },
  { key: '3', label: 'In 3 days', days: 3 },
  { key: '7', label: 'In a week', days: 7 },
] as const;

export function PollNewScreen() {
  const { flat } = useCurrentFlat();
  const { back } = useNav();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['Yes', 'No']);
  const [closes, setCloses] = useState<(typeof CLOSES)[number]['key']>('3');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const answers = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim()) return setError('Ask a question.');
    if (answers.length < 2) return setError('Give at least 2 answers.');
    const days = CLOSES.find((c) => c.key === closes)?.days ?? null;
    const closesAt = days === null ? null : new Date(Date.now() + days * 86_400_000).toISOString();
    setBusy(true);
    const { error: e } = await supabase.rpc('create_poll', {
      p_flat: flat.id,
      p_question: question.trim(),
      p_options: answers,
      p_closes_at: (closesAt ?? undefined) as string,
    });
    if (e) {
      setError(e.message);
      setBusy(false);
    } else back();
  };

  return (
    <Screen>
      <Card>
        <Field label="Question" value={question} onChangeText={setQuestion} maxLength={120} placeholder="For example: Switch WiFi to a 300 Mbps plan?" />
        {options.map((o, i) => (
          <Field
            key={i}
            label={`Answer ${i + 1}`}
            value={o}
            maxLength={60}
            onChangeText={(t) => setOptions((list) => list.map((v, j) => (j === i ? t : v)))}
            placeholder={i < 2 ? 'Type an answer' : 'Optional'}
          />
        ))}
        {options.length < 6 ? <LinkButton label="Add another answer" onPress={() => setOptions((l) => [...l, ''])} /> : null}
        <FieldLabel>Closes</FieldLabel>
        <Chips>
          {CLOSES.map((c) => (
            <Chip key={c.key} label={c.label} selected={closes === c.key} onPress={() => setCloses(c.key)} />
          ))}
        </Chips>
        {error ? <Hint tone="error">{error}</Hint> : null}
        <Button label="Start poll" onPress={() => void save()} busy={busy} />
        <Hint>Everyone gets a notification. Each person has one vote and can change it until the poll closes.</Hint>
      </Card>
    </Screen>
  );
}
