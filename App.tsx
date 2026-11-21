import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/auth/AuthProvider';
import { Loading } from './src/components/ui';
import { CountsProvider } from './src/flats/CountsProvider';
import { FlatProvider, useFlats } from './src/flats/FlatProvider';
import { BiometricGate } from './src/lock/BiometricGate';
import { NavProvider } from './src/nav/NavProvider';
import { AuthScreens } from './src/screens/auth/AuthScreens';
import { FlatSetupScreen } from './src/screens/FlatSetupScreen';
import { MainShell } from './src/shell/MainShell';
import { colors } from './src/theme';

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* A font that fails to load falls back to the system font rather than blocking the app. */}
        {fontsLoaded || fontError ? (
          <AuthProvider>
            <FlatProvider>
              <Root />
            </FlatProvider>
          </AuthProvider>
        ) : (
          <Loading />
        )}
      </View>
    </SafeAreaProvider>
  );
}

/**
 * Three states decide what can be opened: signed out (sign in or create an account), signed in
 * without a flat (create or join one), signed in with a flat (the app). Nothing else is reachable.
 */
function Root() {
  const { loading, session, userId } = useAuth();
  const { loading: flatsLoading, current } = useFlats();
  if (loading || (session !== null && flatsLoading)) return <Loading />;
  if (session === null) return <AuthScreens />;

  return (
    <BiometricGate enabled>
      {current === null ? (
        <FlatSetupScreen />
      ) : (
        // Keyed by person and flat: switching either starts the app fresh on Home.
        <NavProvider key={`${userId ?? ''}:${current.flat.id}`}>
          <CountsProvider>
            <MainShell />
          </CountsProvider>
        </NavProvider>
      )}
    </BiometricGate>
  );
}
