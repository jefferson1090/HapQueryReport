import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['buffer', 'process', 'util', 'stream', 'events', 'crypto', 'vm', 'fs', 'path', 'url', 'http', 'https', 'zlib', 'os', 'assert', 'constants', 'querystring', 'tls', 'net', 'dgram', 'child_process', 'tty', 'domain', 'punycode', 'string_decoder', 'timers', 'console'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  base: './',
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/uploads': 'http://localhost:3001'
    }
  },
  optimizeDeps: {
    include: ['react-window']
  }
})
