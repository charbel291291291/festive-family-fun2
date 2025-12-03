// Admin password config
// Use ADMIN_PASSWORD_FROZEN = true to pin a client-side admin password during development.
// NOTE: This is NOT SECURE for production. If you plan to deploy, set ADMIN_PASSWORD_FROZEN=false
// and enable the Supabase auth flow.
export const ADMIN_PASSWORD_FROZEN = true;
export const ADMIN_PASSWORD = "969696";
// Temporarily disable admin password and auth for local dev & testing only.
// WARNING: DO NOT ENABLE IN PRODUCTION. This bypasses all auth checks for Admin pages.
export const ADMIN_NO_PASSWORD = true;
