# LAST_STRETCH_TASKS.md

# Ducky — Last Stretch Before v1.0

## Purpose

The application is now feature complete.

The remaining work is focused entirely on preparing **Ducky** for its first public release.

No new user-facing features should be introduced unless they are required for branding, packaging, distribution, or release readiness.

---

# REL-001 — Application Branding

## Goal

Replace all development branding with the final **Ducky** branding.

### Objectives

- Design the final Ducky application icon.
- Generate platform-specific application icons.
- Configure Electron to use the new icons.
- Replace the default Electron branding everywhere.
- Rename the application from **PsyDuck** to **Ducky** across the project.
- Update bundle identifiers.
- Configure version metadata.
- Create a polished About window.
- Verify the application icon appears correctly on:
  - macOS Dock
  - macOS Applications
  - Windows Taskbar
  - Windows Start Menu
  - Linux Launcher

### Deliverables

```
assets/

icon.png
icon.icns
icon.ico
```

### Validation

- Electron branding completely removed.
- Application appears as **Ducky** everywhere.
- Icons render correctly on every supported platform.

---

# REL-002 — Packaging & Distribution

## Goal

Generate production-ready installers for every supported platform.

### Windows

Produce:

- Ducky Setup.exe
- Ducky MSI Installer

### macOS

Produce:

- Ducky.dmg

### Linux

Produce:

- AppImage
- DEB
- RPM (optional)

### Configure

- Electron Builder
- Versioning
- Build metadata
- Release configuration
- Installer assets

### Verify

Windows:

- Install
- Launch
- Uninstall
- Desktop shortcut
- Start Menu entry

macOS:

- Drag into Applications
- Launch successfully
- Dock icon
- Menu bar integration

Linux:

- AppImage launches correctly
- DEB installs correctly

---

# REL-003 — Auto Update Foundation

## Goal

Prepare Ducky for seamless future updates.

### Configure

- electron-updater
- GitHub Releases
- Version feed
- Update channel

Only establish the update architecture.

Do not implement production release automation yet.

---

# REL-004 — Release Validation

## Goal

Perform the final production-quality verification before launch.

### Verify

- Installation
- Settings persistence
- AI Providers
- Reminder System
- Planner
- Sticky Notes
- Pomodoro
- AI Model Explorer
- Speech Bubble
- Animations
- Branding
- Icons
- Packaging
- Startup experience

Resolve every release-blocking issue before shipping.

---

# REL-005 — Ducky v1.0 Release

## Deliverables

- Final production build
- Windows Installer
- macOS DMG
- Linux AppImage
- GitHub Release
- Release Notes
- Version 1.0.0

🚀 Ship Ducky.