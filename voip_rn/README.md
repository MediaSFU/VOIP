# VOIP React Native Application

[![React Native](https://img.shields.io/badge/React_Native-20232A?style=flat&logo=react&logoColor=61DAFB)](https://reactnative.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![MediaSFU](https://img.shields.io/badge/Built%20for-MediaSFU-blue)](https://mediasfu.com)

React Native CLI implementation of the MediaSFU dialer. Shares logic with the React web client while presenting a touch-friendly interface for iOS and Android.

> **Agent orchestration superpowers**
>
> - **Agent-only concierge mode** spins up MediaSFU Agents for automated triage while humans monitor in real time.
> - **Tap-to-take-control** empowers supervisors to capture the conversation seamlessly via `MediaSFURoomDisplay`.
> - **Hybrid agent + human routing** supports fast source switching, preserving transcripts and context.
> - **Coach-or-broadcast audio** toggles between caller-only coaching and play-to-all prompts mid-call.

## Prebuilt download

Grab the latest signed Android binary to explore the experience without a local build:

- 📱 **Android APK (React Native)**: [mediasfu-voip-rn.apk](https://mediasfu.com/apps/mediasfu-voip-rn.apk)

> ℹ️ iOS builds are queued for TestFlight once the automation pipeline clears compliance review.

## Table of contents

- [Overview](#overview)
- [Key features](#key-features)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Phone validation](#phone-validation)
- [MediaSFU lifecycle](#mediasfu-lifecycle)
- [Permissions](#permissions)
- [Build and release](#build-and-release)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

## Overview

`CallsPage.tsx` orchestrates dialing, MediaSFU room management, and call history. Supporting hooks (`useVoipConfig`, `useCallHistory`, `useOutgoingCallRoomManager`) keep API credentials, polling behaviour, and outgoing-room state synchronized with the server.

AsyncStorage mirrors the browser’s local storage, retaining API credentials and UI preferences across launches.

## Key features

- **Dialer UI** – Numeric keypad with quick duration shortcuts, validation states, and a collapsible layout for phones/tablets.
- **MediaSFU room display** – Mirrors the React dashboard, showing room name, participant, and microphone toggle state via `MediaSFURoomDisplay`.
- **Active call polling** – Polls MediaSFU for current calls with caching and retry logic to avoid rate limits.
- **Call history log** – Persists the last 50 calls locally with status, timestamps, and computed durations.
- **SIP configuration loader** – Fetches SIP configs through `callService.getSipConfigs`, presenting errors when permissions are missing.
- **Notification system** – In-app banners/modals for call state changes, microphone prompts, and navigation confirmations.

Video, push notifications, and background audio are not implemented in this sample.

## Project structure

```text
voip_rn/
├── src/
│   ├── components/
│   │   ├── Calls/CallsPage.tsx
│   │   ├── Common/
│   │   └── MediaSFU/MediaSFURoomDisplay.tsx
│   ├── hooks/
│   │   ├── index.ts
│   │   ├── useVoipConfig.ts
│   │   ├── useCallHistory.ts
│   │   └── useOutgoingCallRoomManager.ts
│   ├── services/
│   │   └── callService.ts
│   ├── types/
│   │   ├── call.types.ts
│   │   └── config.types.ts
│   └── utils/
│       ├── logger.ts
│       └── sipCallerParser.ts
├── android/
├── ios/
├── App.tsx
└── package.json
```

## Getting started

Follow the [React Native environment setup](https://reactnative.dev/docs/environment-setup) for the “React Native CLI Quickstart” path, then:

```bash
cd voip_rn
npm install

# iOS only (macOS)
cd ios && pod install && cd ..

npm start          # start Metro bundler
npm run android    # or npm run ios
```

Use `yarn` equivalents if preferred.

## Configuration

Settings mirror the React client and are persisted using AsyncStorage.

| Setting | Purpose | Location |
| --- | --- | --- |
| API username/key | MediaSFU credentials for REST calls | Settings drawer → API Configuration |
| Base URL | MediaSFU endpoint (defaults to `https://mediasfu.com`) | Same as above |
| Poll interval | Live updates cadence (seconds) | Settings drawer |
| Theme | Light/dark | App header toggle |

Clearing credentials resets stored SIP configuration and forces re-authentication.

## Phone validation

- Uses `libphonenumber-js` for parsing, validation, and formatting (`AsYouType`).
- `isValidPhoneNumber` guards the call button; invalid numbers surface inline feedback.
- Display formatting uses `parsePhoneNumber(...).formatInternational()` when valid.

## MediaSFU lifecycle

1. `callService.makeCall` posts to MediaSFU with E.164 normalized numbers.
2. `useOutgoingCallRoomManager` monitors room creation and attaches the first SIP participant to the UI.
3. Active calls refresh through `callService.getActiveCalls`, which caches responses for three seconds to avoid throttling.
4. History updates via `useCallHistory`, capped at 50 entries (`MAX_HISTORY_RECORDS`).
5. Manual hang-up invokes `callService.hangupCall` with the SIP call ID.

Logs are emitted through `callLogger`, `roomLogger`, and `apiLogger` for troubleshooting.

## Permissions

### Android

Declared in `android/app/src/main/AndroidManifest.xml`:

| Permission | Purpose |
|------------|---------|
| `INTERNET` | MediaSFU API + signaling |
| `CAMERA` | Reserved for future video support |
| `RECORD_AUDIO` | Capture microphone for VOIP calls |
| `ACCESS_NETWORK_STATE` | Detect connectivity changes for adaptive polling |
| `CHANGE_NETWORK_STATE` | Allow network adjustments by platform libs |
| `MODIFY_AUDIO_SETTINGS` | Control audio routing, mode, and gain |
| `BLUETOOTH` / `BLUETOOTH_ADMIN` (<= API 30) | Legacy Bluetooth control |
| `BLUETOOTH_CONNECT` | Required for headset management (API 31+) |

Optional (add only when implementing):

| Potential Permission | Usage Trigger |
|----------------------|--------------|
| `POST_NOTIFICATIONS` | Incoming call / status notifications (Android 13+) |
| `FOREGROUND_SERVICE` (+ media/communication type) | Persistent call UI / background audio |
| `WAKE_LOCK` | Keep CPU awake during active call |

### iOS

Added to `ios/voip_rn/Info.plist`:

| Key | Purpose |
|-----|---------|
| `NSMicrophoneUsageDescription` | Microphone access for VOIP calls |
| `NSCameraUsageDescription` | Future video / identity capture |

If adding CallKit / VoIP push later also include:

- `NSUserNotificationUsageDescription` (notifications)
- `NSBluetoothAlwaysUsageDescription` (Bluetooth accessories)
- Enable `voip` push in entitlements and configure PushKit handling.

## Build and release

| Platform | Command | Notes |
| --- | --- | --- |
| Android (debug) | `npm run android` | Uses connected device/emulator |
| Android (release) | `cd android && ./gradlew assembleRelease` | Output at `android/app/build/outputs/apk/release/` |
| iOS (debug) | `npm run ios` | Launches simulator via Xcode CLI |
| iOS (archive) | Open `ios/voip_rn.xcworkspace` in Xcode → Product → Archive | Configure signing before upload |

Ensure Hermes is enabled (default) and run `npm run lint && npx tsc --noEmit` before packaging.

## Troubleshooting

- **Metro cache issues** – `npx react-native start --reset-cache`.
- **Android build fails** – `cd android && ./gradlew clean`, then rerun.
- **Pods out of date** – `cd ios && pod repo update && pod install`.
- **SIP configs empty** – Verify MediaSFU account permissions at <https://telephony.mediasfu.com>.

## Contributing

1. Create a branch from the repository root: `git checkout -b feature/my-update`.
2. Modify code and update tests under `__tests__/` when practical.
3. Run `npm test`, `npm run lint`, and `npx tsc --noEmit`.
4. Submit a PR summarizing the change and impacted MediaSFU services.

---

Maintained by MediaSFU Engineering. Last updated September 25, 2025.
