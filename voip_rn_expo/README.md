# 📱 VOIP React Native Expo Application

[![Expo](https://img.shields.io/badge/Expo-000020?style=flat&logo=expo&logoColor=white)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React_Native-20232A?style=flat&logo=react&logoColor=61DAFB)](https://reactnative.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![MediaSFU](https://img.shields.io/badge/Powered%20by-MediaSFU-blue)](https://mediasfu.com)
[![PWA](https://img.shields.io/badge/PWA-5A0FC8?style=flat&logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps)

> **Professional VOIP Communication powered by [MediaSFU](https://mediasfu.com)**  
> Cross-platform Expo application supporting iOS, Android, and Progressive Web App deployment with unified development workflow and over-the-air updates.

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [MediaSFU Integration](#mediasfu-integration)
- [Phone Validation](#phone-validation)
- [Development Workflow](#development-workflow)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [Resources](#resources)

## 🎯 Overview

Cross-platform VOIP application built with Expo SDK 52 and file-based routing. Provides unified calling experience across iOS, Android, and web platforms using MediaSFU's professional communication infrastructure.

### 🚀 Expo-Powered Development

- **Universal Platform**: Single codebase for iOS, Android, and Web (PWA)
- **Hot Reloading**: Instant updates during development across all platforms
- **Over-the-Air Updates**: Push updates without app store approval
- **Expo Dev Build**: Custom native builds with full control
- **Web Support**: Progressive Web App capabilities with native-like experience

### 🎤 Advanced Communication Features

- **Professional VoIP Calling**: Make and receive calls using MediaSFU SDK
- **Multi-Platform Calling**: Seamless calling experience across mobile and web
- **Call Management**: Hold, mute, transfer, and manage active calls
- **Call History**: Comprehensive call logs with search and filtering
- **Real-time Updates**: Live call status and participant management
- **Push Notifications**: Cross-platform notification system

## ✨ Key Features

### 📱 Progressive Web App (PWA)

- **Installable**: Add to home screen on mobile and desktop
- **Offline Capability**: Basic functionality without internet connection
- **Web Push**: Receive call notifications in web browsers
- **Responsive Design**: Optimized for all screen sizes and orientations
- **Native-like Performance**: Smooth animations and interactions

### 🔧 Professional Phone Validation

- **libphonenumber-js Integration**: Industry-standard phone number validation
- **E.164 Format Support**: International phone number formatting
- **AsYouType Formatter**: Real-time phone number formatting
- **Cross-Platform Consistency**: Unified validation across all platforms
- **Visual Feedback**: Real-time validation indicators

## 🛠️ Technology Stack

### Core Technologies

- **Expo**: 52+ (Universal React Native platform)
- **React Native**: 0.76+ (Cross-platform mobile framework)
- **Expo Router**: File-based navigation system
- **TypeScript**: Type-safe development environment
- **MediaSFU SDK**: Professional communication infrastructure

### Key Dependencies

```json
{
  "dependencies": {
    "expo": "~52.0.0",
    "react-native": "0.76.3",
    "@expo/router": "~4.0.0",
    "libphonenumber-js": "^1.11.0",
    "@react-native-async-storage/async-storage": "~2.1.0",
    "react-native-webrtc": "^124.0.4"
  }
}
```

### Platform Support

- **iOS**: iOS 13.0+ (App Store & TestFlight)
- **Android**: API Level 24+ (Google Play Store)  
- **Web**: Modern browsers (Chrome, Firefox, Safari, Edge)
- **PWA**: Progressive Web App capabilities on all platforms

## 📁 Project Structure

```
voip_rn_expo/
├── app/                        # Expo Router navigation structure
│   ├── (tabs)/                # Tab-based navigation
│   │   ├── index.tsx          # Dashboard screen
│   │   ├── calls.tsx          # Calls management screen
│   │   ├── history.tsx        # Call history screen
│   │   └── settings.tsx       # Configuration screen
│   ├── _layout.tsx            # Root application layout
│   └── +html.tsx              # Web-specific HTML configuration
├── src/                       # Application source code
│   ├── components/            # Reusable React Native components
│   │   ├── Dashboard/         # Dashboard-specific components
│   │   ├── Calls/             # Call management components
│   │   └── Common/            # Shared UI components
│   ├── hooks/                 # Custom React hooks
│   │   ├── useVoipConfig.ts   # Configuration management
│   │   ├── useCallManager.ts  # Call state management
│   │   └── useLiveUpdates.ts  # Real-time updates
│   ├── services/              # Business logic and API services
│   │   ├── callService.ts     # Call management service
│   │   ├── mediaSFUService.ts # MediaSFU integration
│   │   └── configService.ts   # Configuration service
│   ├── types/                 # TypeScript type definitions
│   │   ├── call.ts           # Call-related types
│   │   ├── api.ts            # API response types
│   │   └── ui.ts             # UI state types
│   └── utils/                 # Utility functions
│       ├── validation.ts      # Input validation
│       ├── formatting.ts     # Data formatting
│       └── constants.ts       # App constants
├── assets/                    # Static assets
│   ├── images/               # App images and icons
│   └── fonts/                # Custom fonts
├── expo-env.d.ts             # Expo TypeScript definitions
├── app.json                  # Expo configuration
├── package.json              # Dependencies and scripts
└── tsconfig.json             # TypeScript configuration
```

## 🚀 Getting Started

### Prerequisites

- **Node.js**: Version 18+ required
- **Expo CLI**: Install with `npm install -g @expo/cli`
- **iOS Simulator**: For iOS development (macOS only)
- **Android Studio/Emulator**: For Android development

### Installation

1. **Clone the repository**:

```bash
git clone https://github.com/MediaSFU/VOIP.git
cd VOIP/voip_rn_expo
```

2. **Install dependencies**:

```bash
npm install
```

3. **Start the development server**:

```bash
npx expo start
```

4. **Run on platforms**:

```bash
# iOS Simulator
npx expo run:ios

# Android Emulator  
npx expo run:android

# Web browser
npx expo start --web
```

## ⚙️ Configuration

### MediaSFU API Setup

1. **Get MediaSFU credentials**:
   - Visit [MediaSFU Dashboard](https://mediasfu.com)
   - Create an account or sign in
   - Generate API keys for your application

2. **Configure the app**:
   - Go to the Settings tab in the app
   - Enter your MediaSFU credentials:
     - **API Key**: Your MediaSFU API key
     - **API Username**: Your MediaSFU username  
     - **Base URL**: Usually `https://mediasfu.com`

### Development Configuration

The app uses AsyncStorage for configuration persistence:

- **API Configuration**: MediaSFU credentials and endpoints
- **Real-time Settings**: Live update intervals and enablement
- **UI Preferences**: Theme, compact mode settings
- **Call Settings**: Auto-answer, recording, ring time preferences

## 🔄 MediaSFU Integration

### Core MediaSFU Services

Built on MediaSFU's robust communication infrastructure:

- **🌐 MediaSFU Website**: [mediasfu.com](https://mediasfu.com)
- **📞 Telephony Documentation**: [telephony.mediasfu.com](https://telephony.mediasfu.com)
- **🤖 AI Agents Platform**: [agents.mediasfu.com](https://agents.mediasfu.com)

### API Integration Workflow

1. **Initialize MediaSFU Client**: Configure authentication and endpoints
2. **Create Communication Room**: Set up temporary room for call management
3. **Manage Call State**: Handle active calls, participants, and real-time updates
4. **Process Call Events**: Real-time polling for call status changes
5. **Cleanup Resources**: Proper room and connection cleanup after calls

### Real-time Features

- **Live Call Updates**: Continuous polling for call status changes
- **Participant Management**: Real-time participant join/leave notifications
- **Call Quality Monitoring**: Network and audio quality indicators
- **Event Synchronization**: Cross-platform event synchronization

## 📞 Phone Validation

### libphonenumber-js Integration

Professional phone number validation using Google's libphonenumber:

```typescript
import { parsePhoneNumber, AsYouType } from 'libphonenumber-js';

// Validate and format phone numbers
const phoneNumber = parsePhoneNumber('+1234567890');
if (phoneNumber?.isValid()) {
  const e164 = phoneNumber.format('E.164'); // +1234567890
  const international = phoneNumber.formatInternational(); // +1 234 567 890
}

// Real-time formatting
const formatter = new AsYouType('US');
formatter.input('2345678900'); // (234) 567-8900
```

### Validation Features

- **E.164 Compliance**: International standard phone number format
- **Regional Support**: Country-specific validation and formatting
- **Real-time Feedback**: Visual validation indicators during input
- **Cross-platform Consistency**: Unified validation across all platforms

## 🔧 Development Workflow

### Platform Differences from React.js Version

| Feature | React.js Web | Expo React Native |
|---------|-------------|-------------------|
| **Storage** | localStorage | AsyncStorage |
| **Navigation** | React Router DOM | Expo Router with tabs |
| **UI Components** | HTML/CSS | React Native components |
| **MediaSFU SDK** | `mediasfu-reactjs` | `mediasfu-reactnative-expo` |
| **HTTP Client** | Axios with localStorage | Axios with AsyncStorage |

### Key Services

#### ConfigService

Manages application configuration with AsyncStorage persistence:

- Async initialization for React Native compatibility
- Configuration subscription/notification system
- Backward compatibility with existing credential formats

#### HttpClient

HTTP client with MediaSFU authentication:

- Automatic Bearer token injection from AsyncStorage
- Error handling and credential management
- Compatible with MediaSFU API endpoints

#### Custom Hooks

React hooks for state management:

- `useVoipConfig`: Configuration management with async loading
- `useCallManager`: Call state and lifecycle management
- `useLiveUpdates`: Real-time polling and updates

## 🚀 Deployment

### Progressive Web App (PWA)

Build and deploy as PWA for web platforms:

```bash
# Build web version
npx expo export --platform web

# Deploy to hosting service
# (Netlify, Vercel, Firebase Hosting, etc.)
```

### Mobile App Builds

#### Development Builds

```bash
# Create development build
npx expo install --fix
npx expo run:ios --device
npx expo run:android --device
```

#### Production Builds

```bash
# Configure app.json for production
# Build for app stores
eas build --platform ios
eas build --platform android
```

### Over-the-Air Updates

```bash
# Publish OTA update
eas update --branch production --message "Bug fixes and improvements"
```

## 🤝 Contributing

We welcome contributions to improve the VOIP Expo application!

### Development Guidelines

1. **Follow TypeScript**: Maintain type safety throughout
2. **Consistent Architecture**: Follow existing patterns and structure
3. **Cross-platform**: Ensure features work on iOS, Android, and Web
4. **MediaSFU Integration**: Follow MediaSFU best practices and guidelines
5. **Testing**: Write tests for new features and bug fixes

### Getting Started with Development

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes and test thoroughly
4. Commit changes: `git commit -m 'Add some feature'`
5. Push to branch: `git push origin feature/your-feature`
6. Submit a Pull Request

## 📚 Resources

### MediaSFU Documentation

- **🌐 Main Website**: [mediasfu.com](https://mediasfu.com) - MediaSFU platform overview
- **📞 Telephony Docs**: [telephony.mediasfu.com](https://telephony.mediasfu.com) - VOIP integration guides
- **🤖 AI Agents**: [agents.mediasfu.com](https://agents.mediasfu.com) - AI-powered communication agents

### Development Resources

- **📱 Expo Documentation**: [docs.expo.dev](https://docs.expo.dev)
- **⚛️ React Native**: [reactnative.dev](https://reactnative.dev)
- **📞 libphonenumber-js**: [github.com/catamphetamine/libphonenumber-js](https://github.com/catamphetamine/libphonenumber-js)

### Related Projects

This project is part of the comprehensive VOIP communication ecosystem:

| Platform | Status | Best For | Documentation |
|----------|--------|----------|---------------|
| **Web (React.js)** | ✅ Production | Desktop browsers, PWA | [Web Docs](../voip_reactjs/README.md) |
| **Mobile (Flutter)** | ✅ Production | iOS/Android native | [Flutter Docs](../voip_flutter/README.md) |
| **Mobile (React Native CLI)** | ✅ Production | Native mobile development | [RN Docs](../voip_rn/README.md) |
| **PWA/Mobile (Expo)** | ✅ Production | Cross-platform, PWA | This document |

---

**Built with ❤️ using [MediaSFU](https://mediasfu.com)**  
**License**: MIT  
**Platform Support**: iOS 13+, Android API 24+, Modern Web Browsers