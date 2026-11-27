import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';

export default defineConfig({
  base: './', // względne ścieżki: działa pod detaildesk.pl i pod każdym innym adresem
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'), // aplikacja studia
        umow: resolve(__dirname, 'umow/index.html'), // formularz dla klientów
        zlecenie: resolve(__dirname, 'zlecenie/index.html'), // strona zlecenia klienta
        prywatnosc: resolve(__dirname, 'prywatnosc/index.html'), // polityka prywatności
      },
    },
    chunkSizeWarningLimit: 1500,
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'DetailDesk – ARC Detailing',
        short_name: 'DetailDesk',
        description: 'Zapytania, wyceny, przyjęcia aut i postęp prac dla studia detailingu',
        lang: 'pl',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0E0F11',
        theme_color: '#0E0F11',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.js'],
  },
});
