/**
 * supabase.ts
 * Supabase client for AgroAid — used by mandiService for all market queries.
 * Reads from environment variables set in .env
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/** True if env vars are configured — used for graceful fallback */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
