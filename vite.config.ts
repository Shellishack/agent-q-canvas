import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 6060,
    strictPort: false,
    watch: {
      ignored: ['**/references/**']
    }
  },
  optimizeDeps: {
    entries: ['index.html']
  },
  build: {
    outDir: 'dist'
  }
});
