import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 3003,
    allowedHosts: [
      "roster-inf.hachiii.biz.id", 
      "roster.hachiii.biz.id"
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:4003',
        changeOrigin: true,
      },
    },
  },
});
