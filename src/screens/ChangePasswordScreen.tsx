import { useState } from 'react';
import { Alert } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { Button, Card, Field, Hint, Screen } from '../components/ui';
import { messageOf } from '../lib/errors';
import { supabase } from '../lib/supabase';
import { useNav } from '../nav/NavProvider';

/** Same rule as creating an account (AuthScreens). */
const MIN_PASSWORD = 8;

function friendly(code: string | undefined, message: string): string {
  if (code === 'same_password') return 'That is already your password. Choose a different one.';
  if (code === 'weak_password') return 'That password is too easy to guess. Try a longer one.';
  // Only when "Secure password change" is switched on in Supabase and this sign-in is over 24 hours old.
  if (code === 'reauthentication_needed') return 'Sign out and sign in again, then change your password.';
  if (/network|fetch/i.test(message)) return 'No internet connection. Try again.';
  return message;
}

/**
 * Change the signed-in person's own password. No current password and no email code: being signed
 * in on this phone is the proof (the user's decision, 2026-11-23). Works for Google accounts too,
 * which then also gain an email-and-password sign-in.
 */
export function ChangePasswordScreen() {
  const { session } = useAuth();
  const { back } = useNav();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`);
    if (password !== again) return setError('The two passwords are not the same.');
    setBusy(true);
    setError(null);
    try {
      const { error: e } = await supabase.auth.updateUser({ password });
      if (e) {
        setError(friendly(e.code, e.message));
        return;
      }
    } catch (e: unknown) {
      setError(friendly(undefined, messageOf(e)));
      return;
    } finally {
      setBusy(false);
    }
    setPassword('');
    setAgain('');
    Alert.alert('Password changed', 'Use your new password the next time you sign in.');
    back();
  };

  return (
    <Screen>
      <Card>
        <Hint>{`For ${session?.user.email ?? 'your account'}. You stay signed in on this phone.`}</Hint>
        <Field
          label="New password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          autoCapitalize="none"
          placeholder={`At least ${MIN_PASSWORD} characters`}
        />
        <Field
          label="Type it again"
          value={again}
          onChangeText={setAgain}
          secureTextEntry
          autoComplete="new-password"
          autoCapitalize="none"
          onSubmitEditing={() => void save()}
        />
        {error ? <Hint tone="error">{error}</Hint> : null}
        <Button label="Change password" onPress={() => void save()} busy={busy} />
      </Card>
    </Screen>
  );
}
