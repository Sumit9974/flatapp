import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { amountText, describeStatus, loadMonthBills, sortBills } from '../bills/model';
import { Icon } from '../components/Icon';
import { Avatar, Button, Card, Grid, Hint, HStack, LinkButton, ListRow, Notice, Pill, Screen, type } from '../components/ui';
import { categoryStyle, DINNER, DINNER_ORDER, describePresence, UNDECIDED } from '../data/meta';
import { DinnerChoice, loadBuy, loadDinner, loadNotices, loadPresence, setDinner } from '../data/queries';
import { useCurrentFlat, useFlats } from '../flats/FlatProvider';
import { messageOf } from '../lib/errors';
import { formatMonthShort, formatToday, formatWhen, greeting, monthStart, rupees, toIsoDate } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useLive } from '../lib/useLive';
import { canUseBiometrics, markBiometricOffered, setBiometricLock, wasBiometricOffered } from '../lock/settings';
import { useNav } from '../nav/NavProvider';
import { colors, fonts } from '../theme';

export function HomeScreen() {
  const { userId, profile } = useAuth();
  const { flat } = useCurrentFlat();
  const { members, nameOf } = useFlats();
  const { navigate } = useNav();
  const [now] = useState(() => new Date());
  const [month] = useState(() => monthStart(new Date()));
  const [busy, setBusy] = useState(false);
  const filter = `flat_id=eq.${flat.id}`;

  const live = useLive(
    `home:${flat.id}`,
    async () => {
      const [bills, presence, dinner, buy, notices] = await Promise.all([
        loadMonthBills(flat.id, month),
        loadPresence(flat.id),
        loadDinner(flat.id),
        loadBuy(flat.id),
        loadNotices(flat.id),
      ]);
      return { bills, presence, dinner, buy, notices };
    },
    [
      { table: 'bills', filter },
      { table: 'presence', filter },
      { table: 'dinner_status', filter },
      { table: 'buy_items', filter },
      { table: 'buy_votes', filter },
      { table: 'notices', filter },
    ],
  );

  // Once, after the first sign-in on this phone: offer the fingerprint lock.
  useEffect(() => {
    if (wasBiometricOffered()) return;
    markBiometricOffered();
    void canUseBiometrics().then((available) => {
      if (!available) return;
      Alert.alert('Use your fingerprint?', 'Open FlatApp with your fingerprint instead of signing in each time. You can change this in Settings.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Use fingerprint', onPress: () => setBiometricLock(true) },
      ]);
    });
  }, []);

  const d = live.data;
  const current = members.filter((m) => m.leftAt === null).sort((a, b) => (a.userId === userId ? -1 : b.userId === userId ? 1 : a.name.localeCompare(b.name)));
  const myDinner = d && userId ? d.dinner.byUser.get(userId)?.choice ?? null : null;

  const pickDinner = async (choice: DinnerChoice) => {
    setBusy(true);
    try {
      await setDinner(flat.id, myDinner === choice ? null : choice, d && userId ? d.dinner.byUser.get(userId)?.note ?? null : null);
      await live.reload();
    } catch (e: unknown) {
      Alert.alert('Could not save', messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const vote = async (itemId: string, voteIn: boolean, mine: boolean | undefined) => {
    const { error } = await supabase.rpc('vote_buy', { p_item: itemId, p_in: (mine === voteIn ? null : voteIn) as boolean });
    if (error) Alert.alert('Could not vote', error.message);
    else await live.reload();
  };

  const firstName = (profile?.display_name ?? '').split(' ')[0] ?? '';

  return (
    <Screen onRefresh={live.onRefresh} refreshing={live.refreshing}>
      {live.error ? <Notice message={live.error} tone="error" onDismiss={live.clearError} /> : null}
      <View style={styles.greet}>
        <Text style={type.display}>{`${greeting(now)}${firstName ? `, ${firstName}` : ''}`}</Text>
        <Text style={type.small}>{formatToday(now)}</Text>
      </View>

      <Card title="Who's home" action={<LinkButton label="See all" onPress={() => navigate({ name: 'presence' })} />}>
        <Grid columns={4} gap={6}>
          {current.map((m) => {
            const p = describePresence(d?.presence.get(m.userId));
            const isMe = m.userId === userId;
            return (
              <Pressable
                key={m.userId}
                collapsable={false}
                onPress={() => navigate({ name: 'presence' })}
                accessibilityRole="button"
                accessibilityLabel={`${isMe ? 'You' : m.name}: ${p.short}`}
                style={({ pressed }) => [styles.person, pressed && styles.personPressed]}
              >
                <Avatar id={m.userId} name={m.name} dot={p.dot} />
                <Text style={styles.personName} numberOfLines={1}>
                  {isMe ? 'You' : m.name.split(' ')[0]}
                </Text>
                <Text style={[styles.personState, { color: p.textColor }]}>{p.short}</Text>
              </Pressable>
            );
          })}
        </Grid>
      </Card>

      <Card title="Dinner tonight" action={<LinkButton label="Everyone" onPress={() => navigate({ name: 'dinner' })} />}>
        <Hint>{d ? dinnerSummary(d.dinner.byUser, current.map((m) => m.userId)) : 'Loading...'}</Hint>
        <Grid columns={4} gap={8}>
          {DINNER_ORDER.map((k) => {
            const on = myDinner === k;
            const meta = DINNER[k];
            return (
              <Pressable
                key={k}
                collapsable={false}
                disabled={busy}
                onPress={() => void pickDinner(k)}
                accessibilityRole="button"
                accessibilityLabel={meta.label}
                accessibilityState={{ selected: on, disabled: busy }}
                style={[styles.seg, on && styles.segOn]}
              >
                <Icon name={meta.icon} size={22} color={on ? colors.onPrimary : colors.text} />
                <Text style={[styles.segText, on && styles.segTextOn]}>{meta.short}</Text>
              </Pressable>
            );
          })}
        </Grid>
      </Card>

      <BillsCard
        month={month}
        bills={d?.bills ?? null}
        nameOf={nameOf}
        onAll={() => navigate({ name: 'bills' })}
        onOpen={(id) => navigate({ name: 'billDetail', id })}
      />

      {d && userId ? (
        (() => {
          const open = d.buy.filter((b) => b.status === 'open');
          const item = open.find((b) => !b.votes.has(userId)) ?? open[0];
          if (!item) return null;
          const mine = item.votes.get(userId);
          const ins = [...item.votes.values()].filter(Boolean).length;
          const outs = [...item.votes.values()].filter((v) => !v).length;
          return (
            <Card title="Buy list · your vote" action={<LinkButton label="Open list" onPress={() => navigate({ name: 'buy' })} />}>
              <HStack style={styles.between}>
                <View style={styles.flex}>
                  <Text style={type.bodyStrong}>{item.name}</Text>
                  <Text style={type.small}>{`Proposed by ${nameOf(item.proposed_by)} · ${ins} in, ${outs} out`}</Text>
                </View>
                {item.est_cost !== null ? <Text style={styles.cost}>{rupees(item.est_cost)}</Text> : null}
              </HStack>
              <Grid columns={2} gap={8}>
                <Button
                  label={mine === true ? "You're in" : "I'm in"}
                  icon="check"
                  size="sm"
                  pressed={mine === true}
                  colorsOverride={mine === true ? { bg: colors.good, fg: '#fff', border: colors.good } : { bg: '#fff', fg: colors.good, border: '#BFE3CC' }}
                  onPress={() => void vote(item.id, true, mine)}
                />
                <Button
                  label={mine === false ? "You're out" : "I'm out"}
                  icon="x"
                  size="sm"
                  pressed={mine === false}
                  colorsOverride={mine === false ? { bg: '#374151', fg: '#fff', border: '#374151' } : { bg: '#fff', fg: '#374151', border: colors.inputBorder }}
                  onPress={() => void vote(item.id, false, mine)}
                />
              </Grid>
            </Card>
          );
        })()
      ) : null}

      {d && d.notices.length > 0
        ? (() => {
            const n = d.notices.find((x) => x.pinned) ?? d.notices[0];
            if (!n) return null;
            return (
              <Card tone="notice">
                <HStack gap={8}>
                  <Icon name="pushpin" size={18} color={colors.warn} />
                  <Text style={[type.smallStrong, { color: colors.warn }]}>{`${n.pinned ? 'Pinned notice' : 'Latest notice'} · ${nameOf(n.author_id)} · ${formatWhen(n.created_at)}`}</Text>
                </HStack>
                <Text style={type.body}>{n.body}</Text>
                <LinkButton label="All notices" onPress={() => navigate({ name: 'notices' })} />
              </Card>
            );
          })()
        : null}

      <Grid columns={2} gap={8}>
        <Button label="Add a bill" icon="receipt" variant="secondary" onPress={() => navigate({ name: 'addBill', month: toIsoDate(month) })} />
        <Button label="Propose a buy" icon="cart" variant="secondary" onPress={() => navigate({ name: 'proposeBuy' })} />
        <Button label="Post a notice" icon="megaphone" variant="secondary" onPress={() => navigate({ name: 'notices' })} />
        <Button label="Report repair" icon="wrench" variant="secondary" onPress={() => navigate({ name: 'repairNew' })} />
      </Grid>
    </Screen>
  );
}

function dinnerSummary(byUser: Map<string, { choice: DinnerChoice }>, people: string[]): string {
  const counts = new Map<string, number>();
  for (const id of people) {
    const c = byUser.get(id)?.choice;
    const word = c ? DINNER[c].word : UNDECIDED.word;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()].map(([w, n]) => `${n} ${w}`).join(' · ') || 'Nobody has decided yet';
}

function BillsCard({
  month,
  bills,
  nameOf,
  onAll,
  onOpen,
}: {
  month: Date;
  bills: Awaited<ReturnType<typeof loadMonthBills>> | null;
  nameOf: (id: string | null) => string;
  onAll: () => void;
  onOpen: (id: string) => void;
}) {
  const { unpaid, paid } = sortBills(bills ?? []);
  const total = (bills ?? []).reduce((n, b) => n + (b.amount ?? 0), 0);
  const paidTotal = paid.reduce((n, b) => n + (b.amount ?? 0), 0);
  return (
    <Card title={`Bills · ${formatMonthShort(month).split(' ')[0]}`} action={<LinkButton label="All bills" onPress={onAll} />}>
      {bills === null ? (
        <Hint>Loading...</Hint>
      ) : bills.length === 0 ? (
        <Hint>No bills this month yet. Add one, or set up recurring bills for rent, light bill and WiFi.</Hint>
      ) : (
        <>
          <HStack gap={8}>
            <Pill text={`${unpaid.length} unpaid`} bg={unpaid.length ? colors.warnSoft : colors.goodSoft} fg={unpaid.length ? colors.warn : colors.good} />
            <Hint>{`${paid.length} paid · ${rupees(paidTotal)} of ${rupees(total)}`}</Hint>
          </HStack>
          {unpaid.length === 0 ? <Hint>Everything is paid this month.</Hint> : null}
          {unpaid.slice(0, 3).map((b) => {
            const s = describeStatus(b, nameOf);
            const c = categoryStyle(b.title.split(',')[0] ?? '');
            return (
              <ListRow
                key={b.id}
                icon={c.icon}
                iconBg={c.bg}
                iconColor={c.fg}
                title={b.title}
                subtitle={s.text}
                subtitleColor={s.tone === 'bad' ? colors.bad : s.tone === 'warn' ? colors.warn : colors.muted}
                right={amountText(b.amount)}
                onPress={() => onOpen(b.id)}
              />
            );
          })}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  greet: { gap: 2 },
  between: { justifyContent: 'space-between' },
  person: { alignItems: 'center', gap: 4, paddingVertical: 6, borderRadius: 12 },
  personPressed: { backgroundColor: colors.background },
  personName: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
  personState: { fontFamily: fonts.medium, fontSize: 12 },
  seg: { minHeight: 64, borderRadius: 14, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 6 },
  segOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  segText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.text },
  segTextOn: { color: colors.onPrimary },
  cost: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
});
