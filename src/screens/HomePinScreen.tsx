import * as Location from 'expo-location';
import { useState } from 'react';
import { Alert } from 'react-native';
import { Button, Card, Field, Hint, Row, Screen } from '../components/ui';
import { useCurrentFlat, useFlats } from '../flats/FlatProvider';
import { messageOf } from '../lib/errors';
import { supabase } from '../lib/supabase';
import { useNav } from '../nav/NavProvider';
import { syncPresenceGeofences } from '../presence/sync';

/** Admins only: where "home" is, and how big the circle around it is. */
export function HomePinScreen() {
  const { flat } = useCurrentFlat();
  const { refresh, memberships } = useFlats();
  const { back } = useNav();
  const [pin, setPin] = useState<{ lat: number; lng: number; accuracy: number | null } | null>(
    flat.home_lat !== null && flat.home_lng !== null ? { lat: flat.home_lat, lng: flat.home_lng, accuracy: null } : null,
  );
  const [radius, setRadius] = useState(String(flat.radius_m));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'locate' | 'save' | null>(null);

  const locate = async () => {
    setBusy('locate');
    setError(null);
    try {
      const fg = await Location.requestForegroundPermissionsAsync();
      if (!fg.granted) throw new Error('Allow location to set the pin where you are.');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      setPin({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
    } catch (e: unknown) {
      setError(messageOf(e));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    const r = Number(radius.trim());
    if (!Number.isInteger(r) || r < 100 || r > 1000) return setError('Radius must be a whole number from 100 to 1000.');
    if (!pin) return setError('Set the pin first: stand inside the flat and tap the button.');
    setBusy('save');
    const { error: e } = await supabase.rpc('update_flat_home', { p_flat: flat.id, p_lat: pin.lat, p_lng: pin.lng, p_radius: r });
    if (e) {
      setError(e.message);
      setBusy(null);
      return;
    }
    await refresh();
    await syncPresenceGeofences(memberships.map((m) => (m.flat.id === flat.id ? { ...m, flat: { ...m.flat, home_lat: pin.lat, home_lng: pin.lng, radius_m: r } } : m)));
    Alert.alert('Home pin saved', 'Phones pick up the new circle the next time the app opens.');
    back();
  };

  return (
    <Screen>
      <Card title="Home pin">
        <Row label="Pin" value={pin ? `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}` : 'Not set'} tone={pin ? 'neutral' : 'warn'} />
        {pin?.accuracy ? <Hint>{`GPS accuracy ±${Math.round(pin.accuracy)} m`}</Hint> : null}
        <Button label="Set pin to where I am now" icon="pin" onPress={() => void locate()} busy={busy === 'locate'} />
        <Hint>Stand inside the flat, near a window if you can.</Hint>
      </Card>
      <Card title="Radius">
        <Field label="Metres around the pin (100 to 1000)" value={radius} onChangeText={setRadius} keyboardType="number-pad" maxLength={4} hint="200 m suits most buildings." />
      </Card>
      {error ? <Hint tone="error">{error}</Hint> : null}
      <Button label="Save" onPress={() => void save()} busy={busy === 'save'} />
    </Screen>
  );
}
