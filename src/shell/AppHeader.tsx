import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton, type } from '../components/ui';
import { useCounts } from '../flats/CountsProvider';
import { useCurrentFlat, useFlats } from '../flats/FlatProvider';
import { useNav } from '../nav/NavProvider';
import { TITLES, TOP_LEVEL } from '../nav/routes';
import { colors } from '../theme';

export function AppHeader() {
  const insets = useSafeAreaInsets();
  const { current, back, openDrawer, navigate, titleOverride } = useNav();
  const { flat } = useCurrentFlat();
  const { members } = useFlats();
  const counts = useCounts();
  const topLevel = TOP_LEVEL.has(current.name);

  const title = titleOverride ?? (current.name === 'home' ? flat.name : TITLES[current.name]);
  const memberCount = members.filter((m) => m.leftAt === null).length;
  const subtitle =
    current.name === 'home'
      ? `${memberCount} ${memberCount === 1 ? 'flatmate' : 'flatmates'} · ${counts.homeNow} home now`
      : current.name === 'bills'
        ? `${counts.unpaidBills} unpaid this month`
        : current.name === 'dinner'
          ? 'Resets at 4:00 am'
          : null;
  const unread = counts.unreadAlerts;

  return (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        {topLevel ? (
          <IconButton icon="menu" label="Open menu" onPress={openDrawer} />
        ) : (
          <IconButton icon="back" label="Back" onPress={back} size={26} />
        )}
        <View style={styles.titles}>
          <Text style={type.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? <Text style={type.tiny}>{subtitle}</Text> : null}
        </View>
        {current.name !== 'notifications' ? (
          <View>
            <IconButton
              icon="bell"
              label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
              onPress={() => navigate({ name: 'notifications' })}
            />
            {unread > 0 ? <View style={styles.unread} pointerEvents="none" /> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  bar: { height: 60, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6 },
  titles: { flex: 1, minWidth: 0, paddingLeft: 4 },
  unread: { position: 'absolute', top: 9, right: 10, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.bad, borderWidth: 2, borderColor: colors.card },
});
