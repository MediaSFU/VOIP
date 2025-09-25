# 🖥️ VOIP Angular Desktop (Coming Soon)

[![Angular](https://img.shields.io/badge/Angular-DD0031?style=flat&logo=angular&logoColor=white)](https://angular.io)
[![Electron](https://img.shields.io/badge/Electron-2B2E3A?style=flat&logo=electron&logoColor=9FEAF9)](https://www.electronjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Desktop](https://img.shields.io/badge/Desktop-Windows%20|%20macOS%20|%20Linux-blue)](https://desktop.github.com)
[![MediaSFU](https://img.shields.io/badge/Powered%20by-MediaSFU-blue)](https://mediasfu.com)

> **Professional VOIP Communication powered by [MediaSFU](https://mediasfu.com)**  
> Native desktop-focused implementation (Electron + Angular). Feature parity target with existing React.js web client.  
> **Status**: Planned – Target Release **Q4 2025**

## 📌 Current State

Development has **not started yet**. This directory is a placeholder.

## 🎯 Goal

Provide a desktop-focused wrapper and UX for the existing feature set already implemented in the React.js web client (calls, validation, media handling, session control) using Electron + Angular.

## 🔄 Reference Implementation

Use the React.js web version as the authoritative feature and flow reference:

- React.js App: `../voip_reactjs/README.md`
- Feature parity target: Core call flows, phone validation, session management, MediaSFU integration hooks.

## 🗂️ Planned Minimal Milestones

1. Scaffold Angular + Electron project
2. Port call/session UI + state management (mirroring React hooks/services)
3. Integrate MediaSFU SDK + validation logic
4. Implement basic packaging (Windows first, then macOS/Linux)
5. Harden + release initial beta (Q4 2025 window)

## 🤝 Contribution

Not accepting feature PRs yet. You may open issues to propose:

- API alignment questions
- Electron packaging considerations
- Cross-platform edge cases

## ✅ What To Use Today

Use the production **React.js Web Client** (can be installed as a PWA) until this is ready.

## 🔗 Quick Links

- Main Project Overview: `../README.md`
- React.js Reference: `../voip_reactjs/`
- MediaSFU: <https://mediasfu.com>

---

**License**: MIT