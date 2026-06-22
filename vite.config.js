import { defineConfig } from 'vite';
import { resolve } from 'path';

const API_TARGET = process.env.API_TARGET || 'http://localhost:3000';
const VITE_PORT = Number(process.env.VITE_PORT) || 5173;

export default defineConfig({
  root: '.',
  publicDir: false,
  server: {
    port: VITE_PORT,
    strictPort: true,
    open: '/index.html',
    proxy: {
      '/admin': { target: API_TARGET, changeOrigin: true },
      '/api': { target: API_TARGET, changeOrigin: true },
      '/common-assets': { target: API_TARGET, changeOrigin: true },
      '/student-assets': { target: API_TARGET, changeOrigin: true },
      '/github': { target: API_TARGET, changeOrigin: true },
      '/submit-project': { target: API_TARGET, changeOrigin: true },
      '/fetch-video': { target: API_TARGET, changeOrigin: true },
      '/hosted': { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin-dashboard.html'),
        adminAssets: resolve(__dirname, 'admin-common-assets.html'),
        adminUsers: resolve(__dirname, 'admin-users.html'),
        adminBilling: resolve(__dirname, 'admin-billing.html'),
        styleEditor: resolve(__dirname, 'style-editor.html'),
      },
    },
  },
});
