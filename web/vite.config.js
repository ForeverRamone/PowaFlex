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
        // recharts pesa 415 KB y solo lo usan tres páginas, así que va en su
        // propio trozo. OJO con lo que parece obvio y no lo era: declarar SOLO
        // recharts metía a React DENTRO de ese trozo (es su dependencia y era
        // el primer grupo que la reclamaba), así que TODAS las páginas —hasta
        // las que no pintan una gráfica— tenían que bajarse y ejecutarse los
        // 415 KB para arrancar React. Declarando React aparte, cada uno va a lo
        // suyo: react se baja siempre porque hace falta siempre, y recharts
        // solo cuando de verdad hay una gráfica que pintar.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          recharts: ['recharts'],
        },
      },
    },
  },
});
