import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as
  | string
  | undefined;

if (!supabaseUrl) {
  throw new Error("VITE_SUPABASE_URL is missing (check your .env file).");
}

if (!supabaseKey) {
  throw new Error(
    "VITE_SUPABASE_PUBLISHABLE_KEY is missing (check your .env file)."
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);
