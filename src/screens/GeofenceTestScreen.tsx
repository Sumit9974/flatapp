import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TextInputInstance,
  View,
} from 'react-native';
import { Button, Card, Row } from '../components/ui';
import { DEFAULT_RADIUS_M, MAX_RADIUS_M, MIN_RADIUS_M } from '../geofence/config';
import {
  isTestRunning,
  lastKnownDetails,
  Measurement,
  measureNow,
  PermissionState,
  readPermissions,
  requestPermissions,
  resumeTestIfDropped,
  startTest,
  stopTest,
} from '../geofence/control';
import { formatAccuracy, formatDistance, formatTime } from '../geofence/format';
import { addLogEntry, clearLog, LOG_LABELS, LogEntry, logToCsv, readLog } from '../geofence/log';
import { getHome, HomeConfig, saveHome } from '../geofence/settings';
import { colors, Tone } from '../theme';

type BusyAction = 'permissions' | 'home' | 'test' | 'measure' | 'mark' | 'clear';

const LOG_SHOWN = 500;
const REFRESH_MS = 5000;

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function parseRadius(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const value = Number(text.trim());
  return value >= MIN_RADIUS_M && value <= MAX_RADIUS_M ? value : null;
}

const RADIUS_ERROR = `Enter a whole number from ${MIN_RADIUS_M} to ${MAX_RADIUS_M}.`;

