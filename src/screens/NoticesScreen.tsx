import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { Avatar, Between, Button, Card, Empty, Hint, HStack, LinkButton, Notice, Pill, Screen, type } from '../components/ui';
import { loadNotices } from '../data/queries';
import { useCurrentFlat, useFlats } from '../flats/FlatProvider';
import { formatWhen } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useLive } from '../lib/useLive';
import { colors, fonts } from '../theme';

export function NoticesScreen() {
  const { userId } = useAuth();
  const { flat, role } = useCurrentFlat();
  const { nameOf } = useFlats();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const live = useLive(`notices:${flat.id}`, () => loadNotices(flat.id), [{ table: 'notices', filter: `flat_id=eq.${flat.id}` }]);

  const post = async () => {
    if (body.trim().length === 0) return;
    setBusy(true);
    const { error } = await supabase.rpc('post_notice', { p_flat: flat.id, p_body: body.trim() });
    setBusy(false);
    if (error) Alert.alert('Could not post', error.message);
    else {
      setBody('');
      await live.reload();
    }
  };

  const pin = async (id: string, pinned: boolean) => {
    const { error } = await supabase.rpc('pin_notice', { p_notice: id, p_pinned: pinned });
    if (error) Alert.alert('Could not change it', error.message);
    else await live.reload();
  };

  const remove = (id: string) =>
    Alert.alert('Delete this notice?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void supabase
            .from('notices')
            .delete()
            .eq('id', id)
            .then(({ error }) => (error ? Alert.alert('Could not delete', error.message) : live.reload())),
      },
    ]);

  return (
    <Screen onRefresh={live.onRefresh} refreshing={live.refreshing}>
      {live.error ? <Notice message={live.error} tone="error" onDismiss={live.clearError} /> : null}
      <Card>
        <Text style={type.bodyStrong}>Post a notice</Text>
        <TextInput
          value={body}
          onChangeText={setBody}
          multiline
          maxLength={500}
          placeholder="Write something for everyone in the flat"
          placeholderTextColor="#8A93A6"
          accessibilityLabel="Notice text"
          textAlignVertical="top"
          style={styles.area}
        />
        <Between>
          <Hint>Everyone gets a notification.</Hint>
          <Button label="Post" size="sm" onPress={() => void post()} busy={busy} disabled={body.trim().length === 0} />
        </Between>
      </Card>
      {live.data && live.data.length === 0 ? (
        <Card>
          <Empty icon="megaphone" text="No notices yet. Water cuts, guests, plumber visits: post them here." />
        </Card>
      ) : null}
      {live.data?.map((n) => {
        const mine = n.author_id === userId;
        const canManage = mine || role === 'admin';
        return (
          <Card key={n.id} tone={n.pinned ? 'notice' : 'default'}>
            <HStack gap={10}>
              <Avatar id={n.author_id} name={nameOf(n.author_id)} size={32} />
              <View style={styles.flex}>
                <Text style={type.smallStrong}>{mine ? 'You' : nameOf(n.author_id)}</Text>
                <Text style={type.tiny}>{formatWhen(n.created_at)}</Text>
              </View>
              {n.pinned ? <Pill text="Pinned" icon="pushpin" bg={colors.warnSoft} fg={colors.warn} /> : null}
            </HStack>
            <Text style={type.body}>{n.body}</Text>
            {canManage ? (
              <HStack gap={16}>
                <LinkButton label={n.pinned ? 'Unpin' : 'Pin'} onPress={() => void pin(n.id, !n.pinned)} />
                <LinkButton label="Delete" color={colors.bad} onPress={() => remove(n.id)} />
              </HStack>
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  area: { minHeight: 88, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 12, padding: 12, fontFamily: fonts.regular, fontSize: 15, color: colors.text },
});
