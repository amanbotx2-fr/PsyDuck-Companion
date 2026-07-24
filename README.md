# Ducky

Electron, React, TypeScript, and Vite foundation for the Ducky desktop companion.

## Requirements

- Node.js 22.12 or newer
- npm 10 or newer

## Development

```bash
npm install
npm run dev
```

The Vite renderer runs with hot module replacement. TypeScript recompiles the Electron main and preload processes, and Electron restarts when either output changes.

## Build

```bash
npm run build
```

Compiled main, preload, shared, and renderer output is written to `dist/`.

## Package

```bash
npm run dist
```

Electron Builder writes platform artifacts to `release/`.
