import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { execSync } from 'node:child_process'

// Versionskennung für „Einstellungen“: Git-Commit des Builds
const gitVersion = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'dev' }
})()

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const appName = env.VITE_APP_NAME || 'Schompf'
  const themeColor = env.VITE_THEME_COLOR || '#2563EB'
  // eigene Icons für die Dev-Instanz (public/dev/), damit man sie auf dem Home-Bildschirm unterscheiden kann
  const iconDir = env.VITE_ICON_DIR || ''

  return {
    define: {
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
      __APP_VERSION__: JSON.stringify(gitVersion),
    },
    plugins: [
      vue(),
      {
        name: 'html-app-name',
        transformIndexHtml: html => html
          .replaceAll('Schompf - Mahlzeitenplanung', `${appName} - Mahlzeitenplanung`)
          .replaceAll('#0D9488', themeColor).replaceAll('#2563EB', themeColor)
          .replace('href="/favicon.svg"', `href="/${iconDir}favicon.svg"`)
          .replace('href="/apple-touch-icon.png"', `href="/${iconDir}apple-touch-icon.png"`)
      },
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: false, // Registrierung in main.js (mit Selbst-Aktualisierung)
        includeAssets: ['favicon.ico', `${iconDir}apple-touch-icon.png`, 'mask-icon.svg'],
        manifest: {
          name: `${appName} - Mahlzeitenplanung`,
          short_name: appName,
          description: 'Plane deine Mahlzeiten und erstelle Einkaufslisten',
          theme_color: themeColor,
          background_color: '#FFFFFF',
          display: 'standalone',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: `${iconDir}pwa-192x192.png`,
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: `${iconDir}pwa-512x512.png`,
              sizes: '512x512',
              type: 'image/png'
            },
            {
              src: `${iconDir}pwa-512x512.png`,
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        },
        // eigener Service Worker (src/sw.js) für Benachrichtigungen
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.js',
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        }
      })
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    base: env.VITE_BASE_URL || '/',
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY || 'http://localhost:3000',
          changeOrigin: true
        }
      }
    }
  }
})
