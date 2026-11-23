import { getCurrentSsid } from '../../modules/flat-wifi';
import { WIFI_TRUST_DAYS } from './config';
import { reportPresence } from './report';

/**
 * Home Wi-Fi: the precise "got home" signal. The flats' network names are kept on the phone so the
 * background tasks can match the connected network offline; the name never leaves the phone, only
 * Home does.
 */

/** flat id -> the flat's Wi-Fi network names, as last synced on this phone. */
const NETWORKS_KEY = 'flatapp.presence.networks';
/** flat id -> when this phone was last on that flat's Wi-Fi (ISO). */
const SEEN_KEY = 'flatapp.presence.wifiSeen';

type NetworkMap = Record<string, string[]>;
type SeenMap = Record<string, string>;

function read<T>(key: string): T {
  try {
    const raw = localStorage.getItem(key);
    return (raw ? JSON.parse(raw) : {}) as T;
  } catch {
    return {} as T;
  }
}

function write(key: string, value: Record<string, unknown> | null): void {
  try {
    if (value === null || Object.keys(value).length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Only a cache; the next sync writes it again.
  }
}

export function saveNetworks(flats: { id: string; home_networks: string[] | null }[]): void {
  const map: NetworkMap = {};
  for (const f of flats) {
    const names = (f.home_networks ?? []).map((n) => n.trim()).filter((n) => n.length > 0);
    if (names.length > 0) map[f.id] = names;
  }
  write(NETWORKS_KEY, map);
}

export function hasAnyNetworks(): boolean {
  return Object.keys(read<NetworkMap>(NETWORKS_KEY)).length > 0;
}

/** The flats whose Wi-Fi list has this network name (names are case-sensitive, like Wi-Fi itself). */
export function flatsOnNetwork(ssid: string | null): string[] {
  if (!ssid) return [];
  const name = ssid.trim();
  return Object.entries(read<NetworkMap>(NETWORKS_KEY))
    .filter(([, names]) => names.includes(name))
    .map(([flatId]) => flatId);
}

/** The flats whose Wi-Fi this phone is connected to right now. */
export function flatsOnCurrentWifi(): string[] {
  return flatsOnNetwork(getCurrentSsid());
}

function markWifiSeen(flatIds: string[]): void {
  if (flatIds.length === 0) return;
  const seen = read<SeenMap>(SEEN_KEY);
  const now = new Date().toISOString();
  for (const id of flatIds) seen[id] = now;
  write(SEEN_KEY, seen);
}

/** True when this phone joined the flat's Wi-Fi in the last WIFI_TRUST_DAYS days. */
export function usesFlatWifi(flatId: string, now: Date = new Date()): boolean {
  const last = read<SeenMap>(SEEN_KEY)[flatId];
  return last !== undefined && now.getTime() - new Date(last).getTime() < WIFI_TRUST_DAYS * 86_400_000;
}

/**
 * Reports Home for every flat whose Wi-Fi the phone is on (the given network, or the current one)
 * and remembers that this phone uses that Wi-Fi. Returns the flats it reported for.
 */
export async function reportWifiHome(ssid: string | null = getCurrentSsid()): Promise<string[]> {
  const flats = flatsOnNetwork(ssid);
  markWifiSeen(flats);
  for (const flatId of flats) await reportPresence(flatId, 'home');
  return flats;
}

/** On sign-out: forget the flats' networks and which ones this phone used. */
export function clearWifiState(): void {
  write(NETWORKS_KEY, null);
  write(SEEN_KEY, null);
}
