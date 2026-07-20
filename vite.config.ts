import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => ({
  // Base path for GitHub Pages project site https://shikaruki0.github.io/neurofocus/
  // In dev we use '/' for convenience, in production build for GH Pages we use '/neurofocus/'
  // If you use a custom domain, change this to '/'
  base: mode === 'production' ? '/neurofocus/' : '/',
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: './index.html',
      },
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'NeuroFocus',
        short_name: 'NeuroFocus',
        description: 'Gamified productivity & study app with XP, streaks, habits, and focus timer.',
        theme_color: '#050810',
        background_color: '#050810',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/www\.gstatic\.com\/firebasejs\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'firebase-cdn',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
    }),
  ],
}));