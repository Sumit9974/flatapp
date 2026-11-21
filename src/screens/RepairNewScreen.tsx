import { useState } from 'react';
import { Button, Card, Field, Hint, Screen } from '../components/ui';
import { useCurrentFlat } from '../flats/FlatProvider';
import { supabase } from '../lib/supabase';
import { useNav } from '../nav/NavProvider';

export function RepairNewScreen() {
  const { flat } = useCurrentFlat();
  const { back } = useNav();
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!title.trim()) return setError('Say what broke.');
    setBusy(true);
    const { error: e } = await supabase.rpc('report_repair', { p_flat: flat.id, p_title: title.trim(), p_details: details.trim() });
    if (e) {
      setError(e.message);
      setBusy(false);
    } else back();
  };

  return (
    <Screen>
      <Card>
        <Field label="What broke" value={title} onChangeText={setTitle} maxLength={80} placeholder="For example: Kitchen tap leaking" />
        <Field label="Details" value={details} onChangeText={setDetails} maxLength={500} multiline placeholder="Optional: where, since when, what you tried" />
        {error ? <Hint tone="error">{error}</Hint> : null}
        <Button label="Report repair" onPress={() => void save()} busy={busy} />
        <Hint>Everyone gets a notification. Whoever gets it fixed marks it fixed.</Hint>
      </Card>
    </Screen>
  );
}
