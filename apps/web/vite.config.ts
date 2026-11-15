import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        // Same-origin requests in development: no CORS setup needed in the API.
        proxy: {
            '/api': 'http://127.0.0.1:3333',
        },
    },
})
