import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  // Only scan the real entry: android/ and ios/ hold copied web bundles after `cap sync`.
  optimizeDeps: { entries: ['index.html'] },
  server: { port: Number(process.env.VITE_PORT ?? 5173), strictPort: true, proxy: { '/api': process.env.VITE_API_PROXY ?? 'http://127.0.0.1:3001' } },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
});
