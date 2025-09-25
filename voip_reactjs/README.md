# VOIP React.js Web Application

[![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![MediaSFU](https://img.shields.io/badge/Built%20for-MediaSFU-blue)](https://mediasfu.com)

Reference implementation of the MediaSFU web dialer using React.js and TypeScript. This client demonstrates how to orchestrate outbound calls, manage MediaSFU room sessions, and inspect call history from a browser.

## Table of contents

- [Overview](#overview)
- [Key features](#key-features)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Phone validation](#phone-validation)
- [MediaSFU workflow](#mediasfu-workflow)
- [Development tasks](#development-tasks)
- [Build and deploy](#build-and-deploy)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

## Overview

The web client is grounded in functional React components and hooks. Core responsibilities include:

- Rendering a configurable dialer UI with libphonenumber-js formatting helpers.
- Managing MediaSFU REST calls through `callService.ts`.
- Displaying active call state and an in-memory call history.
- Persisting operator preferences (API credentials, refresh cadence) to local storage.

All data flows are centered around `CallsPage.tsx`, which composes the dialpad, active call list, upcoming call queue, and call history. Supporting hooks (`useCallManager`, `useVoipConfig`, `useLiveUpdates`) coordinate polling, validation, and state persistence.

## Key features

- **Dialer with validation** – Real-time E.164 formatting, validation feedback, and quick-dial buttons.
- **MediaSFU call orchestration** – Creates outbound calls, monitors status, and provides manual hang-up controls.
- **Active call dashboard** – Visualizes ringing, connected, and completed calls with minimal polling.
- **Call history list** – Stores up to 50 historical items locally with filtering by direction.
- **Mock mode** – Optional simulated data for demos without hitting MediaSFU endpoints.
- **Configurable refresh** – Operators can tune the active-call polling interval or disable it entirely.
- **Settings persistence** – API keys, usernames, base URLs, and UI preferences persist between sessions.

The current build is audio-first. Video, screen sharing, call transfer, multi-line bridging, and server-side recording are not implemented in this reference client.

## Project structure

```text
voip_reactjs/
├── public/
│   └── index.html
├── src/
│   ├── components/
│   │   ├── Calls/
│   │   │   └── CallsPage.tsx
│   │   ├── Dashboard/
│   │   │   └── Dashboard.tsx
│   │   ├── History/
│   │   │   └── CallHistoryPage.tsx
│   │   └── Settings/
│   │       └── SettingsPage.tsx
│   ├── hooks/
│   │   ├── useCallManager.ts
│   │   ├── useLiveUpdates.ts
│   │   └── useVoipConfig.ts
│   ├── services/
│   │   ├── callService.ts
│   │   ├── configService.ts
│   │   ├── httpClient.ts
│   │   └── mediaSFUService.ts
│   ├── types/
│   │   ├── api.types.ts
│   │   ├── call.types.ts
│   │   └── config.types.ts
│   ├── App.tsx
│   └── index.tsx
├── package.json
└── README.md
```

## Getting started

### Prerequisites

- Node.js 18+
- npm (bundled with Node) or Yarn

### Install and run

```bash
git clone https://github.com/MediaSFU/VOIP.git
cd VOIP/voip_reactjs
npm install
npm start
```

Open <http://localhost:3000> to load the dashboard.

## Configuration

Settings live under `SettingsPage.tsx` and persist via `configService.ts`.

| Setting | Description | Default |
| --- | --- | --- |
| API base URL | MediaSFU REST endpoint | `https://mediasfu.com` |
| API username | Operator username | Empty |
| API key | MediaSFU API key | Empty |
| Enable live updates | Controls active-call polling | Enabled |
| Update interval | Seconds between polls (5–60) | 5 |
| Mock mode | Toggle simulated data | Disabled |

Use the **Test Connection** action in the UI to verify credentials before placing calls.

Environment variables can pre-seed defaults:

```env
REACT_APP_API_BASE_URL=https://telephony.mediasfu.com
REACT_APP_MEDIASFU_API_KEY=
REACT_APP_DEFAULT_USERNAME=
```

## Phone validation

- Implemented via `libphonenumber-js`.
- Accepts E.164, national, and formatted inputs; normalizes to E.164 before API submission.
- The dialpad honours the configured default country (derived from browser locale or manual selection).
- Validation errors prevent calls from being submitted and surface contextual messages next to the input.

## MediaSFU workflow

1. `callService.makeCall` composes the payload and posts to `/voip/make-call`.
2. The response is stored in local state and the active-call grid updates immediately.
3. `useLiveUpdates` polls `callService.getActiveCalls` based on the configured interval.
4. Historical entries are appended via `callService.getCallHistory` (limited to 50 by `MAX_HISTORY_RECORDS`).
5. Operators can manually end calls through `callService.hangupCall`.

Media events are logged to the browser console to aid debugging. The implementation assumes the MediaSFU account is configured for audio calls; SIP trunking and advanced media routing are outside the scope of this sample.

## Development tasks

- `npm test` – Executes the unit tests (currently minimal placeholders).
- `npm run lint` – Runs ESLint using the workspace defaults.
- `npm run build` – Produces production assets in `build/`.
- `npm run format` – Applies Prettier formatting (if configured globally).

## Build and deploy

```bash
npm run build
```

Deploy the generated `build/` folder to your preferred static host (Vercel, Netlify, S3, etc.). Ensure HTTPS is enabled so browsers grant microphone access.

Production checklist:

- Disable mock mode.
- Supply non-empty MediaSFU credentials.
- Configure a secure `REACT_APP_API_BASE_URL`.
- Confirm CORS settings on your MediaSFU tenant allow the deployed origin.

## Troubleshooting

| Issue | Likely cause | Resolution |
| --- | --- | --- |
| “API test failed” | Invalid credentials or unreachable endpoint | Re-enter the API key, confirm base URL, inspect browser console |
| Calls stay in “dialing” | MediaSFU tenant not configured for outbound calls | Confirm the tenant status on <https://telephony.mediasfu.com> |
| Polling stops updating | Update interval disabled or network error | Re-enable live updates, check console for fetch errors |
| Validation blocks dialing | Input not E.164 valid | Adjust country code or number format |

Enable additional logging with:

```javascript
localStorage.setItem('voip_debug', 'true');
```

## Contributing

1. Fork the repo and create a branch: `git checkout -b feature/my-update`.
2. Make changes, updating or adding tests when possible.
3. Run `npm test` and `npm run lint` to validate.
4. Open a pull request describing the change and MediaSFU APIs touched.

## Support

- MediaSFU platform docs: <https://mediasfu.com/docs>
- Telephony portal: <https://telephony.mediasfu.com>
- Report issues: use the GitHub issue tracker in this repository.

---

Built and maintained by MediaSFU Engineering.
