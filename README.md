# Deep Breather

Guided breathing with golden lungs, a 3-second inhale and 3-second exhale,
optional ambient audio, and practice history stored on your device.

Choose 1–10 rounds. Each round has 30 breaths, an open-ended hold that you end
with **Breathe**, a recovery inhale and 15-second hold, then a relaxed release.
The safety reminder is inline; full details are under **Safety**.

## Run locally

Use Node.js **22.13 or newer** (Expo SDK 57), then:

```sh
npm ci
npm run web
```

For the production web version:

```sh
npm run build:web
npm run serve:web
```

The preview command prints its local URL. The `dist/` folder contains the
static site; deploy that folder at your host's root. Assets and audio are
bundled, but a first web visit requires a connection to the host. Browser
storage belongs to that URL and device; it does not sync to other devices.

## Use the app

- **Start / Pause / Resume / Reset** control the session. Reset also stops music.
- **Breathe** ends the open hold immediately and begins recovery.
- **Sound** selects a loop, adjusts volume, and offers haptics on native devices
  and Calm mode. System reduced-motion preferences are respected.
- **Stats** shows session totals, active practice time, streaks, and retention
  times. Paused time is excluded. Sessions with at least 20 seconds of practice
  and a retention or completed round are saved, including eligible partial sessions.
- Opening a panel or switching away pauses breathing. Resume explicitly when
  ready. Music can continue separately; native lock-screen playback is supported.
- On the web, **Space** starts/pauses/resumes when the page has focus. During a
  retention it ends the hold. **Escape** closes a panel first, then resets the
  session. Focused buttons and sliders keep their usual keyboard behavior.

The screen scrolls on small displays. Changing the browser width preserves an
active session. Preferences and history are validated when loaded.

## Android

This project is being released for web and Android. Use Android Studio's SDK
and JDK 21 for a local Android build. Native project files are generated from
`app.json`; they are not the source of truth for app configuration.

Local Android build instructions and historical output status are recorded in
[docs/release-status.md](docs/release-status.md).

EAS profiles in `eas.json` prepare Android testing APKs and production app
bundles. Follow [the Google Play publishing guide](docs/google-play-publishing.md)
for developer enrollment, signing, store forms, and testing. The local APK uses
a debug signing key and is not the Google Play upload artifact.

The GitHub repository preserves its earlier React prototype under `legacy/`.
The Expo application at the repository root is the maintained version.

The app requests no microphone access; audio is playback only.

## Checks

```sh
npm test                # unit regressions + accelerated browser sessions
npm run build:web       # real production timings
npm run test:pacing     # real-time expansion, contraction and pause/resume
```

`EXPO_PUBLIC_TEST_TIMINGS=1` is only for the test build. Build scripts clear the
Metro cache to prevent test timings from leaking into production exports.
The browser tests start their own local server and clean it up afterward.

## Source map

- `src/patterns.js`: phases, durations and round transitions.
- `src/lib/useSession.js`: timing, pause bookkeeping and completion records.
- `src/lib/storage.js`: local preferences, history and calendar-day statistics.
- `src/components/BreathingOrb.js`: golden-lungs vector and animation.
- `src/components/SoundSheet.js`: music, volume and motion settings.
- `src/components/SafetyGate.js`: optional full safety details.
- `src/components/StatsPanel.js`: practice history.
- `src/screens/BreathingScreen.js`: session screen and controls.
- `src/web/WebShell.js`: responsive web layout.
- `tools/`: audio generation, icons, preview and native build helpers.

## Safety and privacy

Practise seated or lying down in a safe, dry place. Never practise in or near
water or while driving. Breath retention can cause fainting; do not force a
hold or try to faint. Stop if you feel unwell. Consult a clinician before trying
this practice if you have a health condition or are pregnant. This app is a
timer and visual guide, not medical advice. See the app's Safety panel and the
[official practice safety guidance](https://www.wimhofmethod.com/what-is-shallow-water-blackout).

There is no account, backend or analytics in this app. History and preferences
stay in local storage. Clear history from Stats or remove the app/site data to
remove it. External source links open only when selected.

MIT — see [LICENSE](LICENSE).
