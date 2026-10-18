import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const serverPort = Number(process.env.SERVER_PORT ?? 3001);

export default defineConfig({
  root: 'src/client',
  publicDir: 'public',
  plugins: [react()],
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/socket.io': { target: `http://localhost:${serverPort}`, ws: true },
    },
  },
});
