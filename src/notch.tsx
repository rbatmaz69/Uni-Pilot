/**
 * The notch window's page (`notch.html`, `src-tauri/src/notch.rs`): face
 * unlock's island under the MacBook's camera housing. A page of its own, so
 * the window loads nothing of the app but the island.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/instrument-sans';
import '@/styles/globals.css';
import { NotchIsland } from '@/features/auto-sign-in';

const container = document.getElementById('notch');
if (!container) throw new Error('Notch element #notch not found');

createRoot(container).render(
  <StrictMode>
    <NotchIsland />
  </StrictMode>,
);
