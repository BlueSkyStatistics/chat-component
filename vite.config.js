import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react({
      // This adds react-refresh for development
      fastRefresh: true,
    })
  ],
  server: {
    port: 5173,
    cors: true,
    hmr: {
      protocol: 'ws',
      host: 'localhost',
    }
  },
  build: {
    // Output as a library that can be used in the main app
    lib: {
      entry: 'src/main.jsx',
      name: 'ChatComponent',
      fileName: 'chat-component'
    },
    rollupOptions: {
      output: {
        format: 'umd',
        // Ensure we can use it in the browser
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM'
        }
      },
      external: ['react', 'react-dom']
    }
  }
})
