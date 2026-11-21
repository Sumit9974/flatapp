import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName } from '../components/Icon';
import { useNav } from '../nav/NavProvider';
import { TABS } from '../nav/routes';
import { colors, fonts } from '../theme';

const TAB_INFO: Record<(typeof TABS)[number], { label: string; icon: IconName }> = {
  home: { label: 'Home', icon: 'home' },
  bills: { label: 'Bills', icon: 'receipt' },
  dinner: { label: 'Dinner', icon: 'utensils' },
  buy: { label: 'Buy list', icon: 'cart' },
};

export function BottomTabs() {
  const insets = useSafeAreaInsets();
  const { current, navigate } = useNav();
  return (
    <View style={[styles.tabs, { paddingBottom: insets.bottom }]} accessibilityRole="tablist">
      {TABS.map((name) => {
        const on = current.name === name;
        const info = TAB_INFO[name];
        const tint = on ? colors.primaryDark : colors.muted;
        return (
          <Pressable
            key={name}
            collapsable={false}
            onPress={() => navigate({ name })}
            accessibilityRole="tab"
            accessibilityLabel={info.label}
            accessibilityState={{ selected: on }}
            style={styles.tab}
          >
            <View style={[styles.pill, on && styles.pillOn]}>
              <Icon name={info.icon} size={22} color={tint} />
            </View>
            <Text style={[styles.label, { color: tint }]}>{info.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 4 },
  tab: { flex: 1, height: 68, alignItems: 'center', justifyContent: 'center', gap: 2 },
  pill: { width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: colors.primaryTint },
  label: { fontFamily: fonts.semibold, fontSize: 12 },
});
