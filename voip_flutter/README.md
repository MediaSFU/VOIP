# VOIP Flutter Application

[![Flutter](https://img.shields.io/badge/Flutter-02569B?style=flat&logo=flutter&logoColor=white)](https://flutter.dev)
[![Dart](https://img.shields.io/badge/Dart-0175C2?style=flat&logo=dart&logoColor=white)](https://dart.dev)
[![MediaSFU](https://img.shields.io/badge/Built%20for-MediaSFU-blue)](https://mediasfu.com)

MediaSFU reference client for Flutter showcasing a configurable dialer, MediaSFU room monitoring, and SIP provisioning on iOS, Android, and desktop targets.

> **Agent orchestration superpowers**
>
> - **Agent-only concierge flows** leverage MediaSFU Agents for zero-touch onboarding before humans step in.
> - **One-tap human takeover** mirrors the React Native and web experience via the shared `MediasfuRoomDisplay` widget.
> - **Blended agent + human routing** swaps sources without audio drops, including hold/resume and bot coaching.
> - **Smart audio broadcast controls** let you flip between caller-only prompts and play-to-all announcements mid-call.

## Prebuilt downloads

Start testing instantly with the latest signed artifacts built from this project:

- 🪟 **Windows desktop installer**: [MediaSFU-Setup.exe](https://mediasfu.com/apps/MediaSFU-Setup.exe)
- 🤖 **Android APK (Flutter)**: [mediasfu-voip-flutter.apk](https://mediasfu.com/apps/mediasfu-voip-flutter.apk)

> ℹ️ macOS `.app` bundles and iOS TestFlight links are planned—watch this space as the desktop and iOS release tracks open up.

## Table of contents

- [Overview](#overview)
- [Key features](#key-features)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [MediaSFU flows](#mediasfu-flows)
- [Permissions](#permissions)
- [Build targets](#build-targets)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

## Overview

`CallsPage` is the primary entry point. It mirrors the React client by:

- Managing MediaSFU API credentials through `VoipConfigProvider` (stored with `SharedPreferences`).
- Polling MediaSFU call endpoints via `CallService` with back-off and caching.
- Rendering active calls, room details, and history with timers for live durations.
- Providing dialpad and SIP configuration loading in one screen.

State is coordinated through Provider (`VoipConfigProvider`, `CallManagerProvider`) and room rendering uses `MediasfuRoomDisplay`.

## Key features

- **Dialer** – Pre-populated “+” prefix and ergonomic input with duration presets.
- **MediaSFU room monitor** – Displays the connected room, participant name, and microphone toggle state.
- **Active call polling** – Polls active calls every few seconds, with configurable back-off when rate limited.
- **Call history snapshots** – Maintains a limited list of past calls with status, timestamps, and duration fallback logic.
- **SIP configuration fetch** – Retrieves SIP credentials once API keys are supplied and surfaces error details.
- **Theme toggle** – Users can switch between light and dark themes at runtime with persistence.
- **Desktop-ready layout** – Resize-aware panels suitable for macOS/Windows builds.

The sample currently focuses on audio call orchestration. Video calls, push notifications, and background calling are not implemented.

## Project structure

```text
voip_flutter/
├── lib/
│   ├── pages/
│   │   └── calls_page.dart
│   ├── providers/
│   │   ├── voip_config_provider.dart
│   │   └── call_manager_provider.dart
│   ├── services/
│   │   ├── call_service.dart
│   │   └── config_service.dart
│   ├── types/
│   │   ├── call_types.dart
│   │   ├── api_types.dart
│   │   └── sip_config_types.dart
│   ├── utils/
│   │   └── logger.dart
│   └── widgets/
│       └── mediasfu_room_display.dart
├── assets/
├── android/ | ios/ | windows/ (platform folders)
└── pubspec.yaml
```

## Getting started

### Prerequisites

- Flutter SDK 3.35.4 (or later patch in the 3.35 line)
- Dart 3.4.3+
- Xcode 15+ for iOS builds (macOS)
- Android Studio with SDK 24+ for Android

### Install and run

```bash
flutter --version
flutter pub get
flutter run
```

Use `flutter devices` to select a specific simulator or physical device.

## Configuration

Configuration lives under **Settings → API Configuration** inside the app. Behind the scenes `VoipConfigProvider` persists values via `SharedPreferences`.

| Setting | Purpose | Notes |
| --- | --- | --- |
| API username | MediaSFU account username | Required for call placement |
| API key | MediaSFU API key | Stored locally; clear via “Reset” |
| Base URL | MediaSFU REST endpoint | Defaults to `https://mediasfu.com` |
| Theme | Light or dark | Toggle in Settings or AppBar |

The first successful credential save triggers `loadSipConfig`, which requests SIP configs from MediaSFU (`/v1/sipconfigs/`). Errors (401/403/etc.) are surfaced in the UI.

## MediaSFU flows

1. `CallService.makeCall` posts to the MediaSFU call endpoint using stored credentials.
2. Active calls are cached briefly (`_apiCallCacheTimeout`) to avoid rate limits.
3. `CallManagerProvider` refreshes state on timers and processes room switch events.
4. `MediasfuRoomDisplay` renders current room metadata and microphone state.
5. History is capped through `CallManagerProvider.MAX_HISTORY_RECORDS` to reduce memory usage.

Logging utilities (`Logger.info/error`) mirror the React client to keep diagnostics consistent across platforms.

## Permissions

### Android

Declared in `android/app/src/main/AndroidManifest.xml`:

| Permission | Purpose |
|------------|---------|
| `INTERNET` | MediaSFU API + signaling |
| `CAMERA` | Reserved for future video support (currently unused) |
| `RECORD_AUDIO` | Capture microphone for VOIP calls |
| `ACCESS_NETWORK_STATE` | Detect connectivity changes for polling back-off |
| `CHANGE_NETWORK_STATE` | Allow network adjustments if needed by plugins |
| `MODIFY_AUDIO_SETTINGS` | Control audio routing and gain for call quality |
| `BLUETOOTH` / `BLUETOOTH_ADMIN` (<= API 30) | Legacy classic Bluetooth audio routing |
| `BLUETOOTH_CONNECT` | Required for managing Bluetooth headsets (API 31+) |

Optional you may add later depending on features:

| Potential Permission | When Needed |
|----------------------|------------|
| `POST_NOTIFICATIONS` | In-app/push call alerts (Android 13+) |
| `FOREGROUND_SERVICE` (+ media type) | Background ongoing call service |
| `WAKE_LOCK` | Prevent device sleep during active call |

### iOS

Added to `ios/Runner/Info.plist`:

| Key | Purpose |
|-----|---------|
| `NSMicrophoneUsageDescription` | Microphone access for VOIP calling |
| `NSCameraUsageDescription` | Placeholder for future video/media features |

(If adding CallKit or push notifications later include `NSBluetoothAlwaysUsageDescription`, `NSUserNotificationUsageDescription`, and configure VoIP push entitlements.)

## Build targets

| Target | Command | Output |
| --- | --- | --- |
| Android APK | `flutter build apk --release` | `build/app/outputs/flutter-apk/app-release.apk` |
| Android App Bundle | `flutter build appbundle --release` | `build/app/outputs/bundle/release/app-release.aab` |
| iOS | `flutter build ios --release` (then archive in Xcode) | Runner archive |
| Windows | `flutter build windows --release` | `build/windows/runner/Release` |
| macOS | `flutter build macos --release` | `build/macos/Build/Products/Release` |

Before releasing, update icons via `flutter pub run flutter_launcher_icons:main` if brand assets change.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| “Authentication failed” toast | Invalid username or API key | Re-enter credentials, verify on <https://mediasfu.com/telephony> |
| SIP configs never load | Permissions missing on MediaSFU tenant | Confirm account has SIP provisioning rights |
| Calls remain in dialing | MediaSFU tenant not enabled for outbound | Contact MediaSFU support |
| Frequent polling errors | Network instability or rate limit | Allow the built-in back-off to reset, or increase interval |

Run `flutter doctor` to ensure your environment is correctly configured.

## Contributing

1. Clone the mono-repo and install dependencies: `flutter pub get`.
2. Create a feature branch from `main`.
3. Follow Dart style (`flutter format`, `flutter analyze`).
4. Add or update tests in `test/` where feasible.
5. Submit a pull request summarizing the change and impacted MediaSFU APIs.

---

Maintained by MediaSFU Engineering. Last updated September 25, 2025.
