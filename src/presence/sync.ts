import * as BackgroundTask from 'expo-background-task';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { isWatchingWifiAsync, startWatchingWifiAsync, stopWatchingWifiAsync } from '../../modules/flat-wifi';
import type { Membership } from '../flats/FlatProvider';
import { supabase } from '../lib/supabase';
import { CHECKIN_MINUTES, CHECKIN_TASK, PRESENCE_TASK, STALE_AFTER_HOURS, WIFI_TASK } from './config';
import { clearPresenceQueue } from './report';
import { clearWifiState, hasAnyNetworks, saveNetworks } from './wifi';

/** 'running': a circle and/or the flat's Wi-Fi is being watched. 'no-pin': nothing to watch. */
export type PresenceSetup = 'running' | 'no-pin' | 'no-permission';

/** The circles last synced on this phone, so the background check-in can re-register them offline. */
const REGIONS_KEY = 'flatapp.presence.regions';
/** When the check-in was set up and when it last ran in the background. */
const CHECKIN_KEY = 'flatapp.presence.checkin';

interface CheckinLog {
  registeredAt: string;
  lastRunAt: string | null;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Only bookkeeping; the circles themselves live in Android.
  }
}

interface FlatPin {
  id: string;
  home_lat: number | null;
  home_lng: number | null;
  radius_m: number;
  home_networks: string[] | null;
}

function regionsOf(flats: FlatPin[]): Location.LocationRegion[] {
  return flats
    .filter((f) => f.home_lat !== null && f.home_lng !== null)
    .map((f) => ({
      identifier: f.id,
      latitude: f.home_lat as number,
      longitude: f.home_lng as number,
      radius: f.radius_m,
      notifyOnEnter: true,
      notifyOnExit: true,
    }));
}

async function startCheckin(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(CHECKIN_TASK)) return;
  await BackgroundTask.registerTaskAsync(CHECKIN_TASK, { minimumInterval: CHECKIN_MINUTES });
  writeJson(CHECKIN_KEY, { registeredAt: new Date().toISOString(), lastRunAt: null } satisfies CheckinLog);
}

async function stopCheckin(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(CHECKIN_TASK)) await BackgroundTask.unregisterTaskAsync(CHECKIN_TASK);
  writeJson(CHECKIN_KEY, null);
}

async function startWifiWatch(): Promise<void> {
  if (!(await isWatchingWifiAsync(WIFI_TASK))) await startWatchingWifiAsync(WIFI_TASK);
}

async function stopWifiWatch(): Promise<void> {
  if (await isWatchingWifiAsync(WIFI_TASK)) await stopWatchingWifiAsync(WIFI_TASK);
}

/**
 * Registers one circle per flat with a pin, and watches for the phone joining Wi-Fi when any flat
 * lists its networks. Registering circles replaces the old ones (a moved pin or new radius takes
 * effect at once) and makes Android report straight away whether the phone is inside or outside,
 * so every call is also a fresh Home/Out check. Keeps the background check-in running while there
 * is anything to watch. Reading the Wi-Fi name in the background needs the same "all the time"
 * location access as the circles.
 */
async function applyPresence(regions: Location.LocationRegion[]): Promise<PresenceSetup> {
  const bg = await Location.getBackgroundPermissionsAsync();
  if (!bg.granted) {
    await stopWifiWatch();
    await stopCheckin();
    return 'no-permission';
  }

  if (regions.length > 0) await Location.startGeofencingAsync(PRESENCE_TASK, regions);
  else if (await Location.hasStartedGeofencingAsync(PRESENCE_TASK)) await Location.stopGeofencingAsync(PRESENCE_TASK);

  const wifi = hasAnyNetworks();
  if (wifi) await startWifiWatch();
  else await stopWifiWatch();

  if (regions.length === 0 && !wifi) {
    await stopCheckin();
    return 'no-pin';
  }
  await startCheckin();
  return 'running';
}

/** Brings the phone in line with the flats' pins and Wi-Fi lists (app start, changes, app opened). */
export async function syncPresenceGeofences(memberships: Membership[]): Promise<PresenceSetup> {
  const flats = memberships.map((m) => m.flat);
  const regions = regionsOf(flats);
  writeJson(REGIONS_KEY, regions);
  saveNetworks(flats);
  return applyPresence(regions);
}

/**
 * Used by the background check-in, which only runs online: reads the person's flats fresh
 * (row-level security returns only flats they are still in), so a moved pin, a new radius, a new
 * Wi-Fi name or a left flat reaches this phone without anyone opening the app. If that read fails,
 * what was last synced on this phone is used.
 */
export async function refreshPresence(): Promise<PresenceSetup> {
  let regions = readJson<Location.LocationRegion[]>(REGIONS_KEY) ?? [];
  try {
    const { data, error } = await supabase.from('flats').select('id, home_lat, home_lng, radius_m, home_networks');
    if (!error && data) {
      regions = regionsOf(data);
      writeJson(REGIONS_KEY, regions);
      saveNetworks(data);
    }
  } catch {
    // Offline or signed out: keep what is saved.
  }
  return applyPresence(regions);
}

/** Called at the start of every background check-in. */
export function markCheckinRan(): void {
  const log = readJson<CheckinLog>(CHECKIN_KEY);
  if (log) writeJson(CHECKIN_KEY, { ...log, lastRunAt: new Date().toISOString() } satisfies CheckinLog);
}

/**
 * When the background check-in has been quiet for as long as flatmates would see "Not sure", the
 * time it last ran (or was set up). Null while it is on time or not set up. Only background runs
 * count: opening the app also refreshes Home/Out, which would hide a phone whose battery saver
 * stops FlatApp the moment it is closed.
 */
export function checkinOverdueSince(now: Date = new Date()): Date | null {
  const log = readJson<CheckinLog>(CHECKIN_KEY);
  if (!log) return null;
  const last = new Date(log.lastRunAt ?? log.registeredAt);
  return now.getTime() - last.getTime() > STALE_AFTER_HOURS * 3_600_000 ? last : null;
}

/** On sign-out: this phone stops reporting for the person who is leaving. */
export async function stopPresence(): Promise<void> {
  await clearPresenceQueue();
  if (await Location.hasStartedGeofencingAsync(PRESENCE_TASK)) await Location.stopGeofencingAsync(PRESENCE_TASK);
  await stopWifiWatch();
  await stopCheckin();
  writeJson(REGIONS_KEY, null);
  clearWifiState();
}

/** A fingerprint of the pins and Wi-Fi lists, so the shell re-syncs only when one of them changes. */
export function pinsKey(memberships: Membership[]): string {
  return memberships
    .map((m) => `${m.flat.id}:${m.flat.home_lat ?? ''}:${m.flat.home_lng ?? ''}:${m.flat.radius_m}:${(m.flat.home_networks ?? []).join(',')}`)
    .join('|');
}
