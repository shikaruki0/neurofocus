import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Build-time CSP injection.
 *
 * index.html carries a strict CSP with a `__CSP_CONTENT__` placeholder. This
 * plugin replaces it at build/dev time: if VITE_SUPABASE_URL is configured the
 * Supabase HTTPS origin is added to connect-src (the app only talks to Supabase
 * over HTTPS — Auth + PostgREST fetch; no Realtime/websockets). When it is not
 * configured (local-only / GitHub Pages builds) the CSP ships without the
 * extra origin. This keeps the CSP strict AND prevents hard-coding a specific
 * Supabase project reference into the repository.
 */
export function cspPlugin(env: Record<string, string>) {
  const baseCsp =
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
    "connect-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; " +
    "worker-src 'self' blob:; manifest-src 'self'; media-src 'self' blob:; " +
    "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

  let csp = baseCsp;
  const supabaseUrl = env.VITE_SUPABASE_URL || '';
  try {
    const parsed = new URL(supabaseUrl);
    if (parsed.protocol === 'https:' && parsed.host && !parsed.username) {
      csp = baseCsp.replace("connect-src 'self'", `connect-src 'self' ${parsed.origin}`);
    }
  } catch {
    // Malformed/absent URL — ship the local-mode CSP unchanged.
  }

  return {
    name: 'neurofocus-csp',
    transformIndexHtml(html: string) {
      return html.split('__CSP_CONTENT__').join(csp);
    },
  };
}

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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    // Base path
    // Netlify (recommended): use '/'
    // GitHub Pages project site: change to '/neurofocusx/' if needed
    base: mode === 'production' ? '/' : '/',
    root: '.',
    publicDir: 'public',
    build: {
      outDir: 'dist',
      // Source maps expose full original source paths and aid attackers after
      // any future client bug; they are not needed in production bundles.
      sourcemap: mode !== 'production',
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
      cspPlugin(env),
      spaFallbackPlugin(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
        manifest: {
          name: 'NeuroFocusX',
          short_name: 'NeuroFocusX',
          description:
            'Gamified productivity & study app with XP, streaks, habits, and focus timer.',
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
  };
});
