import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// Capacitor build config
// - base: '/' چون Capacitor از https://localhost/ سرو می‌کند (نه file://)
// - بدون VitePWA چون Capacitor خودش مدیریت آفلاین را انجام می‌دهد
// - outDir: dist/capacitor — همان مقداری که در capacitor.config.ts تعریف شده
export default defineConfig({
  base: '/',
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/capacitor'),
    emptyOutDir: true,
    // chunk size warning را افزایش می‌دهیم (در موبایل مهم‌تر نیست)
    chunkSizeWarningLimit: 1000,
  },
  worker: {
    format: 'es',
  },
});
