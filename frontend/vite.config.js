import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Fail loudly if 5173 is taken by an old dev server instead of silently using 5174
    // (the backend CORS list and Google sign-in expect http://localhost:5173).
    strictPort: true,
  },
})
