import { useEffect, useState } from 'react';
import { Alert, AppState, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { Avatar, Button, Card, Field, Grid, HStack, ListRow, Screen, Switch, type } from '../components/ui';
import { DEFAULT_PREFS, loadPrefs, Prefs, savePrefs } from '../data/queries';
import { useCurrentFlat, useFlats } from '../flats/FlatProvider';
import { check, messageOf } from '../lib/errors';
import { supabase } from '../lib/supabase';
import { useLive } from '../lib/useLive';
import { canUseBiometrics, isBiometricLockOn, setBiometricLock } from '../lock/settings';
import { useNav } from '../nav/NavProvider';
import { enablePush, openPhoneSettings, pushState, PushState } from '../push/push';
import { colors } from '../theme';

const PUSH_TEXT: Record<PushState, string> = {
  on: 'On for this phone, even when FlatApp is closed',
  off: 'Off. Turn on to hear about changes when the app is closed',
  blocked: 'Blocked in the phone’s settings for FlatApp',
  unavailable: 'Not available on this phone',
};

const PREF_ROWS: { key: keyof Prefs; label: string; hint: string }[] = [
  { key: 'dinner', label: 'Dinner changes', hint: 'When a flatmate changes their dinner' },
  { key: 'bills', label: 'Bills', hint: 'Marked paid or unpaid, reminders, overdue' },
  { key: 'buy', label: 'Buy list', hint: 'New items, bought or cancelled' },
  { key: 'notices', label: 'Notices, polls and repairs', hint: 'New notices, polls, repairs and members' },
  { key: 'presence', label: 'Arrive and leave', hint: 'When a flatmate gets home or leaves' },
];

export function SettingsScreen() {
  const { userId, session, profile, refreshProfile, signOut } = useAuth();
  const { flat, role } = useCurrentFlat();
  const { memberships, members, refresh } = useFlats();
  const { navigate } = useNav();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState('');
  const [lockOn, setLockOn] = useState(isBiometricLockOn);
  const [biometrics, setBiometrics] = useState<boolean | null>(null);
  const [prefsDraft, setPrefsDraft] = useState<Prefs | null>(null);
  const [push, setPush] = useState<PushState | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  const prefsLive = useLive(userId ? `prefs:${userId}` : null, () => loadPrefs(userId ?? ''));
  const prefs = prefsDraft ?? prefsLive.data ?? DEFAULT_PREFS;

  useEffect(() => {
    void canUseBiometrics().then(setBiometrics);
    pushState().then(setPush, () => setPush('unavailable'));
    // Coming back from the phone's settings: show what was changed there.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') enablePush(false).then(setPush, () => undefined);
    });
    return () => sub.remove();
  }, []);

  const turnOnPush = async () => {
    setPushBusy(true);
    try {
      setPush(await enablePush(true));
    } catch (e: unknown) {
      Alert.alert('Could not turn on notifications', messageOf(e));
    } finally {
      setPushBusy(false);
    }
  };

  const sendTest = async () => {
    setPushBusy(true);
    try {
      // Re-register first, so a test always goes to this phone's current token.
      await enablePush(false);
      check(await supabase.rpc('send_test_notification', { p_flat: flat.id }));
      Alert.alert('Test sent', 'It should arrive on this phone in a few seconds, even if you close the app.');
    } catch (e: unknown) {
      Alert.alert('Could not send the test', messageOf(e));
    } finally {
      setPushBusy(false);
    }
  };

  const saveName = async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > 40) {
      Alert.alert('Use 1 to 40 characters for your name.');
      return;
    }
    try {
      check(await supabase.from('profiles').update({ display_name: trimmed }).eq('id', userId ?? ''));
      await refreshProfile();
      await refresh();
      setEditingName(false);
    } catch (e: unknown) {
      Alert.alert('Could not save', messageOf(e));
    }
  };

  const togglePref = async (key: keyof Prefs, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefsDraft(next);
    try {
      await savePrefs(next);
    } catch (e: unknown) {
      setPrefsDraft(null);
      Alert.alert('Could not save', messageOf(e));
    }
  };

  const memberCount = members.filter((m) => m.leftAt === null).length;
  const displayName = profile?.display_name ?? '';

  return (
    <Screen>
      <Card>
        {editingName ? (
          <>
            <Field label="Your name" value={name} onChangeText={setName} maxLength={40} autoFocus />
            <Grid columns={2} gap={8}>
              <Button label="Cancel" variant="secondary" onPress={() => setEditingName(false)} />
              <Button label="Save" onPress={() => void saveName()} />
            </Grid>
          </>
        ) : (
          <HStack>
            <Avatar id={userId ?? 'me'} name={displayName || '?'} size={52} />
            <View style={styles.flex}>
              <Text style={type.title}>{displayName}</Text>
              <Text style={type.small}>{session?.user.email ?? ''}</Text>
            </View>
            <Button
              label="Edit"
              icon="edit"
              size="sm"
              variant="secondary"
              onPress={() => {
                setName(displayName);
                setEditingName(true);
              }}
            />
          </HStack>
        )}
      </Card>

      <Card title="Security" list>
        <ListRow
          first
          icon="fingerprint"
          iconBg={colors.primarySoft}
          iconColor={colors.primary}
          title="Fingerprint lock"
          subtitle={biometrics === false ? 'This phone has no fingerprint set up' : 'Ask for it when FlatApp opens'}
          accessory={
            <Switch
              value={lockOn}
              label="Fingerprint lock"
              disabled={biometrics !== true}
              onValueChange={(v) => {
                setBiometricLock(v);
                setLockOn(v);
              }}
            />
          }
        />
      </Card>

      <Card title="Notify me about" list>
        <ListRow
          first
          icon="bell"
          iconBg={colors.primarySoft}
          iconColor={colors.primary}
          title="Phone notifications"
          subtitle={PUSH_TEXT[push ?? 'off']}
          accessory={
            push === 'on' ? (
              <Button label="Send a test" size="sm" variant="secondary" busy={pushBusy} onPress={() => void sendTest()} />
            ) : push === 'off' ? (
              <Button label="Turn on" size="sm" busy={pushBusy} onPress={() => void turnOnPush()} />
            ) : push === 'blocked' ? (
              <Button label="Open settings" size="sm" variant="secondary" onPress={openPhoneSettings} />
            ) : undefined
          }
        />
        {PREF_ROWS.map((r) => (
          <ListRow key={r.key} title={r.label} subtitle={r.hint} accessory={<Switch value={prefs[r.key]} label={r.label} onValueChange={(v) => void togglePref(r.key, v)} />} />
        ))}
      </Card>

      <Card title="Flat" list>
        <ListRow
          first
          title="Home pin and radius"
          subtitle={`${flat.home_lat === null ? 'Not set' : `${flat.radius_m} m around the flat`}${role === 'admin' ? '' : ' · admin only'}`}
          chevron={role === 'admin'}
          onPress={role === 'admin' ? () => navigate({ name: 'homePin' }) : undefined}
        />
        <ListRow title="Members and invite code" subtitle={`${memberCount} ${memberCount === 1 ? 'member' : 'members'}`} chevron onPress={() => navigate({ name: 'members' })} />
        <ListRow title="Create or join another flat" subtitle={`You are in ${memberships.length} ${memberships.length === 1 ? 'flat' : 'flats'}`} chevron onPress={() => navigate({ name: 'addFlat' })} />
        <ListRow title="Geofence test" subtitle="The 3-day home and away test" chevron onPress={() => navigate({ name: 'geofenceTest' })} />
      </Card>

      <Button label="Sign out" icon="logout" variant="secondary" onPress={() => void signOut()} />
      <Text style={[type.tiny, styles.center]}>FlatApp 1.0 · Android</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
});
