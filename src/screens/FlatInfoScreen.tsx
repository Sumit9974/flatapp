import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { Avatar, Between, Button, Card, Empty, Field, Grid, Hint, HStack, IconButton, LinkButton, ListRow, Notice, Screen, Stat, type } from '../components/ui';
import { deleteContact, loadFlatInfo } from '../data/queries';
import { useCurrentFlat, useFlats } from '../flats/FlatProvider';
import { check, messageOf } from '../lib/errors';
import { ordinal, rupees } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useLive } from '../lib/useLive';
import { useNav } from '../nav/NavProvider';
import { colors } from '../theme';

const MAX_DOC_BYTES = 10 * 1024 * 1024;

export function FlatInfoScreen() {
  const { userId } = useAuth();
  const { flat, role } = useCurrentFlat();
  const { nameOf } = useFlats();
  const { navigate } = useNav();
  const [wifiShown, setWifiShown] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const [contact, setContact] = useState({ role: '', name: '', phone: '' });
  const [contactError, setContactError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const filter = `flat_id=eq.${flat.id}`;

  const live = useLive(`flatinfo:${flat.id}`, () => loadFlatInfo(flat.id), [
    { table: 'flat_info', filter },
    { table: 'contacts', filter },
    { table: 'documents', filter },
  ]);
  const info = live.data?.info ?? null;

  const call = (phone: string) => void Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`);

  const copy = async (text: string, what: string) => {
    await Clipboard.setStringAsync(text);
    Alert.alert(`${what} copied`);
  };

  const addContact = async () => {
    if (!contact.role.trim() || !contact.name.trim() || contact.phone.replace(/\D/g, '').length < 3) {
      setContactError('Fill in what they do, their name and a phone number.');
      return;
    }
    try {
      check(await supabase.from('contacts').insert({ flat_id: flat.id, role: contact.role.trim(), name: contact.name.trim(), phone: contact.phone.trim() }));
      setContact({ role: '', name: '', phone: '' });
      setAddingContact(false);
      setContactError(null);
      await live.reload();
    } catch (e: unknown) {
      setContactError(messageOf(e));
    }
  };

  const removeContact = (id: string, label: string) =>
    Alert.alert(`Remove ${label}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void deleteContact(id).then(() => live.reload()).catch((e: unknown) => Alert.alert('Could not remove', messageOf(e))) },
    ]);

  const upload = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, type: ['application/pdf', 'image/*'] });
    if (picked.canceled) return;
    const file = picked.assets[0];
    if (!file) return;
    if (file.size !== undefined && file.size > MAX_DOC_BYTES) {
      Alert.alert('File too big', 'Documents can be up to 10 MB.');
      return;
    }
    setUploading(true);
    try {
      const bytes = await (await fetch(file.uri)).arrayBuffer();
      const safe = file.name.replace(/[^\w.\- ]/g, '_').slice(-80);
      const path = `${flat.id}/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage.from('flat-docs').upload(path, bytes, { contentType: file.mimeType ?? 'application/octet-stream' });
      if (upErr) throw upErr;
      check(await supabase.from('documents').insert({ flat_id: flat.id, title: file.name.slice(0, 120), storage_path: path, size_bytes: file.size ?? bytes.byteLength, mime: file.mimeType ?? null }));
      await live.reload();
    } catch (e: unknown) {
      Alert.alert('Upload failed', messageOf(e));
    } finally {
      setUploading(false);
    }
  };

  const openDoc = async (path: string) => {
    const { data, error } = await supabase.storage.from('flat-docs').createSignedUrl(path, 600);
    if (error) Alert.alert('Could not open it', error.message);
    else await Linking.openURL(data.signedUrl);
  };

  const removeDoc = (id: string, path: string, title: string, uploader: string) => {
    if (uploader !== userId && role !== 'admin') return;
    Alert.alert(`Delete ${title}?`, 'Everyone in the flat loses access to it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            await supabase.storage.from('flat-docs').remove([path]);
            const { error } = await supabase.from('documents').delete().eq('id', id);
            if (error) Alert.alert('Could not delete', error.message);
            await live.reload();
          })(),
      },
    ]);
  };

  const sizeText = (n: number | null) => (n === null ? '' : n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

  return (
    <Screen onRefresh={live.onRefresh} refreshing={live.refreshing}>
      {live.error ? <Notice message={live.error} tone="error" onDismiss={live.clearError} /> : null}

      <Card title="Owner and rent" action={<LinkButton label={info ? 'Edit' : 'Add'} onPress={() => navigate({ name: 'flatInfoEdit' })} />}>
        {info?.owner_name || info?.owner_phone ? (
          <HStack>
            <Avatar id={info.owner_name ?? 'owner'} name={info.owner_name ?? 'Owner'} />
            <View style={styles.flex}>
              <Text style={type.bodyStrong}>{info.owner_name ?? 'Owner'}</Text>
              <Text style={type.small}>{`Owner${info.owner_phone ? ` · ${info.owner_phone}` : ''}`}</Text>
            </View>
            {info.owner_phone ? <IconButton icon="phone" label="Call the owner" color={colors.good} bg={colors.goodSoft} size={20} onPress={() => call(info.owner_phone ?? '')} /> : null}
          </HStack>
        ) : (
          <Hint>Add the owner’s name and number, the rent and how to pay it, so everyone has it.</Hint>
        )}
        {info?.rent_amount !== null && info?.rent_amount !== undefined ? (
          <Grid columns={2} gap={8}>
            <Stat label="Rent" value={`${rupees(info.rent_amount)} a month`} />
            <Stat label="Due" value={info.rent_due_day ? `${ordinal(info.rent_due_day)} of the month` : 'Not set'} />
          </Grid>
        ) : null}
        {info?.pay_note ? <Hint>{`How to pay: ${info.pay_note}`}</Hint> : null}
      </Card>

      <Card title="WiFi">
        {info?.wifi_name || info?.wifi_password ? (
          <>
            <Between>
              <Text style={type.small}>Network</Text>
              <Text style={type.bodyStrong}>{info.wifi_name ?? '-'}</Text>
            </Between>
            <Between>
              <Text style={type.small}>Password</Text>
              <HStack gap={2}>
                <Text style={[type.bodyStrong, styles.mono]}>{wifiShown ? info.wifi_password ?? '' : '••••••••••'}</Text>
                <IconButton icon={wifiShown ? 'eyeOff' : 'eye'} label={wifiShown ? 'Hide password' : 'Show password'} size={20} onPress={() => setWifiShown((v) => !v)} />
                <IconButton icon="copy" label="Copy password" size={20} onPress={() => void copy(info.wifi_password ?? '', 'Password')} />
              </HStack>
            </Between>
          </>
        ) : (
          <Hint>No WiFi details yet. Tap Add or Edit above to fill them in.</Hint>
        )}
      </Card>

      <Card title="Service contacts" list action={<LinkButton label={addingContact ? 'Close' : 'Add'} onPress={() => setAddingContact((v) => !v)} />}>
        {addingContact ? (
          <View style={styles.form}>
            <Field label="What they do" value={contact.role} onChangeText={(t) => setContact((c) => ({ ...c, role: t }))} maxLength={30} placeholder="Electrician, plumber, gas agency" />
            <Grid columns={2} gap={10}>
              <Field label="Name" value={contact.name} onChangeText={(t) => setContact((c) => ({ ...c, name: t }))} maxLength={40} />
              <Field label="Phone" value={contact.phone} onChangeText={(t) => setContact((c) => ({ ...c, phone: t }))} maxLength={20} keyboardType="phone-pad" />
            </Grid>
            {contactError ? <Hint tone="error">{contactError}</Hint> : null}
            <Button label="Save contact" onPress={() => void addContact()} />
          </View>
        ) : null}
        {live.data && live.data.contacts.length === 0 && !addingContact ? <Hint style={styles.pad}>No contacts yet. Add the electrician, plumber and gas agency.</Hint> : null}
        {live.data?.contacts.map((c, i) => (
          <ListRow
            key={c.id}
            first={i === 0 && !addingContact}
            icon="phone"
            title={c.role}
            subtitle={`${c.name} · ${c.phone}`}
            onLongPress={() => removeContact(c.id, c.role)}
            accessory={<IconButton icon="phone" label={`Call ${c.role}`} color={colors.good} bg={colors.goodSoft} size={20} onPress={() => call(c.phone)} />}
          />
        ))}
      </Card>

      <Card title="Documents" list action={<LinkButton label={uploading ? 'Uploading...' : 'Upload'} onPress={() => void upload()} />}>
        {live.data && live.data.documents.length === 0 ? <Hint style={styles.pad}>Upload the rent agreement and other papers (PDF or photo, up to 10 MB).</Hint> : null}
        {live.data?.documents.map((d, i) => (
          <ListRow
            key={d.id}
            first={i === 0}
            icon="file"
            iconBg={d.mime === 'application/pdf' ? colors.badSoft : colors.primarySoft}
            iconColor={d.mime === 'application/pdf' ? colors.bad : colors.primary}
            title={d.title}
            subtitle={`${sizeText(d.size_bytes)}${d.size_bytes ? ' · ' : ''}added by ${d.uploaded_by === userId ? 'you' : nameOf(d.uploaded_by)}`}
            chevron
            onPress={() => void openDoc(d.storage_path)}
            onLongPress={() => removeDoc(d.id, d.storage_path, d.title, d.uploaded_by)}
          />
        ))}
      </Card>
      {live.data && (live.data.contacts.length > 0 || live.data.documents.length > 0) ? <Hint>Press and hold a contact or document to remove it.</Hint> : null}
      {live.data && !info && live.data.contacts.length === 0 && live.data.documents.length === 0 ? (
        <Card>
          <Empty icon="building" text="Everything about the flat in one place: owner, rent, WiFi, contacts and papers." />
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  mono: { fontFamily: 'monospace' },
  pad: { paddingBottom: 12 },
  form: { gap: 12, paddingBottom: 12 },
});
