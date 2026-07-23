/// <reference types="vite/client" />

import type {
  CompanionBridge,
  PreferencesBridge,
} from '../shared/types';

declare global {
  interface Window {
    readonly psyduck?: CompanionBridge;
    readonly psyduckPreferences?: PreferencesBridge;
  }
}

export {};
