import { Alert as RNAlert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { Icon, IconName } from '../components/Icon';
import { Between, Card, Empty, Hint, LinkButton, Notice, Screen, type } from '../components/ui';
import { Alert, loadAlerts } from '../data/queries';
import { useCurrentFlat } from '../flats/FlatProvider';
import { formatWhen } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useLive } from '../lib/useLive';
import { useNav } from '../nav/NavProvider';
import { routeForTarget } from '../nav/routes';
import { colors, fonts } from '../theme';

const KIND_STYLE: Record<string, { icon: IconName; bg: string; fg: string }> = {
  dinner: { icon: 'utensils', bg: colors.violetSoft, fg: colors.violet },
  bills: { icon: 'receipt', bg: colors.warnSoft, fg: colors.warn },
  buy: { icon: 'cart', bg: colors.goodSoft, fg: colors.good },
  notices: { icon: 'megaphone', bg: colors.primarySoft, fg: colors.primaryDark },
  presence: { icon: 'users', bg: colors.slateSoft, fg: colors.slate },
};

export function NotificationsScreen() {
  const { userId } = useAuth();
  const { flat } = useCurrentFlat();
  const { navigate } = useNav();
  const live = useLive(userId ? `alerts:${flat.id}:${userId}` : null, () => loadAlerts(flat.id, userId ?? ''), [
    { table: 'notifications', filter: `user_id=eq.${userId ?? ''}` },
  ]);
  const alerts = live.data ?? [];
  const unread = alerts.filter((a) => a.read_at === null).length;

  const markAll = async () => {
    const { error } = await supabase.rpc('mark_notifications_read', { p_flat: flat.id });
    if (error) RNAlert.alert('Could not update', error.message);
    else await live.reload();
  };

  const open = (a: Alert) => {
    if (a.read_at === null) void supabase.rpc('mark_notifications_read', { p_flat: flat.id });
    const route = routeForTarget(a.target);
    if (route) navigate(route);
  };

  return (
    <Screen onRefresh={live.onRefresh} refreshing={live.refreshing}>
      {live.error ? <Notice message={live.error} tone="error" onDismiss={live.clearError} /> : null}
      <Between>
        <Text style={type.overline}>{unread > 0 ? `${unread} unread` : 'All caught up'}</Text>
        {unread > 0 ? <LinkButton label="Mark all as read" onPress={() => void markAll()} /> : null}
      </Between>
      {live.data && alerts.length === 0 ? (
        <Card>
          <Empty icon="bell" text="Nothing yet. When flatmates mark bills, change dinner or post notices, it shows here." />
        </Card>
      ) : null}
      {alerts.length > 0 ? (
        <Card list>
          {alerts.map((a, i) => {
            const k = KIND_STYLE[a.kind] ?? KIND_STYLE.notices;
            const isUnread = a.read_at === null;
            return (
              <Pressable
                key={a.id}
                collapsable={false}
                onPress={() => open(a)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.row, i === 0 && styles.first, pressed && styles.pressed]}
              >
                <View style={[styles.icon, { backgroundColor: k?.bg }]}>
                  <Icon name={k?.icon ?? 'bell'} size={20} color={k?.fg ?? colors.text} />
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.title, isUnread && styles.titleUnread]}>{a.title}</Text>
                  {a.body ? <Text style={type.small}>{a.body}</Text> : null}
                  <Text style={type.tiny}>{formatWhen(a.created_at)}</Text>
                </View>
                {isUnread ? <View style={styles.dot} /> : null}
              </Pressable>
            );
          })}
        </Card>
      ) : null}
      <Hint>Choose what you are alerted about in Settings.</Hint>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.card },
  first: { borderTopColor: 'transparent' },
  pressed: { backgroundColor: '#FAFBFD' },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.text },
  titleUnread: { fontFamily: fonts.semibold },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary },
});
