export default {
  base: './', // relative asset URLs so the build works under any path (server.js root or static hosting)
  server: { port: 5173, proxy: { '/ws': { target: 'ws://localhost:8080', ws: true } } },
  build: { chunkSizeWarningLimit: 4000 },
};
