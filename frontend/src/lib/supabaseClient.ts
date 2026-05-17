/**
 * Supabase browser client singleton (M4).
 *
 * Lê NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY (que
 * o Vercel injeta no build). Em dev local sem essas vars, o cliente
 * lança erro claro em vez de criar uma instância quebrada.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (_client) return _client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      'Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e ' +
      'NEXT_PUBLIC_SUPABASE_ANON_KEY nas env vars do frontend.'
    )
  }

  _client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  })
  return _client
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

/**
 * Converte username em email pra autenticar no Supabase.
 * Match com `supabase_admin.email_for_username` no backend.
 *
 * Master tem override hardcoded (email real do Diretor).
 */
export function usernameToEmail(username: string): string {
  const lc = username.trim().toLowerCase()
  if (lc === 'puczaras') return 'cesarsibila210@gmail.com'
  return `${lc}@users.atlas-mora.app`
}
