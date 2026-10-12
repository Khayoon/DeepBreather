# Publish Deep Breather on Google Play

Checked October 12, 2026. The supported release targets are web and Android.
The GitHub upload is source publication, not a Google Play submission.

## What is ready

- Expo SDK 57 app with golden lungs, breathing controls, bundled audio and local history.
- `eas.json` has a `production` profile that builds an Android App Bundle (`.aab`).
- The previously verified Android build targets API 36.
- Local testing APKs use the Android Debug certificate. Do not upload those APKs to Play.

## 1. Enroll and verify the developer account

Use [Google Play Console](https://play.google.com/console/signup). Registration
has a one-time US$25 fee; complete identity, contact and any device verification.
Check the appropriate account type before registering. Google's policy requires
Organization accounts for health apps, including medical/research examples.
This app is a breathing/wellness guide, so confirm its classification with Play
support rather than assuming Personal is eligible. Organization verification
requires a D-U-N-S number.

Sources: [Enrollment](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en),
[account requirements](https://support.google.com/googleplay/android-developer/answer/10788890?hl=en).

## 2. Choose the permanent app identity

`app.json` currently uses `com.zachfarris.deepbreather` for `expo.android.package`.
Confirm that identifier, or change it to your chosen unique identifier, before
creating the first Play release. Google package names cannot be changed for an
existing app. The store title can be Deep Breather independently of the package.
Increase `expo.android.versionCode` for each later Play upload.

Source: [Create and set up your app](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en).

## 3. Finish the privacy and store materials

Before the production build:

- Publish a public privacy-policy page and add access to it inside the app.
  Include developer contact information, the local history/preferences behavior,
  retention and deletion. The repository README is not a finished privacy policy.
- Review all release SDK behavior before answering Data safety. Local-only data
  processing is excluded from Google's definition of collection, but do not
  assume third-party libraries have no other data flows.
- Prepare the title, short/full descriptions, support email, Android screenshots,
  a 512 x 512 store icon, and a 1024 x 500 feature graphic. Existing screenshots
  are browser captures; capture the actual Android release for the store.
- Complete App access, Ads, Target audience, Content rating, Data safety and
  Health apps declarations using the actual released behavior. The current app
  has no sign-in or ads. Stress Management, Relaxation, Mental Acuity appears to
  fit the health declaration; this is a suggested classification, not a Google
  decision about this app.
- Include the health-policy disclaimer in the store description: the app is not
  a medical device and does not diagnose, treat, cure or prevent medical
  conditions. Tell users to consult a healthcare professional. Existing in-app
  safety information does not replace that store-description requirement.

Sources: [User data and privacy](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en),
[Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en),
[listing assets](https://support.google.com/googleplay/android-developer/answer/9866151),
[Health declaration](https://support.google.com/googleplay/android-developer/answer/14738291?hl=en),
[health policy](https://support.google.com/googleplay/android-developer/answer/16679511?hl=en).

## 4. Build the production app bundle with Expo

From the repository root, using Node.js 22.13 or newer:

```sh
npm ci
npx eas-cli login
npx eas-cli build:configure --platform android
npx eas-cli build --platform android --profile production
```

Connect the project to your Expo account when prompted. Have EAS generate/manage
production Android upload credentials, or supply your existing upload key if
this is an already-registered Play app. Keep signing credentials and service
account keys out of GitHub. Download the resulting `.aab` from the successful
EAS build. Use Play App Signing when setting up the app in Play Console.

API 36 matches the current target requirement; recheck that policy at release.
Configuring the profile alone does not generate or sign an app bundle.

Sources: [Expo production builds](https://docs.expo.dev/deploy/build-project/),
[Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756?hl=en),
[target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en).

## 5. Upload, test and submit

Create the app in Play Console and upload the `.aab` to Internal testing first.
Test install, launch, full breathing sessions, sound, background/pause behavior,
small screens, history and deletion on real Android devices. Resolve pre-launch
report problems and complete the store setup.

If an eligible Personal account created after November 13, 2023 applies, run a
closed test with at least 12 testers continuously opted in for 14 days, then
apply for production access. Internal testing alone does not meet that rule.
Follow the requirements shown for your verified account, then submit the
production release for Google's review.

Manual upload is the simplest initial workflow here. EAS Submit is another
option once a Google service account and its Play permissions are configured;
current Expo documentation supports creating the first internal-testing release.

Sources: [Testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en),
[EAS Submit](https://docs.expo.dev/submit/android/).

## Remaining work

Developer-account verification, permanent package-name confirmation, public
privacy policy and in-app access, store materials/forms, production signing and
AAB creation, and actual Android device testing remain. No Google Play release
has been submitted by this source upload.
