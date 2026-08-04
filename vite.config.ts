import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function spaFallbackPlugin() {
  // Copies index.html to 404.html for GitHub Pages SPA routing
  return {
    name: 'spa-fallback',
    closeBundle: async () => {
      try {
        const { copyFile } = await import('node:fs/promises');
        const { resolve } = await import('node:path');
        const outDir = resolve('dist');
        await copyFile(resolve(outDir, 'index.html'), resolve(outDir, '404.html'));
        console.log('✓ Created dist/404.html for SPA fallback');
      } catch (e) {
        console.warn('Failed to create 404.html', e);
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  // Base path
  // Netlify (recommended): use '/'
  // GitHub Pages project site: change to '/neurofocusx/' if needed
  base: mode === 'production' ? '/' : '/',
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
    // Arena previews use a per-session e2b.app hostname. This applies only to Vite's dev server.
    allowedHosts: ['.e2b.app'],
  },
  plugins: [
    spaFallbackPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'NeuroFocusX',
        short_name: 'NeuroFocusX',
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
      },
    }),
  ],
}));
