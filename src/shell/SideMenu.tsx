import { useEffect, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { Icon, IconName } from '../components/Icon';
import { useCounts } from '../flats/CountsProvider';
import { useCurrentFlat, useFlats } from '../flats/FlatProvider';
import { useNav } from '../nav/NavProvider';
import { Route, RouteName } from '../nav/routes';
import { colors, fonts, initialOf } from '../theme';

const WIDTH = 308;

interface Item {
  route: RouteName;
  label: string;
  icon: IconName;
  badge?: number;
}

export function SideMenu() {
  const insets = useSafeAreaInsets();
  const { drawerOpen, closeDrawer, navigate, current } = useNav();
  const { flat, role } = useCurrentFlat();
  const { members, memberships, selectFlat } = useFlats();
  const { signOut } = useAuth();
  const counts = useCounts();
  const [switching, setSwitching] = useState(false);
  const [offset] = useState(() => new Animated.Value(-WIDTH));
  const [shade] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(offset, { toValue: drawerOpen ? 0 : -WIDTH, duration: 220, useNativeDriver: true }),
      Animated.timing(shade, { toValue: drawerOpen ? 1 : 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [drawerOpen, offset, shade]);

  const memberCount = members.filter((m) => m.leftAt === null).length;
  const groups: { label: string; items: Item[] }[] = [
    {
      label: 'Daily',
      items: [
        { route: 'home', label: 'Home', icon: 'home' },
        { route: 'bills', label: 'Bills', icon: 'receipt', badge: counts.unpaidBills },
        { route: 'dinner', label: 'Dinner tonight', icon: 'utensils' },
        { route: 'buy', label: 'Buy list', icon: 'cart', badge: counts.openBuy },
        { route: 'presence', label: "Who's home", icon: 'users' },
      ],
    },
    {
      label: 'Flat',
      items: [
        { route: 'flatInfo', label: 'Flat info', icon: 'building' },
        { route: 'notices', label: 'Notice board', icon: 'megaphone' },
        { route: 'polls', label: 'Polls', icon: 'poll', badge: counts.openPolls },
        { route: 'repairs', label: 'Repairs', icon: 'wrench', badge: counts.openRepairs },
        { route: 'members', label: 'Members and invite', icon: 'userPlus' },
      ],
    },
    {
      label: 'You',
      items: [
        { route: 'notifications', label: 'Notifications', icon: 'bell', badge: counts.unreadAlerts },
        { route: 'settings', label: 'Settings', icon: 'gear' },
      ],
    },
  ];

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={drawerOpen ? 'auto' : 'none'}
      // Closed, the menu is only slid off screen: keep TalkBack from reading it out.
      importantForAccessibility={drawerOpen ? 'auto' : 'no-hide-descendants'}
      accessibilityElementsHidden={!drawerOpen}
    >
      <Animated.View style={[StyleSheet.absoluteFill, styles.shade, { opacity: shade }]}>
        <Pressable collapsable={false} style={StyleSheet.absoluteFill} onPress={closeDrawer} accessibilityRole="button" accessibilityLabel="Close menu" />
      </Animated.View>
      <Animated.View
        style={[styles.panel, { paddingTop: insets.top, paddingBottom: insets.bottom, transform: [{ translateX: offset }] }]}
        accessibilityViewIsModal
      >
        <View style={styles.head}>
          <View style={styles.flatRow}>
            <View style={styles.flatMark}>
              <Text style={styles.flatMarkText}>{initialOf(flat.name)}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.flatName} numberOfLines={1}>
                {flat.name}
              </Text>
              <Text style={styles.flatMeta}>
                {memberCount} {memberCount === 1 ? 'member' : 'members'} · {role === 'admin' ? "you're the admin" : "you're a member"}
              </Text>
            </View>
          </View>
          <Pressable collapsable={false} onPress={() => setSwitching((v) => !v)} style={styles.switchButton} accessibilityRole="button" accessibilityState={{ expanded: switching }}>
            <Text style={styles.switchText}>Switch flat</Text>
            <Icon name="down" size={18} color={colors.primary} />
          </Pressable>
          {switching ? (
            <View style={styles.flatList}>
              {memberships.map((m) => (
                <Pressable
                  key={m.flat.id}
                  collapsable={false}
                  style={styles.flatOption}
                  onPress={() => {
                    selectFlat(m.flat.id);
                    setSwitching(false);
                    navigate({ name: 'home' });
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: m.flat.id === flat.id }}
                >
                  <Text style={[styles.flatOptionText, m.flat.id === flat.id && styles.flatOptionOn]}>{m.flat.name}</Text>
                  {m.flat.id === flat.id ? <Icon name="check" size={18} color={colors.primary} /> : null}
                </Pressable>
              ))}
              <Pressable
                collapsable={false}
                style={styles.flatOption}
                onPress={() => {
                  setSwitching(false);
                  navigate({ name: 'addFlat' });
                }}
                accessibilityRole="button"
              >
                <Text style={[styles.flatOptionText, { color: colors.primary }]}>Create or join another flat</Text>
                <Icon name="plus" size={18} color={colors.primary} />
              </Pressable>
            </View>
          ) : null}
        </View>

        <ScrollView style={styles.flex} contentContainerStyle={styles.groups}>
          {groups.map((g) => (
            <View key={g.label} style={styles.group}>
              <Text style={styles.groupLabel}>{g.label}</Text>
              {g.items.map((it) => {
                const on = current.name === it.route;
                return (
                  <Pressable
                    key={it.route}
                    collapsable={false}
                    onPress={() => navigate({ name: it.route } as Route)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={({ pressed }) => [styles.item, on && styles.itemOn, pressed && !on && styles.itemPressed]}
                  >
                    <Icon name={it.icon} size={22} color={on ? colors.primaryDark : colors.text} />
                    <Text style={[styles.itemText, on && styles.itemTextOn]}>{it.label}</Text>
                    {it.badge ? (
                      <View style={[styles.badge, on && styles.badgeOn]}>
                        <Text style={[styles.badgeText, on && styles.badgeTextOn]}>{it.badge}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>

        <View style={styles.foot}>
          <Pressable collapsable={false} onPress={() => void signOut()} style={({ pressed }) => [styles.item, pressed && styles.itemPressed]} accessibilityRole="button">
            <Icon name="logout" size={22} color={colors.text} />
            <Text style={styles.itemText}>Sign out</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  shade: { backgroundColor: colors.backdrop },
  panel: { position: 'absolute', top: 0, bottom: 0, left: 0, width: WIDTH, backgroundColor: colors.card, elevation: 16 },
  head: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.divider },
  flatRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flatMark: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  flatMarkText: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.onPrimary },
  flatName: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  flatMeta: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  switchButton: { minHeight: 36, borderRadius: 10, borderWidth: 1, borderColor: colors.inputBorder, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.primary },
  flatList: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden' },
  flatOption: { minHeight: 44, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.divider },
  flatOptionText: { fontFamily: fonts.medium, fontSize: 14, color: colors.text },
  flatOptionOn: { fontFamily: fonts.semibold },
  groups: { paddingHorizontal: 10, paddingVertical: 6, gap: 6 },
  group: { gap: 2 },
  groupLabel: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.9, color: colors.muted, textTransform: 'uppercase', paddingHorizontal: 14, paddingVertical: 2 },
  item: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 14 },
  itemOn: { backgroundColor: colors.primarySoft },
  itemPressed: { backgroundColor: '#F3F5FA' },
  itemText: { fontFamily: fonts.medium, fontSize: 15, color: colors.text, flex: 1 },
  itemTextOn: { fontFamily: fonts.semibold, color: colors.primaryDark },
  badge: { minWidth: 22, height: 22, paddingHorizontal: 7, borderRadius: 11, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  badgeOn: { backgroundColor: colors.primary },
  badgeText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.primaryDark },
  badgeTextOn: { color: colors.onPrimary },
  foot: { paddingHorizontal: 10, paddingVertical: 4, borderTopWidth: 1, borderTopColor: colors.divider },
});
