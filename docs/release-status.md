# Release status

Verified on Windows, September 10, 2026.

## Web

- Production export: `dist/`.
- Downloadable static-site package: `releases/DeepBreather-web.zip`.
- Local preview: `npm run serve:web` (prints its address).
- 58 browser checks pass, including complete sessions, keyboard controls,
  settings, audio failure recovery, persistence, resize, and short screens.
- 8 unit regressions pass for pause bookkeeping, damaged storage and DST.
- Real-time animation check passes for full expansion/contraction and resume.

The site has not been published to an external host. Upload the contents of
`dist/` to a static host at its root to publish it. The live preview is local.

## Android

Built successfully with Expo SDK 57 and Gradle 9.3.1. The downloadable
personal-testing APK is `releases/DeepBreather-android.apk`.

- Package: `com.zachfarris.deepbreather`, version `1.0.0` (version code 1).
- Minimum Android SDK 24; target SDK 36.
- Includes arm64-v8a, armeabi-v7a, x86, and x86_64 native libraries.
- APK v2 signature verified with the generated Android Debug certificate.
- Release is not debuggable. No microphone permission is declared.
- Bundled JavaScript is present; all four audio tracks match source SHA-256 hashes.
- Gradle's release lint checks pass. No device or emulator run was performed.

```sh
npm run check:android
npm run apk
```

The build helper regenerates native configuration before building. It finds
Android Studio's JDK and SDK automatically on Windows/macOS, or uses JAVA_HOME
and ANDROID_HOME. Gradle may download SDK/NDK and native dependencies on the
first build. It never installs onto a connected device.

Native build output: `android/app/build/outputs/apk/release/app-release.apk`.
Local release APKs use the generated debug key and are for personal testing,
not a signed Play Store release. The app bundles JavaScript and ambient audio;
a built APK does not need a running Metro server.

To try it, copy `DeepBreather-android.apk` to your Android phone, open the file,
and allow installation from that file-opening app when Android prompts you.
The downloadable web ZIP and APK checksums are in `releases/SHA256SUMS.txt`.

## Publishing scope

Web and Android are the current release targets. Historical artifacts described
above are local build outputs, excluded from Git; they are not published
GitHub release downloads. A production-signed Android App Bundle and store
submission remain separate work. Follow [the publishing guide](google-play-publishing.md).

On Windows, Command Processor AutoRun commands that change directories can
break Gradle child processes. Disable that directory change for build shells
if affected; the helper provides the DEEP_BREATHER_BUILD environment flag for
an existing conditional AutoRun setup. The helper does not modify the registry.

References: [Expo APK builds](https://docs.expo.dev/build-reference/apk/),
[EAS build profiles](https://docs.expo.dev/build/eas-json/).
