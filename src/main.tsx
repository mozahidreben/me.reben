import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

if ('serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onOfflineReady() {
      // All app assets & 25 offline guide voice clips are cached for zero-internet use
    },
  });
}

createRoot(document.getElementById('root')!).render(<App />);
