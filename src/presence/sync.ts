import * as Location from 'expo-location';
import type { Membership } from '../flats/FlatProvider';
import { PRESENCE_TASK } from './task';

/**
 * Registers one circle per flat that has a home pin, so the phone reports Home/Out on its own.
 * Re-registering replaces the old circles (a moved pin or new radius takes effect at once), and
 * Android fires an initial enter/exit, so the server learns the current state straight away.
 */
export async function syncPresenceGeofences(memberships: Membership[]): Promise<'running' | 'no-pin' | 'no-permission'> {
  const bg = await Location.getBackgroundPermissionsAsync();
  if (!bg.granted) return 'no-permission';
  const regions: Location.LocationRegion[] = memberships
    .filter((m) => m.flat.home_lat !== null && m.flat.home_lng !== null)
    .map((m) => ({
      identifier: m.flat.id,
      latitude: m.flat.home_lat as number,
      longitude: m.flat.home_lng as number,
      radius: m.flat.radius_m,
      notifyOnEnter: true,
      notifyOnExit: true,
    }));
  const running = await Location.hasStartedGeofencingAsync(PRESENCE_TASK);
  if (regions.length === 0) {
    if (running) await Location.stopGeofencingAsync(PRESENCE_TASK);
    return 'no-pin';
  }
  await Location.startGeofencingAsync(PRESENCE_TASK, regions);
  return 'running';
}

/** A fingerprint of the pins, so the shell re-syncs only when a pin or radius changes. */
export function pinsKey(memberships: Membership[]): string {
  return memberships.map((m) => `${m.flat.id}:${m.flat.home_lat ?? ''}:${m.flat.home_lng ?? ''}:${m.flat.radius_m}`).join('|');
}
