import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const API_URL = 'https://drhint.com/api/public/hooks/gold-rates'
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RateData {
  per10gram24kInr: number
  perGram24kInr: number
  spotUsdPerOz: number
  inrPerUsd: number
  fetchedAt: string
  gold_999_with_gst: number
  gold_22k: number
  gold_18k: number
  silver_999: number | null
  error?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  try {
    const res = await fetch(API_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SJS/1.0)' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`API HTTP ${res.status}`)
    const json = await res.json()

    const per10g = json.per10gram24kInr || json.perGram24kInr * 10 || 0
    const perGram = json.perGram24kInr || per10g / 10 || 0
    const gst = 3

    const data: RateData = {
      per10gram24kInr: per10g,
      perGram24kInr: perGram,
      spotUsdPerOz: json.spotUsdPerOz || 0,
      inrPerUsd: json.inrPerUsd || 0,
      fetchedAt: json.fetchedAt || new Date().toISOString(),
      gold_999_with_gst: Math.round(per10g * (1 + gst / 100)),
      gold_22k: Math.round(per10g * 916 / 999),
      gold_18k: Math.round(per10g * 750 / 999),
      silver_999: null,
    }

    return new Response(JSON.stringify(data), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    })
  } catch (err) {
    return new Response(JSON.stringify({
      per10gram24kInr: 0,
      perGram24kInr: 0,
      spotUsdPerOz: 0,
      inrPerUsd: 0,
      fetchedAt: new Date().toISOString(),
      gold_999_with_gst: 0,
      gold_22k: 0,
      gold_18k: 0,
      silver_999: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    })
  }
})
