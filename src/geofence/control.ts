import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { GEOFENCE_TASK, HOME_REGION_ID } from './config';
import { distanceInMetres } from './distance';
import { addLogEntry, LogDetails } from './log';
import { getHome, getTestActive, HomeConfig, setTestActive } from './settings';

export interface PermissionState {
  /** Location while the app is open. */
  foreground: boolean;
  /** Location "Allow all the time", which background geofencing needs. */
  background: boolean;
  notifications: boolean;
}

export async function readPermissions(): Promise<PermissionState> {
  const [fg, bg, notif] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
    Notifications.getPermissionsAsync(),
  ]);
  return { foreground: fg.granted, background: bg.granted, notifications: notif.granted };
}

/** Asks in Android's required order: location while in use, then all the time, then notifications. */
export async function requestPermissions(): Promise<PermissionState> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.granted) {
    await Location.requestBackgroundPermissionsAsync();
  }
  await Notifications.requestPermissionsAsync();
  return readPermissions();
}

const regionFor = (home: HomeConfig): Location.LocationRegion => ({
  identifier: HOME_REGION_ID,
  latitude: home.latitude,
  longitude: home.longitude,
  radius: home.radiusM,
  notifyOnEnter: true,
  notifyOnExit: true,
});

export function isTestRunning(): Promise<boolean> {
  return Location.hasStartedGeofencingAsync(GEOFENCE_TASK);
}

/** Starts the test, or re-registers the circle when the home pin or radius changed. */
export async function startTest(home: HomeConfig): Promise<void> {
  await Location.startGeofencingAsync(GEOFENCE_TASK, [regionFor(home)]);
  await setTestActive(true);
  await addLogEntry('test-started', { note: `radius ${home.radiusM} m` });
}

export async function stopTest(): Promise<void> {
  if (await isTestRunning()) {
    await Location.stopGeofencingAsync(GEOFENCE_TASK);
  }
  await setTestActive(false);
  await addLogEntry('test-stopped');
}

/**
 * Android drops geofences after a phone restart, an app update or a force stop.
 * If the person never pressed Stop, put the circle back and log that it had gone.
 */
export async function resumeTestIfDropped(): Promise<boolean> {
  const [active, running, home, bg] = await Promise.all([
    getTestActive(),
    isTestRunning(),
    getHome(),
    Location.getBackgroundPermissionsAsync(),
  ]);
  if (!active || running || home === null || !bg.granted) return false;
  await Location.startGeofencingAsync(GEOFENCE_TASK, [regionFor(home)]);
  await addLogEntry('test-resumed', { note: 'The circle was not registered any more (phone restart, update or force stop?)' });
  return true;
}

export interface Measurement {
  distanceM: number;
  accuracyM: number | null;
  inside: boolean;
}

/** A fresh GPS reading, compared with the home pin. */
export async function measureNow(home: HomeConfig): Promise<Measurement> {
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  const distanceM = distanceInMetres(home, position.coords);
  return { distanceM, accuracyM: position.coords.accuracy, inside: distanceM <= home.radiusM };
}

/** Distance and accuracy from the last position the phone already has; never waits for GPS. */
export async function lastKnownDetails(): Promise<LogDetails> {
  try {
    const [home, position] = await Promise.all([
      getHome(),
      Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 }),
    ]);
    if (home === null || position === null) return {};
    return {
      distanceM: Math.round(distanceInMetres(home, position.coords)),
      accuracyM: position.coords.accuracy === null ? null : Math.round(position.coords.accuracy),
    };
  } catch {
    return {};
  }
}
