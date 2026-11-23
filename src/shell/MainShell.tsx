import { useEffect, useEffectEvent } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { useFlats } from '../flats/FlatProvider';
import { useNav } from '../nav/NavProvider';
import { Route, TOP_LEVEL } from '../nav/routes';
import { ScreenFocus } from '../nav/ScreenFocus';
import { flushPresence } from '../presence/report';
import { pinsKey, syncPresenceGeofences } from '../presence/sync';
import { reportWifiHome } from '../presence/wifi';
import { enablePush, watchPushToken } from '../push/push';
import { usePushOpen } from '../push/usePushOpen';
import { AddBillScreen } from '../screens/AddBillScreen';
import { BillDetailScreen } from '../screens/BillDetailScreen';
import { BillsScreen } from '../screens/BillsScreen';
import { BuyScreen } from '../screens/BuyScreen';
import { ChangePasswordScreen } from '../screens/ChangePasswordScreen';
import { DinnerScreen } from '../screens/DinnerScreen';
import { FlatInfoEditScreen } from '../screens/FlatInfoEditScreen';
import { FlatInfoScreen } from '../screens/FlatInfoScreen';
import { FlatSetupScreen } from '../screens/FlatSetupScreen';
import { GeofenceTestScreen } from '../screens/GeofenceTestScreen';
import { HomePinScreen } from '../screens/HomePinScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { MembersScreen } from '../screens/MembersScreen';
import { NoticesScreen } from '../screens/NoticesScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { PollNewScreen } from '../screens/PollNewScreen';
import { PollsScreen } from '../screens/PollsScreen';
import { PresenceScreen } from '../screens/PresenceScreen';
import { ProposeBuyScreen } from '../screens/ProposeBuyScreen';
import { RecurringEditScreen } from '../screens/RecurringEditScreen';
import { RecurringScreen } from '../screens/RecurringScreen';
import { RepairNewScreen } from '../screens/RepairNewScreen';
import { RepairsScreen } from '../screens/RepairsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { colors } from '../theme';
import { AppHeader } from './AppHeader';
import { BottomTabs } from './BottomTabs';
import { SideMenu } from './SideMenu';

// Ask for notification permission once per app start, not again on every flat switch.
const session = { askedForPush: false, presenceRefreshedAt: 0 };

/** Coming back to the app re-checks Home/Out at most this often. */
const PRESENCE_REFRESH_MS = 5 * 60_000;

/** The signed-in app: header, the open screen, bottom tabs on top-level screens, and the side menu. */
export function MainShell() {
  const { stack, current } = useNav();
  const { memberships } = useFlats();

  // Keep the phone's Home/Out circles and Wi-Fi list in step with the flats and send any Home/Out a
  // failed background call left waiting. Runs on start, whenever a pin, radius, Wi-Fi name or the
  // list of flats changes, and when the app comes back to the front (at most every 5 minutes):
  // re-registering the circles makes Android report Home/Out afresh, and being on the flat's Wi-Fi
  // confirms Home. Does nothing until background location is allowed.
  const key = pinsKey(memberships);
  const syncPins = useEffectEvent((force: boolean) => {
    const now = Date.now();
    if (!force && now - session.presenceRefreshedAt < PRESENCE_REFRESH_MS) return;
    session.presenceRefreshedAt = now;
    flushPresence().catch(() => undefined);
    syncPresenceGeofences(memberships)
      .then(() => reportWifiHome())
      .catch(() => undefined);
  });
  useEffect(() => {
    syncPins(true);
  }, [key]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncPins(false);
    });
    return () => sub.remove();
  }, []);

  // Phone notifications: register this phone (asking once), keep its token current, and open the
  // right screen when one is tapped.
  useEffect(() => {
    const ask = !session.askedForPush;
    session.askedForPush = true;
    enablePush(ask).catch(() => undefined);
    return watchPushToken();
  }, []);
  usePushOpen();

  return (
    <View style={styles.root}>
      <AppHeader />
      <View style={styles.body}>
        {stack.map((route, i) => {
          const top = i === stack.length - 1;
          return (
            // Lower screens stay mounted but hidden, so going back keeps their month, scroll and drafts.
            <View key={`${i}:${routeKey(route)}`} style={top ? styles.fill : styles.hidden} collapsable={false}>
              <ScreenFocus.Provider value={top}>
                <RouteView route={route} />
              </ScreenFocus.Provider>
            </View>
          );
        })}
      </View>
      {TOP_LEVEL.has(current.name) ? <BottomTabs /> : null}
      <SideMenu />
    </View>
  );
}

function routeKey(route: Route): string {
  switch (route.name) {
    case 'billDetail':
      return `billDetail:${route.id}`;
    case 'addBill':
      return `addBill:${route.month}`;
    case 'recurringEdit':
      return `recurringEdit:${route.id ?? 'new'}`;
    default:
      return route.name;
  }
}

function RouteView({ route }: { route: Route }) {
  const { back } = useNav();
  switch (route.name) {
    case 'home':
      return <HomeScreen />;
    case 'bills':
      return <BillsScreen />;
    case 'dinner':
      return <DinnerScreen />;
    case 'buy':
      return <BuyScreen />;
    case 'presence':
      return <PresenceScreen />;
    case 'flatInfo':
      return <FlatInfoScreen />;
    case 'notices':
      return <NoticesScreen />;
    case 'polls':
      return <PollsScreen />;
    case 'repairs':
      return <RepairsScreen />;
    case 'members':
      return <MembersScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'billDetail':
      return <BillDetailScreen id={route.id} />;
    case 'addBill':
      return <AddBillScreen month={route.month} />;
    case 'recurring':
      return <RecurringScreen />;
    case 'recurringEdit':
      return <RecurringEditScreen id={route.id} />;
    case 'proposeBuy':
      return <ProposeBuyScreen />;
    case 'notifications':
      return <NotificationsScreen />;
    case 'flatInfoEdit':
      return <FlatInfoEditScreen />;
    case 'pollNew':
      return <PollNewScreen />;
    case 'repairNew':
      return <RepairNewScreen />;
    case 'homePin':
      return <HomePinScreen />;
    case 'changePassword':
      return <ChangePasswordScreen />;
    case 'addFlat':
      return <FlatSetupScreen onDone={back} />;
    case 'geofenceTest':
      return <GeofenceTestScreen />;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  fill: { flex: 1 },
  hidden: { display: 'none' },
});
