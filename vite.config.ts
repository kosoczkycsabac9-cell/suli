import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // A live preview proxy (e2b.app) hosztjának engedélyezése
    allowedHosts: true,
    hmr: { clientPort: 443 },
  },
  build: { outDir: 'dist', emptyOutDir: true, target: 'chrome120' },
});
