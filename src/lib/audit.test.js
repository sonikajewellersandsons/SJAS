import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({
  authUserId: 'auth-A',
  userRowId: 11,
  inserts: [],
}))

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: state.authUserId } } })),
    },
    from: vi.fn((table) => {
      if (table === 'users') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { id: state.userRowId } })),
            })),
          })),
        }
      }
      return {
        insert: vi.fn(async (payload) => { state.inserts.push(payload); return { error: null } }),
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null })) })) })),
      }
    }),
  },
}))

import { logAction, resetAuditUserCache } from './audit'

describe('audit logAction + user-id cache', () => {
  beforeEach(() => {
    state.authUserId = 'auth-A'
    state.userRowId = 11
    state.inserts = []
    resetAuditUserCache()
    vi.clearAllMocks()
  })

  it('attributes the log to the resolved user', async () => {
    await logAction('login', 'auth', null, { email: 'a@x.com' })
    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0].user_id).toBe(11)
  })

  it('uses the explicitly passed userId when given (logout path)', async () => {
    await logAction('logout', 'auth', null, {}, 99)
    expect(state.inserts[0].user_id).toBe(99)
  })

  it('invalidates the cached user id after logout', async () => {
    await logAction('login', 'auth', null, { email: 'a@x.com' })
    expect(state.inserts[0].user_id).toBe(11)

    // User B signs in without a page refresh
    resetAuditUserCache()
    state.authUserId = 'auth-B'
    state.userRowId = 22
    await logAction('login', 'auth', null, { email: 'b@x.com' })
    expect(state.inserts[1].user_id).toBe(22)
  })

  it('never throws when the DB call fails', async () => {
    const supabase = (await import('./supabase')).supabase
    supabase.from.mockReturnValue({
      insert: vi.fn(async () => { throw new Error('boom') }),
      select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null })) })) })),
    })
    await expect(logAction('x', 't', null, {})).resolves.toBeUndefined()
  })
})
