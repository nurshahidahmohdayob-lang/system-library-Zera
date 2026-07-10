import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Served behind the local Caddy HTTPS proxy as https://library.test, so the
      // dev server must accept that Host header (Vite 5+ blocks unknown hosts with a
      // 403 as DNS-rebinding protection). API routes bypass this via Express.
      allowedHosts: ['library.test', '.test'],
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr:
        process.env.DISABLE_HMR === 'true'
          ? false
          : {
              port: process.env.HMR_PORT
                ? parseInt(process.env.HMR_PORT, 10)
                : 24683,
            },
    },
  };
});
