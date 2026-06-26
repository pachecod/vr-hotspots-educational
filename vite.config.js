import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const API_TARGET = process.env.API_TARGET || 'http://localhost:3000';
const VITE_PORT = Number(process.env.VITE_PORT) || 5173;

export default defineConfig({
  plugins: [react()],
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
        adminHome: resolve(__dirname, 'admin.html'),
        admin: resolve(__dirname, 'admin-submissions.html'),
        adminAssets: resolve(__dirname, 'admin-common-assets.html'),
        adminUsers: resolve(__dirname, 'admin-users.html'),
        adminBilling: resolve(__dirname, 'admin-billing.html'),
        adminSubmissions: resolve(__dirname, 'admin-submissions.html'),
        adminReview: resolve(__dirname, 'admin-review.html'),
        adminSnippets: resolve(__dirname, 'admin-snippets.html'),
        adminTemplates: resolve(__dirname, 'admin-templates.html'),
        adminTemplateEditor: resolve(__dirname, 'admin-template-editor.html'),
        styleEditor: resolve(__dirname, 'style-editor.html'),
      },
    },
  },
});
