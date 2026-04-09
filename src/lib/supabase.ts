import { createBrowserClient } from '@supabase/ssr';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Browser client with cookie-based auth session
export const supabase: SupabaseClient | null = supabaseUrl && supabaseKey
  ? createBrowserClient(supabaseUrl, supabaseKey)
  : null;

// Anonymous client for public pages (no auth session)
export const supabaseAnon: SupabaseClient | null = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;
