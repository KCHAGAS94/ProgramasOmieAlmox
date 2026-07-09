import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3004,
    host: '0.0.0.0', // Escuta em todas as interfaces
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4004',
        changeOrigin: true
      }
    }
  }
});
