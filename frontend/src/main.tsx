import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.tsx';
import { initWebVitals } from './lib/webVitals.ts';
import './fonts.css';
import './index.css';

const root = document.getElementById('root');

if (!root) throw new Error('Missing root element');

initWebVitals();

createRoot(root).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
