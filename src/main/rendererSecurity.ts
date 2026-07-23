import { app, type BrowserWindow } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { RENDERER_DEV_URL_ENV } from '../shared/constants';

const DEVELOPMENT_RENDERER_PORT = '5187';
const DEVELOPMENT_RENDERER_HOSTS = new Set(['127.0.0.1', 'localhost']);

const RENDERER_PAGES = {
  companion: {
    bundledFileName: 'index.html',
    developmentPath: '/',
  },
  preferences: {
    bundledFileName: 'preferences.html',
    developmentPath: '/preferences.html',
  },
} as const;
const expectedRendererUrls = new WeakMap<BrowserWindow, string>();

export type RendererPage = keyof typeof RENDERER_PAGES;

type DevelopmentUrlValidation =
  | {
      readonly valid: true;
      readonly url: URL;
    }
  | {
      readonly valid: false;
      readonly reason: string;
    };

export type RendererLocation =
  | {
      readonly type: 'file';
      readonly target: string;
      readonly rejectedDevelopmentUrlReason?: string;
    }
  | {
      readonly type: 'url';
      readonly target: string;
      readonly rejectedDevelopmentUrlReason?: never;
    };

export const validateDevelopmentRendererUrl = (
  candidate: string,
): DevelopmentUrlValidation => {
  if (candidate.length === 0 || candidate !== candidate.trim()) {
    return { valid: false, reason: 'the URL is empty or contains whitespace' };
  }

  let url: URL;

  try {
    url = new URL(candidate);
  } catch {
    return { valid: false, reason: 'the URL is malformed' };
  }

  if (url.protocol !== 'http:') {
    return { valid: false, reason: 'only the HTTP protocol is allowed' };
  }

  if (!DEVELOPMENT_RENDERER_HOSTS.has(url.hostname)) {
    return {
      valid: false,
      reason: 'the hostname is not an allowed loopback host',
    };
  }

  if (url.port !== DEVELOPMENT_RENDERER_PORT) {
    return {
      valid: false,
      reason: 'the port does not match the development server',
    };
  }

  if (url.username.length > 0 || url.password.length > 0) {
    return { valid: false, reason: 'credentials are not allowed' };
  }

  if (url.search.length > 0 || candidate.includes('?')) {
    return { valid: false, reason: 'query parameters are not allowed' };
  }

  if (url.hash.length > 0 || candidate.includes('#')) {
    return { valid: false, reason: 'fragments are not allowed' };
  }

  if (url.pathname !== '/') {
    return { valid: false, reason: 'the path is not allowed' };
  }

  // Accept only canonical origin forms so URL normalization cannot hide
  // alternate paths, separators, or authority syntax.
  if (candidate !== url.origin && candidate !== `${url.origin}/`) {
    return { valid: false, reason: 'the URL is not in canonical origin form' };
  }

  return { valid: true, url };
};

export const resolveRendererLocation = (
  page: RendererPage,
  isPackaged: boolean,
  developmentUrl: string | undefined,
): RendererLocation => {
  const pageConfiguration = RENDERER_PAGES[page];
  const bundledTarget = join(
    __dirname,
    '../renderer',
    pageConfiguration.bundledFileName,
  );

  if (isPackaged || developmentUrl === undefined) {
    return { type: 'file', target: bundledTarget };
  }

  const validation = validateDevelopmentRendererUrl(developmentUrl);

  if (!validation.valid) {
    return {
      type: 'file',
      target: bundledTarget,
      rejectedDevelopmentUrlReason: validation.reason,
    };
  }

  return {
    type: 'url',
    target: new URL(
      pageConfiguration.developmentPath,
      validation.url,
    ).toString(),
  };
};

export const hardenRendererNavigation = (
  browserWindow: BrowserWindow,
): void => {
  browserWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  browserWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  browserWindow.webContents.on('will-redirect', (event) => {
    event.preventDefault();
  });
};

const getRendererLocationUrl = (location: RendererLocation): string =>
  location.type === 'url'
    ? location.target
    : pathToFileURL(location.target).toString();

export const getExpectedRendererUrl = (
  browserWindow: BrowserWindow,
): string | null => expectedRendererUrls.get(browserWindow) ?? null;

export const loadRenderer = (
  browserWindow: BrowserWindow,
  page: RendererPage,
): void => {
  const isPackaged = app.isPackaged;

  // Packaged builds do not read the development environment variable.
  const developmentUrl = isPackaged
    ? undefined
    : process.env[RENDERER_DEV_URL_ENV];
  const location = resolveRendererLocation(page, isPackaged, developmentUrl);
  // Pin IPC authorization to the exact page selected for this window load.
  expectedRendererUrls.set(
    browserWindow,
    getRendererLocationUrl(location),
  );

  if (location.rejectedDevelopmentUrlReason !== undefined) {
    console.warn(
      `[security] Rejected ${RENDERER_DEV_URL_ENV}: ` +
        `${location.rejectedDevelopmentUrlReason}. Loading the bundled renderer.`,
    );
  }

  const loadOperation =
    location.type === 'url'
      ? browserWindow.loadURL(location.target)
      : browserWindow.loadFile(location.target);

  void loadOperation.catch((error: unknown) => {
    console.error('[security] Renderer load failed.', error);
  });
};
