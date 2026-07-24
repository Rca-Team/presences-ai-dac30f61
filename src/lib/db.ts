// Custom Supabase client pointing at the user's paid Supabase project.
// All app data (except Lovable AI Gateway calls) goes through this client.
import { createClient } from '@supabase/supabase-js';
// Intentionally untyped: the codebase references columns beyond what the
// auto-generated Cloud types declare. Runtime is unaffected.

const SUPABASE_URL = 'https://maxzmwsuqavwvhlvinfj.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_2hbipS4pHN50qKkuipOk-Q_JIPne0dG';

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_');
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (isNewSupabaseApiKey(supabaseKey) && headers.get('Authorization') === `Bearer ${supabaseKey}`) {
      headers.delete('Authorization');
    }
    headers.set('apikey', supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  global: { fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY) },
  auth: {
    storage: typeof window !== 'undefined' ? localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'sb-maxzmwsuqavwvhlvinfj-auth-token',
  },
});

// Re-export as default too for flexibility
export default supabase;
