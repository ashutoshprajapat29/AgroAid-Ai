/**
 * supabase.ts
 * Supabase client for AgroAid — used by mandiService for all market queries.
 * Reads from environment variables set in .env
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

// Use placeholders to prevent the app from crashing if env vars are missing
export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co", 
  supabaseAnonKey || "placeholder"
);

/** True if env vars are configured — used for graceful fallback */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
