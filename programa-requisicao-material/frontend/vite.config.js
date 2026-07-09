import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3011,
    host: '0.0.0.0', // Escuta em todas as interfaces
    strictPort: true,
    open: false
  }
});
