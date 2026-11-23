# FlatApp

Android app for flatmates: bills paid or unpaid, today's dinner, who is home, group buys, flat info. 
**Current state (2026-11-21):** the full app built to the approved design. Sign-in (email/password;
Google once switched on in Supabase), fingerprint lock, flats (create, join by invite code,
admin/member, several flats, delete), Home dashboard, Bills (month list, mark paid/unpaid with history,
recurring bills with reminders), Dinner tonight, Buy list with In/Out votes, Who's home (geofence
around the flat pin plus manual status), Flat info (owner, rent, WiFi, contacts, documents), Notice
board, Polls, Repairs, Members and invite, in-app Notifications, Settings. The 3-day **geofence test**
(see `TESTING.md`) is still under Settings. Phone push notifications through Firebase (see below; needs a one-time key setup).

**2026-11-23, not yet on a phone:** reliable Who's home, home Wi-Fi as the precise "got home" signal,
a map for the home pin (see "Who's home" below), Change password, and deleting what you added (see
those sections). All three migrations are pushed (`20261123100000_presence_reliability.sql`,
`20261123110000_home_wifi_networks.sql`, `20261123120000_delete_what_you_added.sql`). Needs a new APK
with a prebuild (new native code: `expo-background-task`, `react-native-webview`,
and the local module `modules/flat-wifi`).

**Backend:** Supabase project `flatapp` (Mumbai). Schema and access rules in `supabase/migrations/`;
apply with `npx supabase db push --remote`, then regenerate `src/lib/database.types.ts` with
`npx supabase gen types typescript --remote`. The URL and publishable key are in `.env.local`
(git-ignored).

**Google sign-in** needs two switches in the Supabase dashboard: Authentication → Sign In / Providers →
Google (client ID and secret from Google Cloud), and Authentication → URL Configuration → Redirect
URLs: add `flatapp://auth-callback`. Until then the Google button says it is not switched on.

## Stack

Expo SDK 58 (React Native 0.88, TypeScript, new architecture), Android only for v1. Supabase Free
(auth, Postgres with row-level security, realtime, pg_cron, storage).

**No Expo Router, no react-native-screens.** The first build crashed natively on the phone
(`addViewAt: failed to insert view … The specified child already has a parent`) when screens changed.
Navigation is now a plain stack of routes in React state (`src/nav/`), rendered as ordinary views:
lower screens stay mounted but hidden, so Back keeps their state. Every `Pressable` has
`collapsable={false}` and the screen scroller has `removeClippedSubviews={false}`.

| Path | Holds |
| --- | --- |
| `index.ts` | Entry: defines both background geofence tasks, then registers `App` |
| `App.tsx` | Fonts, providers, and the three states: signed out → sign in; no flat → flat setup; else the app |
| `src/nav/` | Routes, titles, the stack navigator, Android Back handling |
| `src/shell/` | Header, bottom tabs, side menu, `MainShell` (route → screen, presence sync) |
| `src/screens/` | One file per screen; `auth/AuthScreens.tsx` is sign-in and create-account |
| `src/auth/` | Session and profile; `google.ts` (Google sign-in through the browser) |
| `src/flats/` | The person's flats, current flat, members (live); live counts for badges; invite sharing |
| `src/data/` | Queries for dinner, buy list, presence, notices, polls, repairs, flat info, alerts, prefs |
| `src/bills/` | Bill queries, status and history wording, category picker |
| `src/presence/` | Home/Out: geofence and Wi-Fi tasks, the retry queue, the 30-minute check-in, the sync |
| `modules/flat-wifi/` | Local Expo module (Kotlin): current Wi-Fi name, and a task run when Wi-Fi connects |
| `src/push/` | Phone notifications: permission, Firebase token, opening the right screen on tap |
| `src/lock/` | Fingerprint lock gate and its setting |
| `src/lib/` | Supabase client, generated database types, errors, formatting, realtime and live-data hooks |
| `src/geofence/`, `src/screens/GeofenceTestScreen.tsx` | The 3-day geofence test |
| `src/components/`, `src/theme.ts` | Shared UI pieces and icons; colours and fonts (Inter, Space Grotesk) |
| `supabase/migrations/` | Database schema, access rules, functions, daily jobs, storage bucket |
| `supabase/functions/push/` | Edge Function that sends notifications to phones through Firebase |
| `plugins/withLocalAndroidBuild.js` | Windows build settings that must survive `expo prebuild` |
| `react-native.config.js` | Native libraries kept out of the build |


