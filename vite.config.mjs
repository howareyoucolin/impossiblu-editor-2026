import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
    build: {
        outDir: 'react-dist',
        emptyOutDir: true,
        rollupOptions: {
            input: path.resolve(__dirname, 'react.html'),
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },
})
