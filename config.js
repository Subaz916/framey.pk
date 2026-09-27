/* ============================================================================
   FRAMEY.PK — shared configuration
   Copy this file for each environment you deploy (e.g. config.staging.js).

   The anon key is DESIGNED to be public. It ships in the browser no matter
   what, and Supabase relies on Row Level Security — not on hiding this key —
   to keep unauthorised people out. The keys you must never put here are the
   `service_role` key and any database password.

   Where to find these two values:
     Supabase dashboard → Project Settings → API
   ============================================================================ */

window.FRAMEY_CONFIG = {
  supabaseUrl: "https://mneyrimtodydlsksopdn.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uZXlyaW10b2R5ZGxza3NvcGRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0NzE4MDMsImV4cCI6MjEwNjA0NzgwM30.80rvwcxNbm5E0p47sme7USq5WjMmvUqtedEwrHvcpME",

  /* Set to false to keep the storefront on its built-in catalogue even when
     Supabase is reachable. Handy while you are still filling in the DB. */
  useRemoteProducts: true,

  /* Set to false to keep orders local-only (they will still show the success
     screen, they just will not reach the admin panel). */
  sendOrdersToSupabase: true
};

/* True when config.js still has the placeholder values in it. Used to show a
   helpful warning instead of a raw network error. */
window.FRAMEY_CONFIG.isConfigured = function () {
  var c = this;
  return (
    typeof c.supabaseUrl === "string" &&
    c.supabaseUrl.indexOf("YOUR-PROJECT-REF") === -1 &&
    typeof c.supabaseAnonKey === "string" &&
    c.supabaseAnonKey.indexOf("YOUR-ANON") === -1 &&
    c.supabaseAnonKey.length > 20
  );
};
