import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Serviam', short_name: 'Serviam', theme_color: '#742a2a', background_color: '#f4eee0',
        display: 'standalone', start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
  server: { proxy: { '/api': 'http://localhost:8787' } },   // dev: Vite -> Node
  optimizeDeps: { include: ['epubjs'] },                    // epubjs ships CommonJS; force pre-bundle
});
