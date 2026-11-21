import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  server: {
    strictPort: true,
    fs: { allow: [fileURLToPath(new URL('.', import.meta.url)), fileURLToPath(new URL('../data', import.meta.url))] },
    proxy: { '/api': 'http://127.0.0.1:8001' },
  },
});
