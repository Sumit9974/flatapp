import * as LocalAuthentication from 'expo-local-authentication';
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/ui';
import { colors } from '../theme';
import { isBiometricLockOn } from './settings';

/** After this long in the background, opening the app asks for the fingerprint again. */
const RELOCK_AFTER_MS = 60_000;

const ask = () =>
  LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock FlatApp',
    cancelLabel: 'Cancel',
  });

/**
 * Covers the app with a lock screen when the fingerprint lock is on. The session stays signed in;
 * this only guards opening the app. Android falls back to the phone's PIN or pattern.
 */
export function BiometricGate({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [startsLocked] = useState(() => enabled && isBiometricLockOn());
  const [locked, setLocked] = useState(startsLocked);
  const [error, setError] = useState<string | null>(null);
  const backgroundedAt = useRef<number | null>(null);

  const applyResult = useCallback((result: LocalAuthentication.LocalAuthenticationResult) => {
    if (result.success) {
      setError(null);
      setLocked(false);
    } else if (result.error !== 'user_cancel' && result.error !== 'system_cancel') {
      setError('Could not confirm it is you. Try again.');
    }
  }, []);

  const authenticate = useCallback(() => {
    void ask().then(applyResult);
  }, [applyResult]);

  // Ask straight away when the app opens locked.
  useEffect(() => {
    if (!startsLocked) return;
    let active = true;
    void ask().then((result) => {
      if (active) applyResult(result);
    });
    return () => {
      active = false;
    };
  }, [startsLocked, applyResult]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgroundedAt.current = Date.now();
      } else if (state === 'active' && backgroundedAt.current !== null) {
        const away = Date.now() - backgroundedAt.current;
        backgroundedAt.current = null;
        if (enabled && isBiometricLockOn() && away > RELOCK_AFTER_MS) {
          setLocked(true);
          authenticate();
        }
      }
    });
    return () => subscription.remove();
  }, [enabled, authenticate]);

  if (!locked || !enabled) return children;
  return (
    <View style={styles.lock}>
      <Text style={styles.title}>FlatApp is locked</Text>
      <Text style={styles.body}>Use your fingerprint or phone PIN to open it.</Text>
      {error !== null ? <Text style={styles.error}>{error}</Text> : null}
      <Button label="Unlock" onPress={authenticate} />
    </View>
  );
}

const styles = StyleSheet.create({
  lock: { flex: 1, justifyContent: 'center', padding: 32, gap: 16, backgroundColor: colors.background },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'center' },
  body: { fontSize: 15, color: colors.muted, textAlign: 'center' },
  error: { fontSize: 14, color: colors.bad, textAlign: 'center' },
});
