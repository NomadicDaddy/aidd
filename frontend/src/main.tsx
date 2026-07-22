import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.tsx';
import { initWebVitals } from './lib/webVitals.ts';
import '@fontsource-variable/space-grotesk/index.css';

import './fonts.css';
import './index.css';

const root = document.getElementById('root');

if (!root) throw new Error('Missing root element');

initWebVitals();

createRoot(root).render(
	<StrictMode>
		<App />
	</StrictMode>
);
