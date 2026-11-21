import { useState } from 'react';
import { Button, Card, Field, Grid, Hint, Loading, Screen } from '../components/ui';
import { loadFlatInfo } from '../data/queries';
import { useCurrentFlat } from '../flats/FlatProvider';
import { check, messageOf } from '../lib/errors';
import { parseAmount } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useLive } from '../lib/useLive';
import { useNav } from '../nav/NavProvider';

interface Form {
  owner_name: string;
  owner_phone: string;
  rent_amount: string;
  rent_due_day: string;
  pay_note: string;
  wifi_name: string;
  wifi_password: string;
}

export function FlatInfoEditScreen() {
  const { flat } = useCurrentFlat();
  const { back } = useNav();
  const [edits, setEdits] = useState<Partial<Form>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const live = useLive(`flatinfo-edit:${flat.id}`, () => loadFlatInfo(flat.id));
  if (live.data === null) return live.error ? <Screen><Hint tone="error">{live.error}</Hint></Screen> : <Loading />;

  const info = live.data.info;
  const saved: Form = {
    owner_name: info?.owner_name ?? '',
    owner_phone: info?.owner_phone ?? '',
    rent_amount: info?.rent_amount === null || info?.rent_amount === undefined ? '' : String(info.rent_amount),
    rent_due_day: info?.rent_due_day ? String(info.rent_due_day) : '',
    pay_note: info?.pay_note ?? '',
    wifi_name: info?.wifi_name ?? '',
    wifi_password: info?.wifi_password ?? '',
  };
  const form: Form = { ...saved, ...edits };
  const set = (k: keyof Form) => (v: string) => setEdits((e) => ({ ...e, [k]: v }));

  const save = async () => {
    const rent = parseAmount(form.rent_amount);
    if (Number.isNaN(rent)) return setError('Rent must be a number, with at most 2 decimals.');
    const due = form.rent_due_day.trim() === '' ? null : Number(form.rent_due_day);
    if (due !== null && (!Number.isInteger(due) || due < 1 || due > 31)) return setError('Rent due day must be from 1 to 31.');
    setBusy(true);
    setError(null);
    try {
      const row = {
        owner_name: form.owner_name.trim() || null,
        owner_phone: form.owner_phone.trim() || null,
        rent_amount: rent,
        rent_due_day: due,
        pay_note: form.pay_note.trim() || null,
        wifi_name: form.wifi_name.trim() || null,
        wifi_password: form.wifi_password || null,
      };
      check(info ? await supabase.from('flat_info').update(row).eq('flat_id', flat.id) : await supabase.from('flat_info').insert({ flat_id: flat.id, ...row }));
      back();
    } catch (e: unknown) {
      setError(messageOf(e));
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card title="Owner">
        <Field label="Owner's name" value={form.owner_name} onChangeText={set('owner_name')} maxLength={60} />
        <Field label="Owner's phone" value={form.owner_phone} onChangeText={set('owner_phone')} maxLength={20} keyboardType="phone-pad" />
      </Card>
      <Card title="Rent">
        <Grid columns={2} gap={10}>
          <Field label="Rent a month (₹)" value={form.rent_amount} onChangeText={set('rent_amount')} keyboardType="decimal-pad" />
          <Field label="Due day (1 to 31)" value={form.rent_due_day} onChangeText={set('rent_due_day')} keyboardType="number-pad" maxLength={2} />
        </Grid>
        <Field label="How to pay" value={form.pay_note} onChangeText={set('pay_note')} maxLength={200} multiline placeholder="For example: bank transfer to the account in the rent agreement" />
      </Card>
      <Card title="WiFi">
        <Field label="Network name" value={form.wifi_name} onChangeText={set('wifi_name')} maxLength={60} autoCapitalize="none" />
        <Field label="Password" value={form.wifi_password} onChangeText={set('wifi_password')} maxLength={63} autoCapitalize="none" autoCorrect={false} />
        <Hint>Everyone in the flat can see and copy the WiFi password.</Hint>
      </Card>
      {error ? <Hint tone="error">{error}</Hint> : null}
      <Button label="Save" onPress={() => void save()} busy={busy} />
    </Screen>
  );
}
