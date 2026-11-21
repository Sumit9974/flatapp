import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { Avatar, Body, Button, Card, Field, Grid, Hint, Pill, Screen, type } from '../components/ui';
import { Member, useCurrentFlat, useFlats } from '../flats/FlatProvider';
import { shareInvite } from '../flats/invite';
import { messageOf } from '../lib/errors';
import { supabase } from '../lib/supabase';
import { useNav } from '../nav/NavProvider';
import { colors, fonts } from '../theme';

export function MembersScreen() {
  const { userId } = useAuth();
  const { flat, role } = useCurrentFlat();
  const { members, memberships, refresh, selectFlat } = useFlats();
  const { navigate } = useNav();
  const isAdmin = role === 'admin';
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const current = members.filter((m) => m.leftAt === null).sort((a, b) => (a.userId === userId ? -1 : b.userId === userId ? 1 : a.name.localeCompare(b.name)));

  const rpc = async (key: string, work: () => PromiseLike<{ error: { message: string } | null }>, done: string) => {
    setBusy(key);
    const { error } = await work();
    setBusy(null);
    if (error) Alert.alert('Could not do that', error.message);
    else {
      await refresh();
      Alert.alert(done);
    }
  };

  const manage = (m: Member) => {
    const makeRole = m.role === 'admin' ? 'member' : 'admin';
    Alert.alert(m.name, m.role === 'admin' ? 'Admin' : 'Member', [
      {
        text: makeRole === 'admin' ? 'Make admin' : 'Remove admin',
        onPress: () =>
          void rpc(`role-${m.userId}`, () => supabase.rpc('set_member_role', { p_flat: flat.id, p_user: m.userId, p_role: makeRole }), makeRole === 'admin' ? `${m.name} is now an admin.` : `${m.name} is no longer an admin.`),
      },
      {
        text: 'Remove from flat',
        style: 'destructive',
        onPress: () =>
          Alert.alert(`Remove ${m.name} from ${flat.name}?`, 'They lose access to the flat at once. Their name stays on bills they marked. They can only come back with the invite code.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Remove',
              style: 'destructive',
              onPress: () =>
                void rpc(`remove-${m.userId}`, () => supabase.rpc('remove_member', { p_flat: flat.id, p_user: m.userId }), `${m.name} was removed. Their name stays on old bills.`),
            },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  /** After leaving or deleting this flat: switch to another one if any; with none the app shows flat setup. */
  const moveOff = async (message: string) => {
    const other = memberships.find((m) => m.flat.id !== flat.id);
    if (other) selectFlat(other.flat.id);
    await refresh();
    if (other) navigate({ name: 'home' });
    Alert.alert(message);
  };

  const leave = () =>
    Alert.alert(`Leave ${flat.name}?`, 'You stop seeing its bills. Your name stays on bills you marked. You can rejoin with the invite code.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            setBusy('leave');
            const { error } = await supabase.rpc('leave_flat', { p_flat: flat.id });
            setBusy(null);
            if (error) Alert.alert('Could not leave', error.message);
            else await moveOff(`You left ${flat.name}.`);
          })(),
      },
    ]);

  const deleteFlat = async () => {
    setBusy('delete');
    const name = flat.name;
    try {
      // Uploaded documents live in storage, which the database delete cannot reach. Remove them
      // first: once the flat is gone, nobody is a member and the storage rules refuse the delete.
      const files = await supabase.storage.from('flat-docs').list(flat.id, { limit: 1000 });
      if (files.error) throw files.error;
      const paths = files.data.map((f) => `${flat.id}/${f.name}`);
      if (paths.length > 0) {
        const removed = await supabase.storage.from('flat-docs').remove(paths);
        if (removed.error) throw removed.error;
      }
      const { error } = await supabase.rpc('delete_flat', { p_flat: flat.id, p_confirm_name: confirmName });
      if (error) throw error;
      await moveOff(`${name} and all its data were deleted.`);
    } catch (e: unknown) {
      Alert.alert('Could not delete', messageOf(e));
      setBusy(null);
    }
  };

  return (
    <Screen>
      <Card tone="primary">
        <Text style={[type.smallStrong, { color: colors.primaryDark }]}>Invite code</Text>
        <Text style={styles.code}>{flat.invite_code}</Text>
        <Text style={type.body}>{`Anyone with this code can join ${flat.name}.`}</Text>
        <Grid columns={2} gap={8}>
          <Button label="Share invite" icon="share" onPress={() => shareInvite(flat.name, flat.invite_code)} />
          <Button
            label="Copy"
            icon="copy"
            variant="secondary"
            onPress={() => void Clipboard.setStringAsync(flat.invite_code).then(() => Alert.alert('Invite code copied'))}
          />
        </Grid>
        {isAdmin ? (
          <Button
            label="Make a new code"
            size="sm"
            variant="secondary"
            busy={busy === 'code'}
            onPress={() =>
              Alert.alert('Make a new invite code?', 'The old code stops working. People already in the flat stay.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'New code', onPress: () => void rpc('code', () => supabase.rpc('reset_invite_code', { p_flat: flat.id }), 'New invite code made.') },
              ])
            }
          />
        ) : null}
      </Card>

      <Card title={`Members (${current.length})`} list>
        {current.map((m, i) => (
          <View key={m.userId} style={[styles.row, i === 0 && styles.first]}>
            <Avatar id={m.userId} name={m.name} />
            <View style={styles.flex}>
              <Text style={type.bodyStrong}>{m.userId === userId ? `${m.name} (you)` : m.name}</Text>
              <Text style={type.small}>{m.role === 'admin' ? 'Admin' : 'Member'}</Text>
            </View>
            {isAdmin && m.userId !== userId ? (
              <Button label="Manage" size="sm" variant="secondary" busy={busy === `role-${m.userId}` || busy === `remove-${m.userId}`} onPress={() => manage(m)} />
            ) : m.role === 'admin' ? (
              <Pill text="Admin" bg={colors.primarySoft} fg={colors.primaryDark} />
            ) : null}
          </View>
        ))}
      </Card>

      <Card title="Danger zone" titleColor={colors.bad} tone="danger">
        <Hint>
          {isAdmin
            ? 'Leaving keeps your name on bills you marked. Deleting removes the flat and all its data for everyone; you type its name to confirm.'
            : 'Leaving keeps your name on bills you marked. You can rejoin with the invite code.'}
        </Hint>
        <Button label={`Leave ${flat.name}`} variant="dangerGhost" onPress={leave} busy={busy === 'leave'} />
        {isAdmin ? (
          deleteOpen ? (
            <>
              <Body>{`This deletes ${flat.name} for everyone: every bill and its history, recurring bills, dinner, buy list, notices, polls, repairs, documents and the member list. It cannot be undone.`}</Body>
              <Field label={`Type "${flat.name}" to confirm`} value={confirmName} onChangeText={setConfirmName} autoCapitalize="none" autoCorrect={false} />
              <Grid columns={2} gap={8}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => {
                    setDeleteOpen(false);
                    setConfirmName('');
                  }}
                />
                <Button
                  label="Delete forever"
                  variant="danger"
                  busy={busy === 'delete'}
                  disabled={confirmName.trim().toLowerCase() !== flat.name.trim().toLowerCase()}
                  onPress={() => void deleteFlat()}
                />
              </Grid>
            </>
          ) : (
            <Button label="Delete flat and all its data" icon="trash" variant="danger" onPress={() => setDeleteOpen(true)} />
          )
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  code: { fontFamily: fonts.displayBold, fontSize: 34, letterSpacing: 6, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.divider },
  first: { borderTopColor: 'transparent' },
});
