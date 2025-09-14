import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { readFileSync, readdirSync } from 'fs';
import path from 'path';


// Preload all templates during build time
const preloadTemplates = () => {
  const templateSrc = path.join(process.cwd(), 'attachmentTemplates'); 
  return readdirSync(templateSrc).reduce((acc, file) => {
    if (!file.endsWith('.template')) return acc;
    const templatePath = path.join(templateSrc, file);
    acc[file.replace('.template', '')] = readFileSync(templatePath, 'utf-8');
    return acc;
  }, {});
};

export default defineConfig({
  define: {
    '__PRELOADED_TEMPLATES__': JSON.stringify(preloadTemplates())
  },
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
