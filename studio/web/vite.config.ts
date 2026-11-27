import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// In development the website runs on its own port and forwards /api to the Studio API.
// base './' and relative API paths ('api/...') let the same build work at the root (http://127.0.0.1:3000/) and
// under a proxy prefix (https://www.tpdocgenai.com/benchmarkingStudio/, where nginx strips the prefix).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': 'http://127.0.0.1:3000' } },
});
