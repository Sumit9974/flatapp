import { Alert, StyleSheet, Text, View } from 'react-native';
import { loadCategories } from '../bills/model';
import { Icon } from '../components/Icon';
import { Button, Card, Empty, Hint, HStack, Loading, Notice, Screen, Switch, type } from '../components/ui';
import { categoryStyle } from '../data/meta';
import { useCurrentFlat } from '../flats/FlatProvider';
import { check, messageOf, unwrap } from '../lib/errors';
import { ordinal, rupees } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useLive } from '../lib/useLive';
import { useNav } from '../nav/NavProvider';
import { colors } from '../theme';

export function RecurringScreen() {
  const { flat } = useCurrentFlat();
  const { navigate } = useNav();
  const live = useLive(`recurring:${flat.id}`, async () => {
    const [templates, categories] = await Promise.all([
      supabase.from('bill_templates').select('*').eq('flat_id', flat.id).order('due_day'),
      loadCategories(flat.id),
    ]);
    return { templates: unwrap(templates), categories: new Map(categories.map((c) => [c.id, c.name])) };
  });

  if (live.data === null && !live.error) return <Loading />;

  const toggle = async (id: string, active: boolean) => {
    try {
      check(await supabase.from('bill_templates').update({ active }).eq('id', id));
      await live.reload();
    } catch (e: unknown) {
      Alert.alert('Could not change it', messageOf(e));
    }
  };

  return (
    <Screen onRefresh={live.onRefresh} refreshing={live.refreshing}>
      {live.error ? <Notice message={live.error} tone="error" onDismiss={live.clearError} /> : null}
      <Hint>Set these once. Each month’s bill appears in Bills on the 1st, and everyone gets a reminder before it is due until someone marks it paid.</Hint>
      {live.data && live.data.templates.length === 0 ? (
        <Card>
          <Empty icon="repeat" text="No recurring bills yet. Add rent, light bill, WiFi and the like once." />
        </Card>
      ) : null}
      {live.data?.templates.map((t) => {
        const name = live.data?.categories.get(t.category_id) ?? 'Bill';
        const c = categoryStyle(name);
        const remind = t.remind_days_before === 0 ? 'on the day' : `${t.remind_days_before} day${t.remind_days_before === 1 ? '' : 's'} before`;
        return (
          <Card key={t.id}>
            <HStack>
              <View style={[styles.cat, { backgroundColor: c.bg }]}>
                <Icon name={c.icon} size={20} color={c.fg} />
              </View>
              <View style={styles.flex}>
                <Text style={type.bodyStrong} onPress={() => navigate({ name: 'recurringEdit', id: t.id })}>
                  {name}
                </Text>
                <Text style={type.small}>{`Due on the ${ordinal(t.due_day)}, reminder ${remind}`}</Text>
              </View>
              <Switch value={t.active} label={`${name} active`} onValueChange={(v) => void toggle(t.id, v)} />
            </HStack>
            <View style={styles.between}>
              <Text style={[type.small, !t.active && { color: colors.warn }]}>{t.active ? 'Active' : 'Paused: no new bills'}</Text>
              <Text style={type.bodyStrong}>{t.amount === null ? 'Amount varies' : `${rupees(t.amount)} a month`}</Text>
            </View>
            <Button label="Edit" size="sm" variant="secondary" icon="edit" onPress={() => navigate({ name: 'recurringEdit', id: t.id })} />
          </Card>
        );
      })}
      <Button label="Add recurring bill" icon="plus" onPress={() => navigate({ name: 'recurringEdit' })} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cat: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
