import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // El servidor rechaza lo que muta cuando el Origin no casa con el Host
    // (cortafuegos contra peticiones lanzadas desde otra web). A través de este
    // proxy nunca casarían —el navegador manda Origin :5173 y el servidor ve
    // Host :3860—, así que en desarrollo se reescribe. En producción no hay
    // proxy: la app la sirve el propio servidor y los dos coinciden solos.
    // OJO con la forma abreviada (`'/api': 'http://localhost:3860'`): activa
    // `changeOrigin`, que reescribe el Host al del destino pero deja el Origin
    // del navegador. El servidor rechaza lo que muta cuando esos dos no casan
    // —es su cortafuegos contra peticiones lanzadas desde otra web— y en
    // desarrollo TODO POST se quedaba en 403. Con la forma de objeto no se
    // toca el Host, así que Origin y Host siguen siendo los dos :5173.
    // En producción no hay proxy: la app la sirve el propio servidor.
    proxy: {
      '/api': { target: 'http://localhost:3860' },
      '/img': { target: 'http://localhost:3860' },
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
