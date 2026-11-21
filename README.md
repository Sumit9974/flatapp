# FlatApp

Android app for flatmates: bills paid or unpaid, today's dinner, who is home, group buys, flat info. 
**Current state (2026-11-21):** the full app built to the approved design. Sign-in (email/password;
Google once switched on in Supabase), fingerprint lock, flats (create, join by invite code,
admin/member, several flats, delete), Home dashboard, Bills (month list, mark paid/unpaid with history,
recurring bills with reminders), Dinner tonight, Buy list with In/Out votes, Who's home (geofence
around the flat pin plus manual status), Flat info (owner, rent, WiFi, contacts, documents), Notice
board, Polls, Repairs, Members and invite, in-app Notifications, Settings. The 3-day **geofence test**
(see `TESTING.md`) is still under Settings. Phone push notifications through Firebase (see below; needs a one-time key setup).

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
| `src/presence/` | Background task that reports Home/Out, and the geofence sync |
| `src/push/` | Phone notifications: permission, Firebase token, opening the right screen on tap |
| `src/lock/` | Fingerprint lock gate and its setting |
| `src/lib/` | Supabase client, generated database types, errors, formatting, realtime and live-data hooks |
| `src/geofence/`, `src/screens/GeofenceTestScreen.tsx` | The 3-day geofence test |
| `src/components/`, `src/theme.ts` | Shared UI pieces and icons; colours and fonts (Inter, Space Grotesk) |
| `supabase/migrations/` | Database schema, access rules, functions, daily jobs, storage bucket |
| `supabase/functions/push/` | Edge Function that sends notifications to phones through Firebase |
| `plugins/withLocalAndroidBuild.js` | Windows build settings that must survive `expo prebuild` |
| `react-native.config.js` | Native libraries kept out of the build |


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

`plugins/withLocalAndroidBuild.js` keeps two settings across prebuilds: `reactNativeArchitectures=arm64-v8a,x86_64`
(real phones plus the emulator, no 32-bit builds) and the app's native build on SDK CMake 3.31.6.

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

The release build is signed with the debug key, which is fine for sideloading the test. A real
release needs its own keystore.

## Checks

```powershell
npx tsc --noEmit
npx expo lint
npx expo-doctor
```

`npx expo install <pkg>` fails on this machine's npm (EALLOWSCRIPTS): it records the right version in
`package.json`, then run plain `npm install`.
