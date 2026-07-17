// Edge Function to create auth users + profile in one call
// Will be implemented in a future phase

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req) => {
  return new Response(
    JSON.stringify({ message: 'create-auth-user coming soon' }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
