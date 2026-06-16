import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // Resolve shared package directly from source (no npm link needed)
      'snake-arena-shared': path.resolve(__dirname, '../shared/src'),
    }
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        // Separate PixiJS into its own chunk for better caching
        manualChunks: {
          pixi: ['pixi.js']
        }
      }
    }
  }
});