export function GeofenceTestScreen() {
  const [permissions, setPermissions] = useState<PermissionState | null>(null);
  const [home, setHome] = useState<HomeConfig | null>(null);
  const [radiusText, setRadiusText] = useState(String(DEFAULT_RADIUS_M));
  const [radiusError, setRadiusError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [busy, setBusy] = useState<BusyAction | null>(null);
  const radiusInput = useRef<TextInputInstance>(null);

  // Closing the keyboard with Back leaves the field focused on Android, so onEndEditing never
  // fires and the new radius would be silently dropped. Blur it when the keyboard goes away.
  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidHide', () => {
      if (radiusInput.current?.isFocused()) radiusInput.current.blur();
    });
    return () => subscription.remove();
  }, []);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [perm, savedHome, isRunning, log] = await Promise.all([
      readPermissions(),
      getHome(),
      isTestRunning(),
      readLog(LOG_SHOWN),
    ]);
    setPermissions(perm);
    setHome(savedHome);
    setRunning(isRunning);
    setEntries(log);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      try {
        await addLogEntry('app-opened');
        await resumeTestIfDropped();
        const savedHome = await getHome();
        if (!cancelled && savedHome !== null) setRadiusText(String(savedHome.radiusM));
        if (!cancelled) await refresh();
      } catch (error: unknown) {
        if (!cancelled) setNotice(messageOf(error));
      }
    };
    void start();

    const quietRefresh = () => {
      refresh().catch((error: unknown) => setNotice(messageOf(error)));
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') quietRefresh();
    });
    // Background events land in the log while the screen is open; pick them up.
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') quietRefresh();
    }, REFRESH_MS);

    return () => {
      cancelled = true;
      subscription.remove();
      clearInterval(timer);
    };
  }, [refresh]);

  const run = useCallback(
    async (action: BusyAction, work: () => Promise<string | null>) => {
      setBusy(action);
      setNotice(null);
      try {
        const message = await work();
        if (message !== null) setNotice(message);
        await refresh();
      } catch (error: unknown) {
        setNotice(messageOf(error));
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  const onGrant = () =>
    run('permissions', async () => {
      const granted = await requestPermissions();
      if (!granted.foreground) return 'Location is needed for the test. Allow it, or use Open app settings.';
      if (!granted.background) {
        return 'Location must be "Allow all the time". Tap Open app settings, then Permissions, Location.';
      }
      if (!granted.notifications) return 'Notifications are off. The log still works, but you will not see alerts.';
      return 'All permissions granted.';
    });

  const onSetHome = () =>
    run('home', async () => {
      if (permissions?.foreground !== true) return 'Allow location first (step 1).';
      const radiusM = parseRadius(radiusText);
      if (radiusM === null) {
        setRadiusError(RADIUS_ERROR);
        return null;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      const next: HomeConfig = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        radiusM,
      };
      await saveHome(next);
      if (await isTestRunning()) await startTest(next);
      const accuracy = position.coords.accuracy;
      return accuracy === null ? 'Home pin saved.' : `Home pin saved (GPS accuracy ${formatAccuracy(accuracy)}).`;
    });

  const onRadiusDone = () => {
    const radiusM = parseRadius(radiusText);
    if (radiusM === null) {
      setRadiusError(RADIUS_ERROR);
      return;
    }
    setRadiusError(null);
    if (home === null || radiusM === home.radiusM) return;
    void run('home', async () => {
      const next: HomeConfig = { ...home, radiusM };
      await saveHome(next);
      if (await isTestRunning()) await startTest(next);
      return `Radius set to ${radiusM} m.`;
    });
  };

  const onToggleTest = () =>
    run('test', async () => {
      if (running) {
        await stopTest();
        return 'Test stopped.';
      }
      if (home === null) return 'Set the home pin first.';
      if (permissions?.background !== true) return 'Location must be "Allow all the time" first.';
      await startTest(home);
      return 'Test running. You can close the app now; it keeps logging.';
    });

  const onMeasure = () =>
    run('measure', async () => {
      if (home === null) return 'Set the home pin first.';
      setMeasurement(await measureNow(home));
      return null;
    });

  const onMark = (kind: 'marked-left' | 'marked-arrived') =>
    run('mark', async () => {
      await addLogEntry(kind, await lastKnownDetails());
      return kind === 'marked-left' ? 'Marked: you left.' : 'Marked: you arrived.';
    });

  const onShare = async () => {
    try {
      const all = await readLog(100_000);
      await Share.share({ title: 'FlatApp geofence log', message: logToCsv(all) });
    } catch (error: unknown) {
      setNotice(messageOf(error));
    }
  };

  const onClear = () =>
    Alert.alert('Clear the log?', 'This deletes every logged event on this phone. Share it first if you need it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          void run('clear', async () => {
            await clearLog();
            return 'Log cleared.';
          });
        },
      },
    ]);

  const locationLabel =
    permissions === null
      ? 'Checking'
      : permissions.background
        ? 'Allowed all the time'
        : permissions.foreground
          ? 'Only while the app is open'
          : 'Not allowed';
  const locationTone: Tone = permissions?.background ? 'good' : permissions?.foreground ? 'warn' : 'bad';
  const allGranted = permissions?.background === true && permissions.notifications;
  const canStart = home !== null && permissions?.background === true;

  return (
    <View style={styles.safe}>
      {/* Edge to edge, Android no longer shrinks the window for the keyboard; without this the
          radius field sits under the keyboard while you type. The router's header supplies the title. */}
      <KeyboardAvoidingView style={styles.fill} behavior="padding">
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.lead}>
            Keep this running for 3 days. The phone logs every time it enters or leaves the circle around the flat,
            and you mark when you really left or arrived.
          </Text>

          {notice !== null ? (
            <Pressable
              style={styles.notice}
              onPress={() => setNotice(null)}
              accessibilityRole="button"
              accessibilityHint="Dismisses this message"
            >
              <Text style={styles.noticeText}>{notice}</Text>
            </Pressable>
          ) : null}

          <Card title="1. Permissions">
            <Row label="Location" value={locationLabel} tone={locationTone} />
            <Row
              label="Notifications"
              value={permissions === null ? 'Checking' : permissions.notifications ? 'On' : 'Off'}
              tone={permissions?.notifications ? 'good' : 'warn'}
            />
            {allGranted ? null : (
              <Button label="Grant permissions" onPress={onGrant} busy={busy === 'permissions'} />
            )}
            <Button label="Open app settings" variant="secondary" onPress={() => void Linking.openSettings()} />
            <Text style={styles.hint}>
              In app settings, set Location to &quot;Allow all the time&quot; and Battery to &quot;Unrestricted&quot;, so
              Android does not stop the test.
            </Text>
          </Card>

          <Card title="2. Home">
            <Row
              label="Home pin"
              value={home === null ? 'Not set' : `${home.latitude.toFixed(5)}, ${home.longitude.toFixed(5)}`}
              tone={home === null ? 'warn' : 'neutral'}
            />
            <Button label="Set home to where I am now" onPress={onSetHome} busy={busy === 'home'} />
            <Text style={styles.hint}>Stand inside the flat, near a window if you can, when you tap this.</Text>
            <View style={styles.radiusRow}>
              <Text style={styles.radiusLabel}>Radius</Text>
              <TextInput
                ref={radiusInput}
                style={[styles.input, radiusError !== null && styles.inputError]}
                value={radiusText}
                onChangeText={(text) => {
                  setRadiusText(text);
                  setRadiusError(null);
                }}
                onEndEditing={onRadiusDone}
                keyboardType="number-pad"
                maxLength={4}
                accessibilityLabel="Radius in metres"
              />
              <Text style={styles.unit}>m</Text>
            </View>
            <Text style={radiusError !== null ? styles.errorText : styles.hint}>
              {radiusError ?? `${MIN_RADIUS_M} to ${MAX_RADIUS_M} m. Default ${DEFAULT_RADIUS_M} m.`}
            </Text>
          </Card>

          <Card title="3. Test">
            <Row label="Status" value={running ? 'Running' : 'Stopped'} tone={running ? 'good' : 'neutral'} />
            <Button
              label={running ? 'Stop test' : 'Start test'}
              variant={running ? 'danger' : 'primary'}
              onPress={onToggleTest}
              busy={busy === 'test'}
              disabled={!running && !canStart}
            />
            {!running && !canStart ? (
              <Text style={styles.hint}>
                {home === null ? 'Set the home pin first.' : 'Location must be "Allow all the time" first.'}
              </Text>
            ) : null}
          </Card>

          <Card title="Right now">
            <Button
              label="Check my distance from home"
              variant="secondary"
              onPress={onMeasure}
              busy={busy === 'measure'}
              disabled={home === null}
            />
            {measurement !== null ? (
              <Text style={styles.body}>
                {formatDistance(measurement.distanceM)} from home, {measurement.inside ? 'inside' : 'outside'} the circle
                {measurement.accuracyM !== null ? `. GPS accuracy ${formatAccuracy(measurement.accuracyM)}.` : '.'}
              </Text>
            ) : null}
          </Card>

          <Card title="Mark it yourself">
            <Text style={styles.body}>
              Tap the moment you really leave or reach the flat. Later we compare these with what the phone detected.
            </Text>
            <View style={styles.pair}>
              <Button
                label="I just left"
                variant="secondary"
                onPress={() => void onMark('marked-left')}
                busy={busy === 'mark'}
                grow
              />
              <Button
                label="I just arrived"
                variant="secondary"
                onPress={() => void onMark('marked-arrived')}
                busy={busy === 'mark'}
                grow
              />
            </View>
          </Card>

          <Card title={`Log (${entries.length >= LOG_SHOWN ? `latest ${LOG_SHOWN}` : entries.length})`}>
            <View style={styles.pair}>
              <Button
                label="Share log"
                variant="secondary"
                onPress={() => void onShare()}
                disabled={entries.length === 0}
                grow
              />
              <Button
                label="Clear"
                variant="secondary"
                onPress={onClear}
                busy={busy === 'clear'}
                disabled={entries.length === 0}
                grow
              />
            </View>
            {entries.length === 0 ? (
              <Text style={styles.hint}>Nothing logged yet.</Text>
            ) : (
              entries.map((entry) => <LogItem key={entry.id} entry={entry} />)
            )}
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

