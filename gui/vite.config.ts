import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_PORT = process.env.FREER_API_PORT ?? '17890';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/ws': {
        target: `ws://127.0.0.1:${API_PORT}`,
        ws: true,
        rewrite: (path) => path.replace(/^\/ws/, ''),
      },
    },
  },
});
