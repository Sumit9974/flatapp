import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { Icon } from '../components/Icon';
import { Avatar, Button, Card, Chips, Field, Grid, Hint, Notice, Pill, Screen, type } from '../components/ui';
import { DINNER, DINNER_ORDER, UNDECIDED } from '../data/meta';
import { DinnerChoice, loadDinner, setDinner } from '../data/queries';
import { useCurrentFlat, useFlats } from '../flats/FlatProvider';
import { messageOf } from '../lib/errors';
import { supabase } from '../lib/supabase';
import { useLive } from '../lib/useLive';
import { colors, fonts } from '../theme';

export function DinnerScreen() {
  const { userId } = useAuth();
  const { flat } = useCurrentFlat();
  const { members } = useFlats();
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const filter = `flat_id=eq.${flat.id}`;

  const live = useLive(`dinner:${flat.id}`, () => loadDinner(flat.id), [
    { table: 'dinner_status', filter },
    { table: 'dinner_joins', filter },
  ]);

  const d = live.data;
  const mine = d && userId ? d.byUser.get(userId) : undefined;
  const note = noteDraft ?? mine?.note ?? '';
  const people = members.filter((m) => m.leftAt === null).sort((a, b) => (a.userId === userId ? -1 : b.userId === userId ? 1 : a.name.localeCompare(b.name)));

  const save = async (choice: DinnerChoice | null, withNote: string | null) => {
    setBusy(true);
    try {
      await setDinner(flat.id, choice, withNote);
      setNoteDraft(null);
      await live.reload();
    } catch (e: unknown) {
      Alert.alert('Could not save', messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const pick = (k: DinnerChoice) => void save(mine?.choice === k ? null : k, note.trim() || null);

  const saveNote = () => {
    if (!mine) {
      Alert.alert('Pick your dinner first', 'The note goes with your choice.');
      return;
    }
    void save(mine.choice, note.trim() || null);
  };

  const toggleJoin = async (hostId: string) => {
    const { data, error } = await supabase.rpc('toggle_dinner_join', { p_flat: flat.id, p_host: hostId });
    if (error) Alert.alert('Could not join', error.message);
    else {
      if (data) Alert.alert("You're in the order", 'They get a notification with your name.');
      await live.reload();
    }
  };

  const counts = new Map<string, { n: number; bg: string; fg: string }>();
  for (const p of people) {
    const c = d?.byUser.get(p.userId)?.choice;
    const meta = c ? DINNER[c] : null;
    const word = meta ? meta.word : UNDECIDED.word;
    const prev = counts.get(word);
    counts.set(word, { n: (prev?.n ?? 0) + 1, bg: meta ? meta.bg : UNDECIDED.bg, fg: meta ? meta.fg : UNDECIDED.fg });
  }

  return (
    <Screen onRefresh={live.onRefresh} refreshing={live.refreshing}>
      {live.error ? <Notice message={live.error} tone="error" onDismiss={live.clearError} /> : null}
      <Card title="Your dinner tonight" action={<Text style={type.tiny}>Resets at 4:00 am</Text>}>
        <Grid columns={2} gap={8}>
          {DINNER_ORDER.map((k) => {
            const meta = DINNER[k];
            const on = mine?.choice === k;
            return (
              <Pressable
                key={k}
                collapsable={false}
                disabled={busy}
                onPress={() => pick(k)}
                accessibilityRole="button"
                accessibilityLabel={meta.label}
                accessibilityState={{ selected: on, disabled: busy }}
                style={[styles.tile, on && styles.tileOn]}
              >
                <Icon name={meta.icon} size={24} color={on ? colors.onPrimary : colors.text} />
                <View style={styles.flex}>
                  <Text style={[styles.tileLabel, on && styles.onPrimary]}>{meta.label}</Text>
                  <Text style={[styles.tileHint, on && styles.onPrimaryMuted]}>{meta.hint}</Text>
                </View>
              </Pressable>
            );
          })}
        </Grid>
        <Field label="Note for your flatmates" value={note} onChangeText={setNoteDraft} maxLength={80} placeholder="For example: back by 9, keep some rice" onSubmitEditing={saveNote} returnKeyType="done" />
        {noteDraft !== null && noteDraft !== (mine?.note ?? '') ? <Button label="Save note" size="sm" variant="secondary" onPress={saveNote} busy={busy} /> : null}
        <Hint>Tap your choice again to go back to “Not decided”.</Hint>
      </Card>

      <Chips>
        {[...counts.entries()].map(([word, c]) => (
          <Pill key={word} text={`${c.n} ${word}`} bg={c.bg} fg={c.fg} style={styles.countPill} />
        ))}
      </Chips>

      <Card title="Everyone" list>
        {people.map((p, i) => {
          const s = d?.byUser.get(p.userId);
          const meta = s ? DINNER[s.choice] : null;
          const isMe = p.userId === userId;
          const joiners = d?.joins.get(p.userId) ?? [];
          const joined = userId ? joiners.includes(userId) : false;
          return (
            <View key={p.userId} style={[styles.person, i === 0 && styles.personFirst]}>
              <Avatar id={p.userId} name={p.name} />
              <View style={styles.flex}>
                <Text style={type.bodyStrong}>{isMe ? 'You' : p.name}</Text>
                <Pill text={meta ? meta.label : UNDECIDED.label} bg={meta ? meta.bg : UNDECIDED.bg} fg={meta ? meta.fg : UNDECIDED.fg} />
                {s?.note ? <Text style={type.small}>{s.note}</Text> : null}
                {s?.choice === 'online' && joiners.length > 0 ? (
                  <Text style={type.small}>{`${joiners.length} joined this order`}</Text>
                ) : null}
              </View>
              {s?.choice === 'online' && !isMe ? (
                <Button label={joined ? 'Joined' : 'Join order'} size="sm" variant={joined ? 'primary' : 'secondary'} pressed={joined} onPress={() => void toggleJoin(p.userId)} />
              ) : null}
            </View>
          );
        })}
      </Card>
      <Hint>Every change sends your flatmates a notification, for example “Rahul: ordering online”.</Hint>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 4 },
  tile: { minHeight: 76, borderRadius: 14, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  tileOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tileLabel: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  tileHint: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  onPrimary: { color: colors.onPrimary },
  onPrimaryMuted: { color: colors.onPrimaryMuted },
  countPill: { height: 30 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.divider },
  personFirst: { borderTopColor: 'transparent' },
});
