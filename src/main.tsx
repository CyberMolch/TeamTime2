import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts';
import './styles.css';
import { App } from './App';
import { StoreProvider } from './data/store';
import { DialogProvider } from './components/ui';
import { setupKeyboardAvoidance } from './lib/native';

setupKeyboardAvoidance();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <DialogProvider>
        <App />
      </DialogProvider>
    </StoreProvider>
  </StrictMode>,
);
