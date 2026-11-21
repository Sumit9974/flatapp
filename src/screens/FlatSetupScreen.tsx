import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { Icon } from '../components/Icon';
import { Body, Button, Card, Hint, LinkButton, Screen, Field, type } from '../components/ui';
import { Flat, useFlats } from '../flats/FlatProvider';
import { shareInvite } from '../flats/invite';
import { messageOf } from '../lib/errors';
import { supabase } from '../lib/supabase';
import { colors } from '../theme';

const CODE = /^[A-Z0-9]{6}$/;

/**
 * Create a flat or join one with an invite code. First time (no flat yet) it is a full screen of
 * its own; from the menu it sits inside the app shell and calls onDone to go back.
 */
export function FlatSetupScreen({ onDone }: { onDone?: () => void }) {
  const { profile, signOut } = useAuth();
  const { memberships, refresh, selectFlat } = useFlats();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  // Set once a flat is created or joined, so a second tap cannot make a duplicate while we move on.
  const [done, setDone] = useState(false);
  const firstFlat = onDone === undefined;

  const finish = async (flat: Flat, how: 'created' | 'joined') => {
    setDone(true);
    selectFlat(flat.id);
    await refresh();
    onDone?.();
    if (how === 'created') {
      Alert.alert(
        `${flat.name} is ready`,
        `Your invite code is ${flat.invite_code}. Share it so your flatmates can join. It is also under Members and invite.`,
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Share invite', onPress: () => shareInvite(flat.name, flat.invite_code) },
        ],
      );
    }
  };

  const create = async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return setCreateError('Give the flat a name.');
    // Same rule the server enforces: one person never has two flats with the same name.
    if (memberships.some((m) => m.flat.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      return setCreateError(`You already have a flat called ${trimmed}. Pick another name.`);
    }
    setBusy('create');
    setCreateError(null);
    try {
      const { data, error } = await supabase.rpc('create_flat', { p_name: trimmed });
      if (error) throw error;
      await finish(data, 'created');
    } catch (e: unknown) {
      setCreateError(messageOf(e));
    } finally {
      setBusy(null);
    }
  };

  const join = async () => {
    const normalised = code.trim().toUpperCase();
    if (!CODE.test(normalised)) return setJoinError('Invite codes have 6 letters and numbers.');
    setBusy('join');
    setJoinError(null);
    try {
      const { data, error } = await supabase.rpc('join_flat', { p_code: normalised });
      if (error) throw error;
      await finish(data, 'joined');
    } catch (e: unknown) {
      setJoinError(messageOf(e));
    } finally {
      setBusy(null);
    }
  };

  const content = (
    <Screen>
      {firstFlat ? (
        <View style={styles.hero}>
          <View style={styles.logo}>
            <Icon name="home" size={28} color={colors.onPrimary} />
          </View>
          <Text style={type.display} accessibilityRole="header">
            {profile ? `Hi ${profile.display_name}` : 'Welcome'}
          </Text>
          <Body>Everything in FlatApp belongs to a flat. Create yours, or join the one your flatmates made.</Body>
        </View>
      ) : null}
      <Card title="Join with an invite code">
        <Field
          label="Invite code"
          value={code}
          onChangeText={(text) => {
            setCode(text.toUpperCase());
            setJoinError(null);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          placeholder="ABC234"
          error={joinError}
          hint="Ask whoever set up the flat: it is under Members and invite."
        />
        <Button label="Join flat" icon="userPlus" onPress={() => void join()} busy={busy === 'join'} disabled={busy === 'create' || done} />
      </Card>
      <Card title="Create a new flat">
        <Field
          label="Flat name"
          value={name}
          onChangeText={(text) => {
            setName(text);
            setCreateError(null);
          }}
          maxLength={60}
          placeholder="For example: Baner 302"
          error={createError}
          hint="You become its admin and get an invite code to share."
        />
        <Button label="Create flat" icon="plus" variant="secondary" onPress={() => void create()} busy={busy === 'create'} disabled={busy === 'join' || done} />
      </Card>
      {firstFlat ? (
        <View style={styles.footer}>
          <Hint>Wrong account?</Hint>
          <LinkButton label="Sign out" onPress={() => void signOut()} />
        </View>
      ) : null}
    </Screen>
  );

  // Without a flat there is no app header, so keep clear of the status bar ourselves.
  return firstFlat ? (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {content}
    </SafeAreaView>
  ) : (
    content
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  hero: { gap: 10, paddingTop: 24 },
  logo: { width: 52, height: 52, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
});
