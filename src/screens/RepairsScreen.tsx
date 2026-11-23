import { Alert, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { Icon } from '../components/Icon';
import { Button, Card, Empty, Fab, Hint, HStack, LinkButton, ListRow, Notice, Screen, type } from '../components/ui';
import { loadRepairs, Repair } from '../data/queries';
import { useCurrentFlat, useFlats } from '../flats/FlatProvider';
import { formatWhen } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useLive } from '../lib/useLive';
import { useNav } from '../nav/NavProvider';
import { colors } from '../theme';

export function RepairsScreen() {
  const { userId } = useAuth();
  const { flat, role } = useCurrentFlat();
  const { nameOf } = useFlats();
  const { navigate } = useNav();
  const live = useLive(`repairs:${flat.id}`, () => loadRepairs(flat.id), [{ table: 'repairs', filter: `flat_id=eq.${flat.id}` }]);
  const open = (live.data ?? []).filter((r) => r.status === 'open');
  const fixed = (live.data ?? []).filter((r) => r.status === 'fixed');
  const who = (id: string | null) => (id === userId ? 'you' : nameOf(id));

  const fix = async (id: string) => {
    const { error } = await supabase.rpc('fix_repair', { p_repair: id });
    if (error) Alert.alert('Could not mark it', error.message);
    else await live.reload();
  };

  // Same rule as the server (delete_repair): whoever reported it, or an admin.
  const canDelete = (r: Repair) => r.reported_by === userId || role === 'admin';

  // For mistakes; "Mark fixed" stays the normal ending.
  const confirmDelete = (r: Repair) =>
    Alert.alert(`Delete "${r.title}"?`, 'It is removed for everyone. This cannot be undone.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void supabase.rpc('delete_repair', { p_repair: r.id }).then(({ error }) => (error ? Alert.alert('Could not delete it', error.message) : live.reload())),
      },
    ]);

  return (
    <View style={styles.flex}>
      <Screen onRefresh={live.onRefresh} refreshing={live.refreshing} withFab>
        {live.error ? <Notice message={live.error} tone="error" onDismiss={live.clearError} /> : null}
        <Text style={type.h2}>{`Open (${open.length})`}</Text>
        {live.data && open.length === 0 ? (
          <Card>
            <Empty icon="wrench" text="Nothing broken right now." />
          </Card>
        ) : null}
        {open.map((r) => (
          <Card key={r.id}>
            <HStack style={styles.top}>
              <View style={[styles.icon, { backgroundColor: colors.warnSoft }]}>
                <Icon name="wrench" size={20} color={colors.warn} />
              </View>
              <View style={styles.flex}>
                <Text style={type.bodyStrong}>{r.title}</Text>
                <Text style={type.small}>{`Reported by ${who(r.reported_by)}, ${formatWhen(r.created_at)}`}</Text>
              </View>
            </HStack>
            {r.details ? <Text style={type.body}>{r.details}</Text> : null}
            <HStack gap={20}>
              <Button label="Mark fixed" icon="check" size="sm" variant="secondary" onPress={() => void fix(r.id)} />
              {canDelete(r) ? <LinkButton label="Delete" color={colors.bad} onPress={() => confirmDelete(r)} /> : null}
            </HStack>
          </Card>
        ))}
        {fixed.length > 0 ? (
          <>
            <Text style={type.h2}>Fixed</Text>
            <Card list>
              {fixed.map((r, i) => (
                <ListRow
                  key={r.id}
                  first={i === 0}
                  icon="check"
                  iconBg={colors.goodSoft}
                  iconColor={colors.good}
                  title={r.title}
                  subtitle={`Fixed by ${who(r.fixed_by)}${r.fixed_at ? `, ${formatWhen(r.fixed_at)}` : ''}`}
                  accessory={canDelete(r) ? <LinkButton label="Delete" color={colors.bad} onPress={() => confirmDelete(r)} /> : undefined}
                />
              ))}
            </Card>
          </>
        ) : null}
        <Hint>Reporting or fixing something notifies everyone in the flat.</Hint>
      </Screen>
      <Fab label="Report" onPress={() => navigate({ name: 'repairNew' })} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { alignItems: 'flex-start' },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
