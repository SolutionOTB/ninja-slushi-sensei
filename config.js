// Supabase connection (publishable anon key — safe to expose in the browser).
// The Anthropic API key is NOT here — it lives only in the server-side edge function.
window.SLUSHI_CONFIG = {
  SUPABASE_URL: "https://twvnqikzmjggarzlgajj.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_JtHCKxo9CrDg2dVGw0dDjA_hPvJt323",
  AI_FUNCTION_URL: "https://twvnqikzmjggarzlgajj.supabase.co/functions/v1/ai-chat",
};
