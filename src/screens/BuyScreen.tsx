import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { Bar, Button, Card, Chip, Chips, Empty, Fab, Field, Grid, Hint, Notice, Pill, Screen, type } from '../components/ui';
import { BuyItem, loadBuy } from '../data/queries';
import { useCurrentFlat, useFlats } from '../flats/FlatProvider';
import { formatDay, parseAmount, rupees } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useLive } from '../lib/useLive';
import { useNav } from '../nav/NavProvider';
import { colors } from '../theme';

type Tab = 'open' | 'bought' | 'cancelled';

export function BuyScreen() {
  const { userId } = useAuth();
  const { flat, role } = useCurrentFlat();
  const { members, nameOf } = useFlats();
  const { navigate } = useNav();
  const [tab, setTab] = useState<Tab>('open');
  const [closing, setClosing] = useState<string | null>(null);
  const [finalAmount, setFinalAmount] = useState('');
  const filter = `flat_id=eq.${flat.id}`;

  const live = useLive(`buy:${flat.id}`, () => loadBuy(flat.id), [
    { table: 'buy_items', filter },
    { table: 'buy_votes', filter },
  ]);
  const items = live.data ?? [];
  const byTab = (t: Tab) => items.filter((i) => i.status === t);
  const memberCount = members.filter((m) => m.leftAt === null).length || 1;

  const vote = async (item: BuyItem, voteIn: boolean) => {
    const mine = userId ? item.votes.get(userId) : undefined;
    const { error } = await supabase.rpc('vote_buy', { p_item: item.id, p_in: (mine === voteIn ? null : voteIn) as boolean });
    if (error) Alert.alert('Could not vote', error.message);
    else await live.reload();
  };

  const close = async (item: BuyItem, status: 'bought' | 'cancelled') => {
    const amount = status === 'bought' ? parseAmount(finalAmount) : null;
    if (Number.isNaN(amount)) {
      Alert.alert('Check the amount', 'Use a number with at most 2 decimals, or leave it empty.');
      return;
    }
    const { error } = await supabase.rpc('close_buy', { p_item: item.id, p_status: status, p_final: (amount ?? undefined) as number });
    if (error) Alert.alert('Could not close it', error.message);
    else {
      setClosing(null);
      setFinalAmount('');
      await live.reload();
    }
  };

  const confirmCancel = (item: BuyItem) =>
    Alert.alert(`Cancel "${item.name}"?`, 'Voting stops and everyone is told it is cancelled.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel item', style: 'destructive', onPress: () => void close(item, 'cancelled') },
    ]);

  const inNames = (item: BuyItem) =>
    [...item.votes.entries()].filter(([, v]) => v).map(([id]) => (id === userId ? 'You' : nameOf(id)));

  return (
    <View style={styles.flex}>
      <Screen onRefresh={live.onRefresh} refreshing={live.refreshing} withFab>
        {live.error ? <Notice message={live.error} tone="error" onDismiss={live.clearError} /> : null}
        <Chips>
          <Chip label={`Open (${byTab('open').length})`} selected={tab === 'open'} onPress={() => setTab('open')} />
          <Chip label={`Bought (${byTab('bought').length})`} selected={tab === 'bought'} onPress={() => setTab('bought')} />
          <Chip label={`Cancelled (${byTab('cancelled').length})`} selected={tab === 'cancelled'} onPress={() => setTab('cancelled')} />
        </Chips>

        {live.data && byTab(tab).length === 0 ? (
          <Card>
            <Empty icon="cart" text={tab === 'open' ? 'Nothing to vote on. Propose something the flat needs.' : `Nothing ${tab} yet.`} />
          </Card>
        ) : null}

        {tab === 'open'
          ? byTab('open').map((item) => {
              const mine = userId ? item.votes.get(userId) : undefined;
              const ins = inNames(item);
              const outs = [...item.votes.values()].filter((v) => !v).length;
              const waiting = Math.max(0, memberCount - item.votes.size);
              const canClose = item.proposed_by === userId || role === 'admin';
              return (
                <Card key={item.id}>
                  <View style={styles.between}>
                    <View style={styles.flex}>
                      <Text style={type.h2}>{item.name}</Text>
                      <Text style={type.small}>
                        {`Proposed by ${item.proposed_by === userId ? 'you' : nameOf(item.proposed_by)}${item.deadline ? ` · vote by ${formatDay(new Date(item.deadline))}` : ''}`}
                      </Text>
                    </View>
                    {item.est_cost !== null ? <Text style={type.title}>{rupees(item.est_cost)}</Text> : null}
                  </View>
                  {item.note ? <Hint>{item.note}</Hint> : null}
                  <View style={styles.votes}>
                    <View style={styles.between}>
                      <Text style={[type.smallStrong, { color: colors.good }]}>{`${ins.length} in`}</Text>
                      <Text style={type.small}>{`${outs} out · ${waiting} to vote`}</Text>
                    </View>
                    <Bar pct={(ins.length / memberCount) * 100} color={colors.good} />
                    <Text style={type.small}>{ins.length ? `In: ${ins.join(', ')}` : 'Nobody is in yet'}</Text>
                  </View>
                  <Grid columns={2} gap={8}>
                    <Button
                      label={mine === true ? "You're in" : "I'm in"}
                      icon="check"
                      size="sm"
                      pressed={mine === true}
                      colorsOverride={mine === true ? { bg: colors.good, fg: '#fff', border: colors.good } : { bg: '#fff', fg: colors.good, border: '#BFE3CC' }}
                      onPress={() => void vote(item, true)}
                    />
                    <Button
                      label={mine === false ? "You're out" : "I'm out"}
                      icon="x"
                      size="sm"
                      pressed={mine === false}
                      colorsOverride={mine === false ? { bg: '#374151', fg: '#fff', border: '#374151' } : { bg: '#fff', fg: '#374151', border: colors.inputBorder }}
                      onPress={() => void vote(item, false)}
                    />
                  </Grid>
                  {canClose ? (
                    closing === item.id ? (
                      <>
                        <Field label="Final amount (₹)" value={finalAmount} onChangeText={setFinalAmount} keyboardType="decimal-pad" placeholder="Optional" />
                        <Grid columns={2} gap={8}>
                          <Button label="Back" size="sm" variant="secondary" onPress={() => setClosing(null)} />
                          <Button label="Mark bought" size="sm" onPress={() => void close(item, 'bought')} />
                        </Grid>
                      </>
                    ) : (
                      <Grid columns={2} gap={8}>
                        <Button label="Mark bought" size="sm" variant="secondary" onPress={() => setClosing(item.id)} />
                        <Button label="Cancel item" size="sm" variant="dangerGhost" onPress={() => confirmCancel(item)} />
                      </Grid>
                    )
                  ) : null}
                </Card>
              );
            })
          : byTab(tab).map((item) => {
              const ins = inNames(item);
              const amount = item.final_amount ?? item.est_cost;
              const each = amount !== null && ins.length > 0 ? Math.round(amount / ins.length) : null;
              const when = item.closed_at ? formatDay(new Date(item.closed_at)) : '';
              return (
                <Card key={item.id}>
                  <View style={styles.between}>
                    <Text style={[type.h2, styles.flex]}>{item.name}</Text>
                    {amount !== null ? <Text style={type.title}>{rupees(amount)}</Text> : null}
                  </View>
                  {item.status === 'bought' ? (
                    <>
                      <Pill text={`Bought by ${item.closed_by === userId ? 'you' : nameOf(item.closed_by)}, ${when}`} bg={colors.goodSoft} fg={colors.good} />
                      <Text style={type.body}>
                        {ins.length ? `Split in GPay with ${ins.join(', ')}${each !== null ? `: about ${rupees(each)} each` : ''}.` : 'Nobody voted In.'}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Pill text={`Cancelled by ${item.closed_by === userId ? 'you' : nameOf(item.closed_by)}, ${when}`} bg={colors.slateSoft} fg={colors.slate} />
                      <Hint>{`${ins.length} in, ${[...item.votes.values()].filter((v) => !v).length} out.`}</Hint>
                    </>
                  )}
                </Card>
              );
            })}
      </Screen>
      <Fab label="Propose" onPress={() => navigate({ name: 'proposeBuy' })} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  between: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  votes: { gap: 6 },
});
