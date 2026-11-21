import { useEffect, useState } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GoogleNotEnabledError, signInWithGoogle } from '../../auth/google';
import { Icon } from '../../components/Icon';
import { Button, Card, Field, Hint, IconButton, LinkButton, Screen, type } from '../../components/ui';
import { messageOf } from '../../lib/errors';
import { supabase } from '../../lib/supabase';
import { colors, fonts } from '../../theme';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

function friendly(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Wrong email or password.';
  if (/email not confirmed/i.test(message)) return 'Confirm your email first: open the link we sent you.';
  if (/already registered|already been registered/i.test(message)) return 'That email already has an account. Sign in instead.';
  if (/network|fetch/i.test(message)) return 'No internet connection. Try again.';
  return message;
}

/** Signed-out flow: sign in, or create an account. Back on "Create account" returns to sign in. */
export function AuthScreens() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (mode === 'signup') {
        setMode('signin');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [mode]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {mode === 'signin' ? <SignIn onSignUp={() => setMode('signup')} /> : <SignUp onSignIn={() => setMode('signin')} />}
    </SafeAreaView>
  );
}

function useGoogle(setError: (e: string | null) => void) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e: unknown) {
      setError(e instanceof GoogleNotEnabledError ? e.message : friendly(messageOf(e)));
    } finally {
      setBusy(false);
    }
  };
  return { busy, go };
}

function SignIn({ onSignUp }: { onSignUp: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const google = useGoogle(setError);

  const signIn = async () => {
    if (!EMAIL.test(email.trim())) return setError('Enter a valid email address.');
    if (!password) return setError('Enter your password.');
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setBusy(false);
    if (e) setError(friendly(e.message));
  };

  const forgot = async () => {
    if (!EMAIL.test(email.trim())) return setError('Enter your email above first, then tap Forgot password.');
    const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
    setError(e ? friendly(e.message) : `If ${email.trim()} has an account, a reset link is on its way.`);
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <View style={styles.logo}>
          <Icon name="home" size={30} color={colors.onPrimary} />
        </View>
        <Text style={styles.brand}>FlatApp</Text>
        <Text style={[type.body, { color: colors.muted }]}>Bills, dinner and who is home, for everyone in your flat.</Text>
      </View>
      <Card>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="you@example.com" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" placeholder="Your password" onSubmitEditing={() => void signIn()} />
        {error ? <Hint tone="error">{error}</Hint> : null}
        <Button label="Sign in" onPress={() => void signIn()} busy={busy} />
        <View style={styles.or}>
          <View style={styles.line} />
          <Text style={type.small}>or</Text>
          <View style={styles.line} />
        </View>
        <Button label="Continue with Google" variant="secondary" onPress={() => void google.go()} busy={google.busy} />
        <LinkButton label="Forgot password?" onPress={() => void forgot()} />
      </Card>
      <View style={styles.footer}>
        <Text style={type.small}>New to FlatApp?</Text>
        <LinkButton label="Create an account" onPress={onSignUp} />
      </View>
    </Screen>
  );
}

function SignUp({ onSignIn }: { onSignIn: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const google = useGoogle(setError);

  const signUp = async () => {
    if (!name.trim()) return setError('Enter the name your flatmates know you by.');
    if (!EMAIL.test(email.trim())) return setError('Enter a valid email address.');
    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters for the password.`);
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { display_name: name.trim() } },
    });
    setBusy(false);
    if (e) setError(friendly(e.message));
    else if (!data.session) setError(`We sent a link to ${email.trim()}. Open it, then sign in.`);
  };

  return (
    <Screen>
      <View style={styles.back}>
        <IconButton icon="back" label="Back to sign in" onPress={onSignIn} size={26} />
      </View>
      <View style={styles.heroTight}>
        <Text style={type.display}>Create your account</Text>
        <Text style={[type.body, { color: colors.muted }]}>Your flatmates see the name you enter here on bills, dinner and votes.</Text>
      </View>
      <Card>
        <Field label="Your name" value={name} onChangeText={setName} maxLength={40} autoComplete="name" placeholder="For example: Aarav" />
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="you@example.com" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" placeholder={`At least ${MIN_PASSWORD} characters`} />
        {error ? <Hint tone="error">{error}</Hint> : null}
        <Button label="Create account" onPress={() => void signUp()} busy={busy} />
        <Button label="Sign up with Google" variant="secondary" onPress={() => void google.go()} busy={google.busy} />
      </Card>
      <View style={styles.footer}>
        <Text style={type.small}>Already have an account?</Text>
        <LinkButton label="Sign in" onPress={onSignIn} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  hero: { gap: 14, paddingTop: 40, paddingBottom: 8 },
  heroTight: { gap: 8 },
  back: { marginLeft: -10 },
  logo: { width: 60, height: 60, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  brand: { fontFamily: fonts.displayBold, fontSize: 34, color: colors.text },
  or: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
});