type LogTone = 'detected' | 'marked' | 'error' | 'info';

function toneOf(entry: LogEntry): LogTone {
  if (entry.kind === 'enter' || entry.kind === 'exit') return 'detected';
  if (entry.kind === 'marked-left' || entry.kind === 'marked-arrived') return 'marked';
  if (entry.kind === 'error') return 'error';
  return 'info';
}

function LogItem({ entry }: { entry: LogEntry }) {
  const details = [
    entry.distanceM !== null ? `${formatDistance(entry.distanceM)} from home` : null,
    entry.accuracyM !== null ? `GPS ${formatAccuracy(entry.accuracyM)}` : null,
    entry.note,
  ].filter((part): part is string => part !== null && part !== '');
  const tone = toneOf(entry);
  return (
    <View style={styles.logItem}>
      <View style={[styles.dot, dotTone[tone]]} />
      <View style={styles.logBody}>
        <Text style={[styles.logTitle, tone === 'detected' && styles.logTitleStrong]}>{LOG_LABELS[entry.kind]}</Text>
        <Text style={styles.logMeta}>
          {formatTime(entry.at)}
          {details.length > 0 ? ` · ${details.join(' · ')}` : ''}
        </Text>
      </View>
    </View>
  );
}

const dotTone = StyleSheet.create({
  detected: { backgroundColor: colors.detected },
  marked: { backgroundColor: colors.marked },
  error: { backgroundColor: colors.bad },
  info: { backgroundColor: colors.info },
});

const styles = StyleSheet.create({
  // Android draws the app edge to edge: keep content below the status bar and clear of the
  // navigation bar. (react-native-safe-area-context is left out until Windows long paths are on.)
  safe: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 64 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  lead: { fontSize: 14, lineHeight: 20, color: colors.muted },
  notice: { backgroundColor: colors.noticeBackground, borderRadius: 10, padding: 12 },
  noticeText: { fontSize: 14, lineHeight: 20, color: colors.text },
  body: { fontSize: 14, lineHeight: 20, color: colors.text },
  hint: { fontSize: 13, lineHeight: 18, color: colors.muted },
  errorText: { fontSize: 13, lineHeight: 18, color: colors.bad },
  radiusRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  radiusLabel: { fontSize: 14, color: colors.muted, flex: 1 },
  input: {
    minWidth: 88,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    color: colors.text,
    textAlign: 'right',
  },
  inputError: { borderColor: colors.bad },
  unit: { fontSize: 14, color: colors.muted },
  pair: { flexDirection: 'row', gap: 12 },
  logItem: { flexDirection: 'row', gap: 10, paddingVertical: 6 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  logBody: { flex: 1, gap: 2 },
  logTitle: { fontSize: 14, color: colors.text },
  logTitleStrong: { fontWeight: '600' },
  logMeta: { fontSize: 12, color: colors.muted },
});
