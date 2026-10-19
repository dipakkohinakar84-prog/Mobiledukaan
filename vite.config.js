import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['pd-icon.png', 'pd-icon-192.png', 'pd-icon-512.png'],
      manifest: {
        id: '/',
        name: 'PhoneDukaan',
        short_name: 'PhoneDukaan',
        description: 'Offline mobile shop billing, GST invoices, PDF invoices, and sticker printing.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0d1b2a',
        background_color: '#0a0a1a',
        icons: [
          { src: 'pd-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pd-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pd-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,json,png,ico,woff2,ttf}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-pages',
              networkTimeoutSeconds: 3,
            },
          },
          {
            urlPattern: ({ url, request }) => url.origin === self.location.origin && ['script', 'style', 'worker', 'manifest'].includes(request.destination),
            handler: 'CacheFirst',
            options: {
              cacheName: 'app-assets',
            },
          },
          {
            urlPattern: ({ request }) => ['image', 'font'].includes(request.destination),
            handler: 'CacheFirst',
            options: {
              cacheName: 'app-media',
              expiration: {
                maxEntries: 120,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        suppressWarnings: true,
      },
    }),
  ],
})