## Who's home

Each phone watches a circle around the flat's pin (Android geofencing, `src/presence/`) and sends
only Home or Out, never coordinates.

- **Nothing is lost when a call fails.** A crossing is queued on the phone first (`report.ts`, in the
  SQLite-backed localStorage) and sent with the time it happened. Leaving the flat is when the phone
  drops off the flat's WiFi, so the first try often fails. The queue is sent again on the next
  crossing, the next check-in and whenever the app opens. `report_presence(p_flat, p_state, p_at)`
  keeps `since` true, ignores a crossing older than the stored state, and pushes "X left home" only
  while it is under 45 minutes old.
- **Check-in about every 30 minutes** (`checkin.ts`, `expo-background-task` = WorkManager, only while
  online). It sends anything waiting, reads the flats' pins fresh, and re-registers the circles.
  Registering makes Android report inside/outside at once, so the server's `presence.checked_at`
  moves on and a missed crossing corrects itself. Opening the app does the same, at most every 5 minutes.
- **"Not sure"** is shown for anyone whose phone has not checked in for 8 hours (`STALE_AFTER_HOURS`
  in `config.ts`; generous because Doze holds background work for hours overnight). If your own
  phone's check-in has been quiet that long, Who's home tells you to set Battery to Unrestricted.
- No in-task retry timers on purpose: React Native may not fire `setTimeout` in a background task.
- **Home Wi-Fi** (`wifi.ts`, `modules/flat-wifi`): joining one of the flat's networks
  (`flats.home_networks`, up to 10, shared by the flat; Flat info's Wi-Fi name is copied in by a
  trigger; "This is our Wi-Fi" on Who's home adds the current one) reports Home at once, even with
  the app closed. The local Expo module registers `ConnectivityManager.registerNetworkCallback` with
  a PendingIntent as an expo-task-manager consumer (`WifiTaskConsumer`, built like expo-location's
  geofencing one) and reads the network name with `WifiReader` (needs location access; the name is
  matched on the phone and never sent). Rules in `task.ts`: a circle Out while still on the flat's
  Wi-Fi confirms Home instead; a phone that joined the flat's Wi-Fi in the last 14 days
  (`WIFI_TRUST_DAYS`) is not marked Home by entering the circle unless its Wi-Fi is off; losing
  Wi-Fi is never read as Out. The check-in and opening the app also confirm Home from the Wi-Fi.
  Known gap: a Wi-Fi phone arriving while the router is down stays as it was until the Wi-Fi is back.
- **Home pin** (`HomePinScreen`, `components/MapPicker.tsx`): tap or drag the pin on a map (Leaflet
  with OpenStreetMap tiles in a WebView: no key, no billing), or use the phone's location. Circles
  are 100 to 1000 m: Android geofencing is not reliable below about 100 m.
- Signing out stops the circles and the check-in and forgets anything still queued.


## Change password

Settings → Security → Change password (`ChangePasswordScreen`): a signed-in person sets a new password
for their own account, typed twice, at least 8 characters like sign-up. No current password and no
email code, on purpose: being signed in is the proof. `supabase.auth.updateUser({ password })` allows
that because "Secure password change" is off in Supabase (Authentication → Providers → Email;
`secure_password_change = false` in `config.toml`, and `npx supabase config diff --remote` shows the
hosted project matches). Switching it on would make Supabase demand a fresh sign-in for sessions over
24 hours old; the screen then says to sign out and in again.

"Forgot password?" on the sign-in screen still sends a link to the project's Site URL
(`http://localhost:3000` on the hosted project), not to the app, so it does not work yet.


## Deleting what you added

Whoever added something, or an admin, can delete it, with a confirmation and no time limit
(`20261123120000_delete_what_you_added.sql`).

- **Bills are hidden, not erased** (`bills.deleted_at` / `deleted_by`, `delete_bill`). The paid/unpaid
  history must stay traceable, and an erased recurring month would come back the next morning (the
  daily job re-creates any missing month; the kept row is what stops it). The history gets a
  "deleted" line, the flat is notified, and a paid bill needs a reason. Lists and the unpaid badge
  skip deleted bills (`.is('deleted_at', null)`); the bill screen of a deleted bill shows who deleted
  it and why, which is also where an old notification about it leads. `mark_bill`, edits and
  reminders ignore deleted bills.
- **Polls, buy list items and repairs are deleted outright** (`delete_poll`, `delete_buy`,
  `delete_repair`), with their votes. Close, cancel and fixed stay for normal endings.
- Notices, documents and contacts could already be deleted.
- Realtime cannot filter DELETE events, so a flatmate looking at a list when something is deleted
  sees it go the next time the screen opens or is pulled to refresh (as with notices before).


## Phone push notifications

Every row written to `public.notifications` is also sent to the recipients' phones:

1. The app registers its Firebase token with `register_push_token` (at start; Settings shows the state).
2. The statement-level trigger `notifications_push` posts the new messages to the Edge Function
   `push` through pg_net (asynchronous, so a slow Firebase never slows a change). The call carries
   the Vault secret `push_webhook_secret`; the function checks it against Vault.
3. `supabase/functions/push` signs in to Google with the Firebase service account and sends each
   message on the Android channel `flat-updates`. Tokens Firebase calls dead are deleted.

Deploy the function with `npx supabase functions deploy push --use-api --no-verify-jwt`.

**One-time setup (the owner does this):** Firebase console → project `flatapp-ac786` → Project
settings → Service accounts → Generate new private key. Then, in PowerShell:

```powershell
Set-Location D:\Applications\FlatApp; $key = Get-ChildItem "$HOME\Downloads\flatapp-ac786-firebase-adminsdk-*.json" | Sort-Object LastWriteTime | Select-Object -Last 1; npx supabase secrets set --yes "FCM_SERVICE_ACCOUNT_B64=$([Convert]::ToBase64String([IO.File]::ReadAllBytes($key.FullName)))"; if ($?) { Remove-Item $key.FullName }
```

That stores the key only in Supabase (as base64, so PowerShell's quoting cannot break the JSON) and
deletes the downloaded file. Until it is set, notifications still appear inside the app, and the
function answers 503 "Push is not set up yet". Test from Settings → Phone notifications → Send a test.

## Build the APK on this PC

**Two files are not in git** and must be put in the project root of a fresh clone first:
`.env.local` (copy `.env.example` and fill in `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_KEY`, the publishable key from Supabase → Project settings → API keys) and `google-services.json` (Firebase console → project
`flatapp-ac786` → Project settings → the Android app `com.flatapp.app`). Then run `npm install`.

Tools live outside AppData: JDK 17 in `C:\Android\jdk17`, Android SDK in `C:\Android\Sdk`. No system
environment variables are set, so pass them per shell:

```powershell
$env:JAVA_HOME = 'C:\Android\jdk17'; $env:ANDROID_HOME = 'C:\Android\Sdk'
npx expo prebuild --platform android --no-install   # only after app.json or native module changes
Set-Content android\local.properties 'sdk.dir=C:/Android/Sdk'
cd android; .\gradlew.bat assembleRelease
```

The APK lands in `android\app\build\outputs\apk\release\app-release.apk`. `android/` is generated
(Continuous Native Generation) and git-ignored: configure native behaviour in `app.json` and config
plugins, never by hand. A prebuild drops `local.properties`, so write it again afterwards.

`plugins/withLocalAndroidBuild.js` keeps three settings across prebuilds: `reactNativeArchitectures=arm64-v8a,x86_64`
(real phones plus the emulator, no 32-bit builds), the app's native build on SDK CMake 3.31.6, and R8 keep
rules appended to `android/app/proguard-rules.pro`.

**Release builds run R8** (`android.enableMinifyInReleaseBuilds=true`), which strips anything only reached
by reflection. Two cases bit on 2026-11-23: WorkManager's Room database constructor (the app crashed on
start: `NoSuchMethodException: androidx.work.impl.WorkDatabase_Impl.<init>`; rule in the plugin) and
expo-task-manager consumers, which it creates and restores by class name (`modules/flat-wifi` ships
`-keep class com.flatapp.wifi.** { *; }` as consumer rules, like expo-location). After adding a native
library, install the release APK and open it once before calling it done: a debug build does not run R8.

`react-native.config.js` keeps reanimated, worklets and gesture-handler out of the native build. npm
installed them as optional peers of expo-router (since removed), the app does not use them, and their build output
(~3 GB inside `node_modules`) filled drive D: once. A full build needs about 2.5 GB free on D:; build
outputs are safe to delete (`android/app/build`, `node_modules/*/android/build`, `*/.cxx`). Never run
two Gradle builds at once.

### Windows long paths

Libraries with their own C++ screen components (react-native-safe-area-context,
react-native-screens before it was removed) compile object files at paths over 330 characters.
That needs Windows long paths (switched on 2026-11-21:
`Set-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' LongPathsEnabled 1`, admin) and a
long-path-aware ninja, which is why the app is pinned to CMake 3.31.6 (ninja 1.12.1). The SDK's default
CMake 3.22.1 ships ninja 1.10.2 and fails with `ninja: error: mkdir(...): No such file or directory`.
After changing the registry, stop old Gradle daemons (`.\gradlew.bat --stop`).

## Signing

Release APKs are signed with FlatApp's own key (since 2026-11-23). Before that they carried the public
React Native debug key, which every RN project shares and malware reuses: Sophos on a flatmate's phone
flagged the app as PUA, "App/Other/Android Abused Certificate", while its behaviour scores were low.

- **Create the key once per build PC:** `powershell -ExecutionPolicy Bypass -File scripts\create-release-key.ps1`.
  You type the password; the script writes the key to `%USERPROFILE%\.flatapp-keys\flatapp-release.jks`
  and the `FLATAPP_UPLOAD_*` settings to your user-level `%USERPROFILE%\.gradle\gradle.properties`.
  Nothing secret is in the project or git.
- **Back up the key file and its password.** Lose them and no phone can update FlatApp again.
- `plugins/withLocalAndroidBuild.js` points `buildTypes.release` at that key and stops a release build
  with an error when the settings are missing, so a debug-signed release cannot slip out again.
  Debug builds keep the debug key.
- **Changing the key once means every phone uninstalls the old FlatApp and installs the new APK**
  (Android refuses an update with a different signature). Data lives in Supabase; people sign in again
  and lose only on-phone settings (fingerprint lock, the geofence test log).
- Check a build: `C:\Android\Sdk\build-tools\37.0.0\apksigner.bat verify --print-certs <apk>` must not
  show the debug certificate `5e8f16062ea3cd2c4a0d547876baa6f38cabf625` (SHA-1).

## Checks

```powershell
npx tsc --noEmit
npx expo lint
npx expo-doctor
```

`npx expo install <pkg>` fails on this machine's npm (EALLOWSCRIPTS): it records the right version in
`package.json`, then run plain `npm install`.
