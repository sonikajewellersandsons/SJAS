import { supabase } from './supabase'

let cachedUserId = null

async function resolveUserId() {
  if (cachedUserId) return cachedUserId
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data } = await supabase.from('users').select('id').eq('auth_id', user.id).maybeSingle()
    cachedUserId = data?.id ?? null
    return cachedUserId
  } catch {
    return null
  }
}

// Call after sign-out so the next login (same page session) isn't attributed
// to the previous user.
export function resetAuditUserCache() {
  cachedUserId = null
}

// Fire-and-forget audit trail. Never throws, never blocks the caller.
// Pass userId explicitly when the auth session may already be cleared (e.g. logout).
export async function logAction(action, tableName = '', recordId = null, details = {}, userId = null) {
  try {
    const uid = userId || (await resolveUserId())
    const { error } = await supabase.from('logs').insert({
      action,
      table_name: tableName,
      record_id: recordId,
      details: details || {},
      user_id: uid,
    })
    if (error) console.warn('Audit log failed:', error.message)
  } catch (e) {
    console.warn('Audit log failed:', e)
  }
}
