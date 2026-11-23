import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { Icon } from '../components/Icon';
import { getCurrentSsid } from '../../modules/flat-wifi';
import { Avatar, Between, Button, Card, Chip, Chips, Field, FieldLabel, Hint, HStack, LinkButton, Notice, Pill, Screen, Switch, type } from '../components/ui';
import { describePresence } from '../data/meta';
import { loadPresence } from '../data/queries';
import { useCurrentFlat, useFlats } from '../flats/FlatProvider';
import { requestPermissions } from '../geofence/control';
import { formatWhen } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useLive } from '../lib/useLive';
import { useNav } from '../nav/NavProvider';
import { STALE_AFTER_HOURS } from '../presence/config';
import { checkinOverdueSince, syncPresenceGeofences } from '../presence/sync';
import { colors } from '../theme';

type Manual = 'none' | 'late' | 'away';

export function PresenceScreen() {
  const { userId } = useAuth();
  const { flat, role } = useCurrentFlat();
  const { members, memberships, refresh } = useFlats();
  const { navigate } = useNav();
  const [bgGranted, setBgGranted] = useState<boolean | null>(null);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  // The network this phone is on now; read on open, on pull-to-refresh and after a change.
  const [ssid, setSsid] = useState<string | null>(() => getCurrentSsid());
  const [wifiBusy, setWifiBusy] = useState(false);

  const live = useLive(`presence:${flat.id}`, () => loadPresence(flat.id), [{ table: 'presence', filter: `flat_id=eq.${flat.id}` }]);

  useEffect(() => {
    void Location.getBackgroundPermissionsAsync().then((p) => setBgGranted(p.granted));
  }, []);

  const mineRow = userId ? live.data?.get(userId) : undefined;
  const me = describePresence(mineRow);
  const manual: Manual = (mineRow?.manual as Manual | null | undefined) ?? 'none';
  const sharing = mineRow?.sharing ?? true;
  const note = noteDraft ?? mineRow?.manual_note ?? '';
  const hasPin = flat.home_lat !== null && flat.home_lng !== null;
  const networks = flat.home_networks ?? [];
  const onFlatWifi = ssid !== null && networks.includes(ssid);
  const others = members.filter((m) => m.leftAt === null && m.userId !== userId);

  // The phone's own background check-in has been quiet for hours: almost always the battery saver.
  const checkinQuietSince = bgGranted === true && (hasPin || networks.length > 0) && sharing ? checkinOverdueSince() : null;

  const onRefresh = () => {
    setSsid(getCurrentSsid());
    return live.onRefresh();
  };

  // The flat's list is shared by everyone in it. Saving refreshes the flats, and the shell then
  // re-syncs this phone (and confirms Home if it is on one of the networks).
  const changeNetworks = async (action: 'add' | 'remove', name: string) => {
    setWifiBusy(true);
    const { error } = await supabase.rpc(action === 'add' ? 'add_home_network' : 'remove_home_network', { p_flat: flat.id, p_ssid: name });
    setWifiBusy(false);
    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }
    setSsid(getCurrentSsid());
    await refresh();
  };

  const confirmRemove = (name: string) => {
    Alert.alert(`Remove ${name}?`, 'Joining it will no longer mark anyone in the flat as Home.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void changeNetworks('remove', name) },
    ]);
  };

  const wifiHint =
    ssid === null
      ? "Connect to the flat's Wi-Fi to add it here. Location must be on for the phone to read the network's name."
      : onFlatWifi
        ? `You're on ${ssid}, one of the flat's networks.`
        : `You're on ${ssid}. Add it if it is the flat's Wi-Fi.`;

  const headline =
    me.state === 'home'
      ? "You're home"
      : me.state === 'out'
        ? "You're out"
        : me.state === 'stale'
          ? 'Not checked lately'
          : me.state === 'away'
            ? "You're away"
            : me.state === 'hidden'
              ? 'Not sharing'
              : 'Not set up yet';
  const detail =
    me.state === 'hidden'
      ? 'Flatmates see "Not sharing"'
      : me.state === 'unknown'
        ? !hasPin
          ? 'The flat has no home pin yet'
          : bgGranted === false
            ? 'Allow location so your phone can tell'
            : 'Your phone reports it the next time you cross the circle'
        : `${me.detail}${me.state === 'home' || me.state === 'out' ? ', detected by your phone' : ''}${me.checked ? ` · ${me.checked}` : ''}`;

  const setManual = async (m: Manual, withNote: string | null) => {
    const { error } = await supabase.rpc('set_presence_status', {
      p_flat: flat.id,
      p_manual: (m === 'none' ? null : m) as string,
      p_note: (m === 'none' ? undefined : withNote ?? undefined) as string,
    });
    if (error) Alert.alert('Could not save', error.message);
    else {
      setNoteDraft(null);
      await live.reload();
    }
  };

  const setSharing = async (value: boolean) => {
    const { error } = await supabase.rpc('set_presence_sharing', { p_flat: flat.id, p_sharing: value });
    if (error) Alert.alert('Could not change it', error.message);
    else await live.reload();
  };

  const allowLocation = async () => {
    const p = await requestPermissions();
    setBgGranted(p.background);
    if (p.background) await syncPresenceGeofences(memberships);
    else Alert.alert('Location must be "Allow all the time"', 'Open app settings, then Permissions, Location, and choose Allow all the time.');
  };

  return (
    <Screen onRefresh={onRefresh} refreshing={live.refreshing}>
      {live.error ? <Notice message={live.error} tone="error" onDismiss={live.clearError} /> : null}
      <Card>
        <HStack>
          <Avatar id={userId ?? 'me'} name="You" size={48} dot={me.dot} />
          <View style={styles.flex}>
            <Text style={type.title}>{headline}</Text>
            <Text style={type.small}>{detail}</Text>
          </View>
        </HStack>
        {bgGranted === false ? (
          <Card tone="warn">
            <Text style={type.body}>Allow location “all the time” so your phone can share Home or Out by itself, even when the app is closed.</Text>
            <Button label="Allow location" icon="pin" onPress={() => void allowLocation()} />
          </Card>
        ) : null}
        {checkinQuietSince ? (
          <Card tone="warn">
            <Text style={type.body}>
              {`Your phone has not checked Home or Out in the background since ${formatWhen(checkinQuietSince.toISOString())}, so flatmates may see "Not sure". The battery saver is probably stopping FlatApp: open app settings, then Battery, and choose Unrestricted.`}
            </Text>
            <Button label="Open app settings" icon="gear" onPress={() => void Linking.openSettings()} />
          </Card>
        ) : null}
        {!hasPin ? (
          <Card tone="warn">
            <Text style={type.body}>{role === 'admin' ? 'Set the flat\'s home pin so phones know where "home" is.' : 'An admin needs to set the flat\'s home pin first.'}</Text>
            {role === 'admin' ? <Button label="Set home pin" icon="pin" onPress={() => navigate({ name: 'homePin' })} /> : null}
          </Card>
        ) : null}
        <FieldLabel>Tell your flatmates</FieldLabel>
        <Chips>
          <Chip label="Nothing" selected={manual === 'none'} onPress={() => void setManual('none', null)} />
          <Chip label="Coming late" selected={manual === 'late'} onPress={() => void setManual('late', note || null)} />
          <Chip label="Away for days" selected={manual === 'away'} onPress={() => void setManual('away', note || null)} />
        </Chips>
        {manual !== 'none' ? (
          <>
            <Field
              label={manual === 'late' ? 'Around when?' : 'Until when?'}
              value={note}
              onChangeText={setNoteDraft}
              maxLength={80}
              placeholder={manual === 'late' ? 'For example: around 11 pm' : 'For example: until Monday'}
            />
            {noteDraft !== null ? <Button label="Save" size="sm" variant="secondary" onPress={() => void setManual(manual, note.trim() || null)} /> : null}
          </>
        ) : null}
        <Between>
          <View style={styles.flex}>
            <Text style={type.bodyStrong}>Share Home or Out</Text>
            <Text style={type.small}>Only Home or Out is shared, never where you are.</Text>
          </View>
          <Switch value={sharing} label="Share Home or Out" onValueChange={(v) => void setSharing(v)} />
        </Between>
      </Card>

      <Card title="Flatmates" list>
        {others.length === 0 ? <Hint style={styles.pad}>Nobody else is in the flat yet. Share the invite code from Members.</Hint> : null}
        {others.map((m, i) => {
          const p = describePresence(live.data?.get(m.userId));
          return (
            <View key={m.userId} style={[styles.person, i === 0 && styles.first]}>
              <Avatar id={m.userId} name={m.name} dot={p.dot} />
              <View style={styles.flex}>
                <Text style={type.bodyStrong}>{m.name}</Text>
                <Text style={type.small}>{p.checked ? `${p.detail} · ${p.checked}` : p.detail}</Text>
              </View>
              <Pill text={p.short} bg={p.pillBg} fg={p.pillFg} />
            </View>
          );
        })}
      </Card>

      <Card title="Home Wi-Fi">
        <Text style={type.small}>Joining one of these networks marks you Home straight away. Leaving is still detected by the circle.</Text>
        {networks.length === 0 ? <Hint>No Wi-Fi added yet.</Hint> : null}
        {networks.map((name) => (
          <Between key={name}>
            <HStack gap={8} style={styles.flex}>
              <Icon name="wifi" size={18} color={name === ssid ? colors.good : colors.muted} />
              <Text style={[type.body, styles.flex]} numberOfLines={1}>
                {name}
              </Text>
            </HStack>
            <LinkButton label="Remove" onPress={() => confirmRemove(name)} />
          </Between>
        ))}
        {ssid !== null && !onFlatWifi ? (
          <Button label={`This is our Wi-Fi: ${ssid}`} icon="wifi" variant="secondary" busy={wifiBusy} onPress={() => void changeNetworks('add', ssid)} />
        ) : null}
        <Hint>{wifiHint}</Hint>
      </Card>

      <HStack gap={10} style={styles.top}>
        <Icon name="pin" size={18} color={colors.muted} />
        <Text style={[type.small, styles.flex]}>
          {`Home means on the flat's Wi-Fi, or within ${flat.radius_m} m of the flat's pin for phones that do not use it. Your phone tells the app when you cross the circle, which can take a few minutes, and checks again about every 30 minutes. "Not sure" means a phone has been quiet for ${STALE_AFTER_HOURS} hours.`}
        </Text>
      </HStack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { alignItems: 'flex-start' },
  pad: { paddingBottom: 12 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.divider },
  first: { borderTopColor: 'transparent' },
});
