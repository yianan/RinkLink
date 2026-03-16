import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom')) {
            return 'react-dom'
          }
          if (id.includes('node_modules/react/') || id.includes('node_modules/scheduler/')) {
            return 'react'
          }
          if (id.includes('node_modules/@radix-ui/')) {
            return 'radix'
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'icons'
          }
          if (id.includes('node_modules')) {
            return 'vendor'
          }
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
