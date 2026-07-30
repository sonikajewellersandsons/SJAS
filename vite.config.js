import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const API_URL = 'https://drhint.com/api/public/hooks/gold-rates'

function rcplDevMiddleware() {
  return {
    name: 'rcpl-dev-middleware',
    configureServer(server) {
      server.middlewares.use('/api/fetch-rcpl-rate', async (req, res) => {
        try {
          const response = await fetch(API_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SJS/1.0)' },
            signal: AbortSignal.timeout(10000),
          })
          const json = await response.json()
          const per10g = json.per10gram24kInr || json.perGram24kInr * 10 || 0
          const gst = 3

          const rates = [
            { short_name: 'GST', display_name: 'FINE GOLD GST', desc_name: 'GOLD 999 RATE WITH GST', rate: Math.round(per10g * (1 + gst / 100)) },
            { short_name: '24K', display_name: '24K GOLD', desc_name: '24K Gold Rate', rate: per10g },
            { short_name: '22K', display_name: '22K GOLD', desc_name: '22K Gold Rate', rate: Math.round(per10g * 916 / 999) },
            { short_name: '18K', display_name: '18K GOLD', desc_name: '18K Gold Rate', rate: Math.round(per10g * 750 / 999) },
          ]

          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ rates, updated_at: new Date().toISOString() }))
        } catch (err) {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ rates: [], updated_at: new Date().toISOString(), error: err.message }))
        }
      })
    }
  }
}

export default defineConfig({
  plugins: [react(), rcplDevMiddleware()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  }
})
