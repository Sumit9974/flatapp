import * as Location from 'expo-location';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { MapPicker } from '../components/MapPicker';
import { Button, Chip, Chips, FieldLabel, Hint, Row } from '../components/ui';
import { useCurrentFlat, useFlats } from '../flats/FlatProvider';
import { messageOf } from '../lib/errors';
import { supabase } from '../lib/supabase';
import { useNav } from '../nav/NavProvider';
import { syncPresenceGeofences } from '../presence/sync';
import { colors } from '../theme';

/**
 * Circle sizes offered. Android geofencing is not reliable below about 100 m (phone location
 * indoors is usually 20 to 50 m off), and the database allows 100 to 1000 m.
 */
const RADII = [100, 150, 200, 300, 500];

/**
 * Admins only: where "home" is, and how big the circle around it is. Not a scrolling screen on
 * purpose: inside a scroll view the page would take the map's drag gestures.
 */
export function HomePinScreen() {
  const { flat } = useCurrentFlat();
  const { refresh, memberships } = useFlats();
  const { back } = useNav();
  const [pin, setPin] = useState<{ lat: number; lng: number; accuracy: number | null } | null>(
    flat.home_lat !== null && flat.home_lng !== null ? { lat: flat.home_lat, lng: flat.home_lng, accuracy: null } : null,
  );
  const [radius, setRadius] = useState(flat.radius_m);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'locate' | 'save' | null>(null);
  // A size set earlier that is not in the list (for example 250 m) stays selectable.
  const radii = RADII.includes(flat.radius_m) ? RADII : [...RADII, flat.radius_m].sort((a, b) => a - b);

  const locate = async () => {
    setBusy('locate');
    setError(null);
    try {
      const fg = await Location.requestForegroundPermissionsAsync();
      if (!fg.granted) throw new Error('Allow location to put the pin where you are.');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      setPin({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
    } catch (e: unknown) {
      setError(messageOf(e));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!pin) return setError('Put the pin on your building first: tap the map, or use where you are now.');
    setBusy('save');
    const { error: e } = await supabase.rpc('update_flat_home', { p_flat: flat.id, p_lat: pin.lat, p_lng: pin.lng, p_radius: radius });
    if (e) {
      setError(e.message);
      setBusy(null);
      return;
    }
    await refresh();
    await syncPresenceGeofences(
      memberships.map((m) => (m.flat.id === flat.id ? { ...m, flat: { ...m.flat, home_lat: pin.lat, home_lng: pin.lng, radius_m: radius } } : m)),
    );
    Alert.alert('Home pin saved', "Flatmates' phones pick up the new circle within about 30 minutes, or as soon as they open the app.");
    back();
  };

  return (
    <View style={styles.root}>
      <View style={styles.map}>
        <MapPicker pin={pin} radius={radius} onPick={(p) => setPin({ ...p, accuracy: null })} />
      </View>
      <View style={styles.panel}>
        <Hint>Tap your building on the map or drag the pin onto it. The blue circle is where phones count as Home.</Hint>
        <Row label="Pin" value={pin ? `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}` : 'Not set'} tone={pin ? 'neutral' : 'warn'} />
        {pin?.accuracy ? <Hint>{`From your phone's location, accurate to about ${Math.round(pin.accuracy)} m`}</Hint> : null}
        <Button label="Use where I am now" icon="pin" variant="secondary" onPress={() => void locate()} busy={busy === 'locate'} />
        <FieldLabel>Circle around the pin</FieldLabel>
        <Chips>
          {radii.map((r) => (
            <Chip key={r} label={`${r} m`} selected={radius === r} onPress={() => setRadius(r)} />
          ))}
        </Chips>
        <Hint>Phones cannot reliably tell a smaller circle than 100 m. 150 to 200 m suits most buildings.</Hint>
        {error ? <Hint tone="error">{error}</Hint> : null}
        <Button label="Save" onPress={() => void save()} busy={busy === 'save'} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, padding: 16, gap: 12 },
  map: { flex: 1, minHeight: 220 },
  panel: { gap: 10 },
});
