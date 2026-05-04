import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        viewer: resolve(__dirname, 'index.html'),
        viewerEn: resolve(__dirname, 'en/index.html'),
        editor: resolve(__dirname, 'editor/index.html'),
        editorLogin: resolve(__dirname, 'editor/login/index.html')
      }
    }
  }
});
