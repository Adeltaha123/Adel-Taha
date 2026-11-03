# Running on iPhone and Android

## Install the web app today

Serve the production dist folder over HTTPS. On iPhone, open the site in Safari and use Share → Add to Home Screen; enable Open as Web App if offered. [Apple's instructions](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios).

On Android, open the site in Chrome and use Install app or Add to Home screen, depending on the browser/device. Installation behavior varies by platform; see [MDN's PWA installation guide](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable). This does not require an App Store or Google Play listing.

## Native projects included

android/ and ios/ were generated with Capacitor 8. They bundle the Vite web build. The working app identifier is com.adeltaha.mypa; confirm it before signing a first release. Changing it later creates a different application identity. No signing certificates, store credentials, or release binaries are included.

The generated targets use Android minSdk 24 and iOS 15. Check native project files when upgrading Capacitor. Android requests microphone access in its manifest; iOS includes a microphone purpose string. These declarations still require testing the actual permission/recording flow on devices.

## Development prerequisites

Use Node 22.15 or later for this repository. For Android, install Android Studio and its SDK/toolchain; use its supported bundled JDK. For iOS, build on macOS with Xcode. Capacitor 8's documented requirements include Android Studio 2025.2.1+ and Xcode 26+. [Capacitor environment setup](https://capacitorjs.com/docs/getting-started/environment-setup).

Generating the iOS folder on Windows does not compile or sign an iOS app. macOS build infrastructure is required for that step.

```sh
npm ci
npm run check
npm run mobile:sync
```

For Android:

```sh
npm run android:open
```

Choose a device/emulator in Android Studio and run. After changing web code, run npm run mobile:sync again. Create signed APK/AAB artifacts through Android Studio when the app is ready for distribution.

For iOS, on a Mac:

```sh
npm ci
npm run mobile:sync
npm run ios:open
```

Choose a signing team and a simulator/device in Xcode. Use Archive for release distribution after completing device checks. The generated project uses Swift Package Manager. The add commands in package.json are only for recreating missing native platforms; do not run them against the included folders.

## Work before store distribution

Both platforms use the same backend. Set VITE_API_URL to its public HTTPS origin before mobile:sync; see [deployment](DEPLOYMENT.md). Text records sync; audio and provider keys stay on the device.

| Area | Current implementation | Remaining native work |
| --- | --- | --- |
| Tasks, notes, habits, journal | Local browser-compatible records | Test persistence, lifecycle, keyboard, RTL and upgrades on both platforms. |
| Voice | Web Speech / MediaRecorder and provider transcription | Validate microphone permissions and audio formats; add a native speech/recording adapter where browser support is insufficient. |
| Reminders | Native scheduled notifications, quiet hours, overdue rescheduling; browser timers/calendar export | Test background delivery, permissions, exact-alarm settings, reboot and timezone changes on both platforms. |
| Biometrics | Browser WebAuthn when available | Add a native biometric/secure-storage adapter; define what actually encrypts or protects records and credentials. |
| Sharing | PWA Web Share Target and .txt import | Add Android share intents and an iOS share extension if receiving shares is required in the native app. |
| Backups/calendar files | Browser file inputs and download links | Validate or replace with native filesystem/share/document-picker integrations. |
| Data transfer | Export/import of text records | Native apps do not automatically inherit website storage; audio and keys are currently excluded from backups. |
| AI | Existing personal-key provider calls | Test with real accounts; for a public service, implement server-managed credentials, access control and usage limits. |
| Release assets | Existing web icons; generated native placeholders | Prepare native icons, launch assets, screenshots, privacy disclosures, versioning and signing. |

This work created and synchronized the native projects, but no Android emulator/device or iOS simulator/device build was run. Store publication has not been performed. A reviewable, device-tested build is the next milestone.
