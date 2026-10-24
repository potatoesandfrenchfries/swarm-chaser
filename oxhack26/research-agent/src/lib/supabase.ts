import { createClient } from "@supabase/supabase-js";

// Server-only. RLS is on with no policies, so only the service-role key can
// read or write: the browser never touches Supabase, it calls the API routes.
export function createSupabaseServerClient() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local."
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
