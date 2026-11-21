import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { amountText, Bill, describeStatus, loadCategories, loadMonthBills, sortBills } from '../bills/model';
import { BigStat, Card, Chip, Chips, Fab, Grid, Hint, IconButton, LinkButton, ListRow, Notice, Screen, type } from '../components/ui';
import { categoryStyle } from '../data/meta';
import { useCurrentFlat, useFlats } from '../flats/FlatProvider';
import { addMonths, formatMonthLong, monthStart, rupees, toIsoDate } from '../lib/format';
import { useLive } from '../lib/useLive';
import { useNav } from '../nav/NavProvider';
import { colors } from '../theme';

type Filter = 'all' | 'unpaid' | 'paid';

export function BillsScreen() {
  const { flat } = useCurrentFlat();
  const { nameOf } = useFlats();
  const { navigate } = useNav();
  const [month, setMonth] = useState(() => monthStart(new Date()));
  const [filter, setFilter] = useState<Filter>('all');
  const monthIso = toIsoDate(month);

  const live = useLive(
    `bills:${flat.id}:${monthIso}`,
    async () => {
      const [bills, categories] = await Promise.all([loadMonthBills(flat.id, month), loadCategories(flat.id)]);
      return { bills, categories: new Map(categories.map((c) => [c.id, c.name])) };
    },
    [{ table: 'bills', filter: `flat_id=eq.${flat.id}` }],
  );

  const bills = live.data?.bills ?? null;
  const { unpaid, paid } = sortBills(bills ?? []);
  const total = (bills ?? []).reduce((n, b) => n + (b.amount ?? 0), 0);
  const paidTotal = paid.reduce((n, b) => n + (b.amount ?? 0), 0);

  const row = (b: Bill, i: number) => {
    const s = describeStatus(b, nameOf);
    const c = categoryStyle(live.data?.categories.get(b.category_id) ?? '');
    return (
      <ListRow
        key={b.id}
        first={i === 0}
        icon={c.icon}
        iconBg={c.bg}
        iconColor={c.fg}
        title={b.title}
        subtitle={s.text}
        subtitleColor={s.tone === 'good' ? colors.good : s.tone === 'bad' ? colors.bad : s.tone === 'warn' ? colors.warn : colors.muted}
        right={amountText(b.amount)}
        onPress={() => navigate({ name: 'billDetail', id: b.id })}
      />
    );
  };

  return (
    <View style={styles.flex}>
      <Screen onRefresh={live.onRefresh} refreshing={live.refreshing} withFab>
        {live.error ? <Notice message={live.error} tone="error" onDismiss={live.clearError} /> : null}
        <View style={styles.monthBar}>
          <IconButton icon="back" label="Previous month" bordered onPress={() => setMonth((m) => addMonths(m, -1))} />
          <Text style={type.title} accessibilityRole="header">
            {formatMonthLong(month)}
          </Text>
          <IconButton icon="next" label="Next month" bordered onPress={() => setMonth((m) => addMonths(m, 1))} />
        </View>
        <Grid columns={3} gap={8}>
          <BigStat label="Total" value={rupees(total)} />
          <BigStat label="Paid" value={rupees(paidTotal)} valueColor={colors.good} />
          <BigStat label="Unpaid" value={String(unpaid.length)} valueColor={colors.warn} />
        </Grid>
        <View style={styles.monthBar}>
          <Chips>
            <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
            <Chip label={`Unpaid (${unpaid.length})`} selected={filter === 'unpaid'} onPress={() => setFilter('unpaid')} />
            <Chip label={`Paid (${paid.length})`} selected={filter === 'paid'} onPress={() => setFilter('paid')} />
          </Chips>
          <LinkButton label="Recurring" onPress={() => navigate({ name: 'recurring' })} />
        </View>
        {bills === null ? (
          <Hint>Loading...</Hint>
        ) : bills.length === 0 ? (
          <Card>
            <Hint>{`No bills for ${formatMonthLong(month)}. Recurring bills appear here on the 1st of each month; add one-off bills with the button below.`}</Hint>
          </Card>
        ) : (
          <>
            {filter !== 'paid' ? (
              <Card title={`Unpaid (${unpaid.length})`} list>
                {unpaid.length === 0 ? <Hint style={styles.listHint}>Nothing unpaid.</Hint> : unpaid.map(row)}
              </Card>
            ) : null}
            {filter !== 'unpaid' && paid.length > 0 ? (
              <Card title={`Paid (${paid.length})`} list>
                {paid.map(row)}
              </Card>
            ) : null}
          </>
        )}
      </Screen>
      <Fab label="Add a bill" onPress={() => navigate({ name: 'addBill', month: toIsoDate(month) })} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  listHint: { paddingBottom: 12 },
});
