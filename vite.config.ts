import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' sorgt dafür, dass dieselbe Version auf GitHub Pages (Unterordner)
// und in der Android-App (https://localhost) funktioniert.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
  },
});
