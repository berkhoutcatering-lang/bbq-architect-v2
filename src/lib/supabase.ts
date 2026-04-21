import { createBrowserClient } from '@supabase/ssr';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Browser client with cookie-based auth session.
// Singleton via globalThis om te voorkomen dat Next.js HMR / meerdere client-
// bundles aparte GoTrueClient instances met dezelfde storage-key opzetten.
// Zonder deze cache kregen we "Multiple GoTrueClient instances" warnings.
type GlobalWithSupabase = typeof globalThis & { __bbqSupabase?: SupabaseClient | null };
const g = globalThis as GlobalWithSupabase;

if (typeof g.__bbqSupabase === 'undefined') {
  g.__bbqSupabase = supabaseUrl && supabaseKey
    ? createBrowserClient(supabaseUrl, supabaseKey)
    : null;
}

export const supabase: SupabaseClient | null = g.__bbqSupabase ?? null;

// Anonymous client for public pages (no auth session).
// Aparte storageKey + persistSession=false voorkomt dat deze dezelfde
// storage-sleutel deelt met de browser client → geen "Multiple
// GoTrueClient instances" warning meer.
export const supabaseAnon: SupabaseClient | null = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: 'sb-anon-public',
      },
    })
  : null;
