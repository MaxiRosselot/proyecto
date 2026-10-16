// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // confirm.html es una pagina aparte (confirmacion de visita): se compila para que importe
    // el numero de WhatsApp de lib/marca.mjs en vez de tenerlo copiado.
    rollupOptions: { input: { main: 'index.html', confirm: 'confirm.html' } },
    outDir: 'dist',
    // exceljs (~930 kB) va en su propio archivo y solo se descarga al importar un Excel.
    chunkSizeWarningLimit: 1000,
    sourcemap: false,
    emptyOutDir: true,
  },
  publicDir: 'public', // ✅ aquí Vite copiará confirm.html y otros archivos estáticos
  server: {
    port: 5173,
    // Allow temporary ngrok hostnames when exposing the local dev server.
    allowedHosts: true,
    // Local-only proxies. Both are opt-in via env so production builds are unaffected.
    // VITE_REPISAS_3D_PROXY routes the embedded configurator and its assets through this same
    // origin, so a single tunnel serves the whole flow.
    proxy: {
      ...(process.env.VITE_NETLIFY_FUNCTIONS_PROXY ? {
        '/.netlify/functions': {
          target: process.env.VITE_NETLIFY_FUNCTIONS_PROXY,
          changeOrigin: true,
        },
        // Igual que el redirect de netlify.toml: /pagar es la funcion pagar.
        '/pagar': {
          target: process.env.VITE_NETLIFY_FUNCTIONS_PROXY,
          changeOrigin: true,
          rewrite: ruta => ruta.replace(/^\/pagar/, '/.netlify/functions/pagar'),
        },
      } : {}),
      ...(process.env.VITE_REPISAS_3D_PROXY ? {
        '/embed': { target: process.env.VITE_REPISAS_3D_PROXY, changeOrigin: true },
        // El configurador completo que se abre en el modal. Cualquier ruta que no sea /embed
        // hace que la app 3D monte su interfaz entera.
        '/configurador': { target: process.env.VITE_REPISAS_3D_PROXY, changeOrigin: true },
        '/assets': { target: process.env.VITE_REPISAS_3D_PROXY, changeOrigin: true },
      } : {}),
    },
  },
})
