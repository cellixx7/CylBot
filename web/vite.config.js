import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import securityHeaders from '../bot/src/api/http/securityHeaders.js';

export default defineConfig({
  plugins: [react()],
  server: {
    headers: securityHeaders.SECURITY_HEADERS,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
      },
    },
  },
  preview: { headers: securityHeaders.SECURITY_HEADERS },
});
