import * as LocalAuthentication from 'expo-local-authentication';

const LOCK_KEY = 'flatapp.biometricLock';
const OFFERED_KEY = 'flatapp.biometricOffered';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Device storage unavailable: the lock simply stays off.
  }
}

export function isBiometricLockOn(): boolean {
  return read(LOCK_KEY) === '1';
}

export function setBiometricLock(on: boolean): void {
  write(LOCK_KEY, on ? '1' : '0');
}

/** Whether we already asked after the first sign-in (asked once, then it lives in Settings). */
export function wasBiometricOffered(): boolean {
  return read(OFFERED_KEY) === '1';
}

export function markBiometricOffered(): void {
  write(OFFERED_KEY, '1');
}

/** True when the phone has a fingerprint (or face) sensor with at least one enrolled. */
export async function canUseBiometrics(): Promise<boolean> {
  const [hardware, enrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  return hardware && enrolled;
}
