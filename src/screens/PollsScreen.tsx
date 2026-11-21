import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { Bar, Button, Card, Empty, Hint, HStack, LinkButton, Notice, Pill, Screen, type } from '../components/ui';
import { loadPolls, Poll } from '../data/queries';
import { useCurrentFlat, useFlats } from '../flats/FlatProvider';
import { formatWhen } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useLive } from '../lib/useLive';
import { useNav } from '../nav/NavProvider';
import { colors } from '../theme';

export function PollsScreen() {
  const { userId } = useAuth();
  const { flat, role } = useCurrentFlat();
  const { members, nameOf } = useFlats();
  const { navigate } = useNav();
  const filter = `flat_id=eq.${flat.id}`;
  const live = useLive(`polls:${flat.id}`, () => loadPolls(flat.id), [
    { table: 'polls', filter },
    { table: 'poll_votes', filter },
  ]);
  const memberCount = members.filter((m) => m.leftAt === null).length;

  const vote = async (p: Poll, optionId: string) => {
    const mine = userId ? p.votes.get(userId) : undefined;
    const { error } = await supabase.rpc('vote_poll', { p_poll: p.poll.id, p_option: (mine === optionId ? null : optionId) as string });
    if (error) Alert.alert('Could not vote', error.message);
    else await live.reload();
  };

  const closePoll = (p: Poll) =>
    Alert.alert('Close this poll?', 'Nobody can vote after this.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Close poll',
        onPress: () =>
          void supabase.rpc('close_poll', { p_poll: p.poll.id }).then(({ error }) => (error ? Alert.alert('Could not close it', error.message) : live.reload())),
      },
    ]);

  const polls = live.data ?? [];
  const open = polls.filter((p) => p.isOpen);
  const closed = polls.filter((p) => !p.isOpen);

  const pollCard = (p: Poll) => {
    const total = p.votes.size;
    const mine = userId ? p.votes.get(userId) : undefined;
    const counts = new Map<string, number>();
    for (const o of p.votes.values()) counts.set(o, (counts.get(o) ?? 0) + 1);
    const canClose = p.isOpen && (p.poll.created_by === userId || role === 'admin');
    return (
      <Card key={p.poll.id}>
        <HStack gap={8}>
          <Pill
            text={p.isOpen ? (p.poll.closes_at ? `Open · closes ${formatWhen(p.poll.closes_at)}` : 'Open') : 'Closed'}
            bg={p.isOpen ? colors.primarySoft : colors.slateSoft}
            fg={p.isOpen ? colors.primaryDark : colors.slate}
          />
          <Text style={type.tiny}>{`by ${p.poll.created_by === userId ? 'you' : nameOf(p.poll.created_by)}`}</Text>
        </HStack>
        <Text style={type.title}>{p.poll.question}</Text>
        {p.options.map((o) => {
          const n = counts.get(o.id) ?? 0;
          const on = mine === o.id;
          const pct = total ? (n / total) * 100 : 0;
          return (
            <Pressable
              key={o.id}
              collapsable={false}
              disabled={!p.isOpen}
              onPress={() => void vote(p, o.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: on, disabled: !p.isOpen }}
              accessibilityLabel={`${o.label}, ${n} ${n === 1 ? 'vote' : 'votes'}`}
              style={[styles.option, on && styles.optionOn]}
            >
              <View style={styles.optionTop}>
                <Text style={[type.bodyStrong, styles.flex]}>{o.label}</Text>
                <Text style={type.smallStrong}>{`${n} ${n === 1 ? 'vote' : 'votes'}${on ? ' · yours' : ''}`}</Text>
              </View>
              <Bar pct={pct} color={p.isOpen ? colors.primary : colors.good} />
            </Pressable>
          );
        })}
        <Hint>{p.isOpen ? `${mine ? 'You voted. Tap another answer to change it. ' : 'Tap an answer to vote. '}${total} of ${memberCount} have voted.` : `${total} voted.`}</Hint>
        {canClose ? <LinkButton label="Close poll" onPress={() => closePoll(p)} /> : null}
      </Card>
    );
  };

  return (
    <Screen onRefresh={live.onRefresh} refreshing={live.refreshing}>
      {live.error ? <Notice message={live.error} tone="error" onDismiss={live.clearError} /> : null}
      {live.data && polls.length === 0 ? (
        <Card>
          <Empty icon="poll" text="No polls yet. Ask the flat: new WiFi plan, deep cleaning, house rules." />
        </Card>
      ) : null}
      {open.map(pollCard)}
      {closed.map(pollCard)}
      <Button label="Start a poll" icon="plus" onPress={() => navigate({ name: 'pollNew' })} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  option: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, gap: 8, backgroundColor: colors.card },
  optionOn: { borderColor: colors.primary, backgroundColor: '#F3F6FF' },
  optionTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
