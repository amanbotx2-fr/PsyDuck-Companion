# Ducky

![Ducky](assets/icons/icon.png)

**Ducky is a tiny, privacy-conscious desktop AI companion for focused work and lightweight personal assistance.**

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Platforms](https://img.shields.io/badge/platforms-macOS%20%7C%20Windows%20%7C%20Linux-informational)
![License](https://img.shields.io/badge/license-MIT-green)

## Screenshots

The screenshots below were captured from the running Ducky desktop companion using a clean v1.0.0 development workspace.

### Desktop companion

![Ducky desktop companion](docs/images/hero.png)

### AI conversation and focus timer

![AI conversation](docs/images/chat.png)
![Pomodoro timer](docs/images/pomodoro.png)

### Preferences and planning

![Preferences](docs/images/preferences.png)
![Daily Planner](docs/images/planner.png)

### Personal workspace

![Sticky message](docs/images/sticky-notes.png)
![Reminder manager](docs/images/reminders.png)

### About

![About Ducky](docs/images/about.png)

The model explorer screenshot is captured separately when a provider with discoverable models is configured; no credentials or private provider data are included in repository screenshots.

## Features

- Desktop companion with idle animation, eye tracking, and drag interaction
- Multi-provider AI: OpenAI, Gemini, Grok, Ollama, and OpenAI-compatible endpoints such as OpenRouter
- Smart one-time and recurring reminders with a daily planner
- Persistent sticky message and Pomodoro focus timer
- Searchable AI Model Explorer with favorites and recent models
- Native tray, preferences, Spaces support, and always-on-top desktop behavior
- Automatic update foundation and cross-platform packaging

## Installation

Download the v1.0.0 artifact for your platform from the GitHub Releases page.

- **macOS:** open the `.dmg`, then drag Ducky to Applications.
- **Windows:** run the Setup installer (or install the MSI package).
- **Linux:** run the AppImage directly or install the `.deb` package.

## AI providers

OpenAI, Gemini, and Grok require credentials from their respective providers. Ollama runs locally and uses the Ollama daemon at `http://localhost:11434` by default; no cloud API key is required. Custom OpenAI-compatible endpoints support services such as OpenRouter, LM Studio, vLLM, LiteLLM, and LocalAI.

Credentials remain in the main process and are stored using Electron's secure storage when available.

## Build from source

Requirements: Node.js 22.12 or newer and npm 10 or newer.

```bash
npm install
npm run dev
```

Create a production build and platform installer with:

```bash
npm run build
npm run dist
```

## Project structure

`src/main` contains Electron lifecycle, windows, IPC, persistence, and services. `src/renderer` contains the companion and Preferences React applications. `src/ai` contains provider abstractions and integrations. `src/engine` contains animation, behavior, input, and scheduling primitives. `src/shared` contains typed contracts shared across processes. `character` contains source art and animation frames; `assets/icons` contains application branding.

## Technology

Electron, React, TypeScript, Vite, Electron Builder, and Node.js. The renderer uses native browser APIs and CSS for UI motion; no external UI framework is required.

## License

Ducky is released under the [MIT License](LICENSE).

## Release notes

See [`RELEASE_NOTES_v1.0.0.md`](RELEASE_NOTES_v1.0.0.md) for the v1.0.0 release summary.
