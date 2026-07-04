import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3860',
      '/img': 'http://localhost:3860',
    },
  },
  build: {
    rollupOptions: {
      output: {
        // recharts is heavy and only used on a few pages; keep it in its own
        // chunk so the initial load doesn't drag it in
        manualChunks: {
          recharts: ['recharts'],
        },
      },
    },
  },
});
