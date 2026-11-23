import { Platform, requireOptionalNativeModule } from 'expo';

interface FlatWifiNative {
  getCurrentSsid(): string | null;
  isWifiEnabled(): boolean;
  startWatchingAsync(taskName: string): Promise<void>;
  stopWatchingAsync(taskName: string): Promise<void>;
  isWatchingAsync(taskName: string): Promise<boolean>;
}

/** Null where the native side is missing (iOS, web, Expo Go): every call below then does nothing. */
const native = Platform.OS === 'android' ? requireOptionalNativeModule<FlatWifiNative>('FlatWifi') : null;

/** Data the Wi-Fi task receives: the joined network's name, "" when Android hides it. */
export interface WifiTaskData {
  ssid: string;
}

/** The connected Wi-Fi network's name, or null (not on Wi-Fi, no location access, or unknown). */
export function getCurrentSsid(): string | null {
  try {
    return native?.getCurrentSsid() ?? null;
  } catch {
    return null;
  }
}

/** Whether the phone's Wi-Fi is switched on (connected or not). */
export function isWifiEnabled(): boolean {
  try {
    return native?.isWifiEnabled() ?? false;
  } catch {
    return false;
  }
}

/** Runs the named task (defined with TaskManager.defineTask) each time the phone joins a Wi-Fi network. */
export async function startWatchingWifiAsync(taskName: string): Promise<void> {
  await native?.startWatchingAsync(taskName);
}

export async function stopWatchingWifiAsync(taskName: string): Promise<void> {
  await native?.stopWatchingAsync(taskName);
}

export async function isWatchingWifiAsync(taskName: string): Promise<boolean> {
  return (await native?.isWatchingAsync(taskName)) ?? false;
}
