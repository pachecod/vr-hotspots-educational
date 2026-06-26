import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'flat-editor/main.jsx'),
      name: 'FlatPageEditorBundle',
      formats: ['iife'],
      fileName: () => 'flat-editor.bundle.js',
    },
    outDir: '.',
    emptyOutDir: false,
    rollupOptions: {
      output: {
        extend: true,
        inlineDynamicImports: true,
      },
    },
  },
});
