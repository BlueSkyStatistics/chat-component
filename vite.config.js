import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {viteStaticCopy} from 'vite-plugin-static-copy'

import {readFileSync, readdirSync} from 'fs';
import path from 'path';
import packageJson from './package.json' with {type: 'json'};


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
        '__PRELOADED_TEMPLATES__': JSON.stringify(preloadTemplates()),
        '__CHAT_VERSION__': JSON.stringify(packageJson.version)
    },
    plugins: [
        react({
            // This adds react-refresh for development
            fastRefresh: true,
        }),
        viteStaticCopy({
            targets: [
                {
                    src: 'attachmentTemplates/*',
                    dest: 'attachmentTemplates'
                }
            ]
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
            fileName: (format) => format === 'es' ? 'chat-component.js' : 'chat-component.umd.cjs',
            formats: ['es', 'umd']
        },
        rollupOptions: {
            output: {
                // Ensure we can use it in the browser
                globals: {
                    react: 'React',
                    'react-dom': 'ReactDOM'
                }
            },
            external: [
                'react',
                'react-dom',
                'bootstrap',
                '@fortawesome/fontawesome-free'
            ]
        },
        outDir: 'dist',
        emptyOutDir: true,
    }
})
