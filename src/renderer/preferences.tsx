import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { PreferencesApp } from './PreferencesApp';
import './styles/preferences.css';

const rootElement = document.getElementById('root');

if (rootElement === null) {
  throw new Error('Preferences root element was not found.');
}

createRoot(rootElement).render(
  <StrictMode>
    <PreferencesApp />
  </StrictMode>,
);
