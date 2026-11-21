import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { Icon } from '../components/Icon';
import { Avatar, Between, Button, Card, Chip, Chips, Field, FieldLabel, Hint, HStack, Notice, Pill, Screen, Switch, type } from '../components/ui';
import { describePresence } from '../data/meta';
import { loadPresence } from '../data/queries';
import { useCurrentFlat, useFlats } from '../flats/FlatProvider';
import { requestPermissions } from '../geofence/control';
import { supabase } from '../lib/supabase';
import { useLive } from '../lib/useLive';
import { useNav } from '../nav/NavProvider';
import { syncPresenceGeofences } from '../presence/sync';
import { colors } from '../theme';

type Manual = 'none' | 'late' | 'away';

export function PresenceScreen() {
  const { userId } = useAuth();
  const { flat, role } = useCurrentFlat();
  const { members, memberships } = useFlats();
  const { navigate } = useNav();
  const [bgGranted, setBgGranted] = useState<boolean | null>(null);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);

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
  const others = members.filter((m) => m.leftAt === null && m.userId !== userId);

  const headline =
    me.state === 'home' ? "You're home" : me.state === 'out' ? "You're out" : me.state === 'away' ? "You're away" : me.state === 'hidden' ? 'Not sharing' : 'Not set up yet';
  const detail =
    me.state === 'hidden'
      ? 'Flatmates see "Not sharing"'
      : me.state === 'unknown'
        ? !hasPin
          ? 'The flat has no home pin yet'
          : bgGranted === false
            ? 'Allow location so your phone can tell'
            : 'Your phone reports it the next time you cross the circle'
        : `${me.detail}${me.state === 'home' || me.state === 'out' ? ', detected by your phone' : ''}`;

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
    <Screen onRefresh={live.onRefresh} refreshing={live.refreshing}>
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
                <Text style={type.small}>{p.detail}</Text>
              </View>
              <Pill text={p.short} bg={p.pillBg} fg={p.pillFg} />
            </View>
          );
        })}
      </Card>

      <HStack gap={10} style={styles.top}>
        <Icon name="pin" size={18} color={colors.muted} />
        <Text style={[type.small, styles.flex]}>{`Home means within ${flat.radius_m} m of the flat's pin. Your phone tells the app when you cross it, which can take a few minutes.`}</Text>
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
