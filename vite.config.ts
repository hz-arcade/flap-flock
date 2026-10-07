import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves project sites under /<repo>/. Override with VITE_BASE=/ for root hosting.
const base = process.env.VITE_BASE ?? '/flap-flock/';

export default defineConfig({
  base,
  build: { target: 'es2022', sourcemap: false },
  test: { environment: 'node', testTimeout: 120_000 },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.svg', 'apple-touch-icon.png', 'cover.png'],
      manifest: {
        id: base,
        name: 'Flap Flock',
        short_name: 'Flap Flock',
        description: 'Tap to flap through pipe-filled pixel worlds as a duck, a chicken, a pelican and more. Eight levels and an endless mode.',
        lang: 'en',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#5c94fc',
        theme_color: '#5c94fc',
        categories: ['games'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        screenshots: [{ src: 'cover.png', sizes: '1200x630', type: 'image/png', form_factor: 'wide', label: 'Flap Flock gameplay' }],
      },
      workbox: {
        // Precache the app shell, the pixel font and icons so the game runs fully offline once installed.
        // Splash screens are only fetched by iOS at install time, so they stay network-only.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        globIgnores: ['splash/**', 'cover.png'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
