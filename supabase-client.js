/* ============================================================================
   FRAMEY.PK — Supabase client bootstrap (shared by the storefront and admin)

   Returns a client, or null with a human-readable reason. Nothing here throws,
   so a missing library, an unconfigured config.js, or a blocked CDN can never
   take the page down — callers just get null and fall back.
   ============================================================================ */

(function () {
  "use strict";

  var state = { client: null, reason: "" };

  function init() {
    if (state.client || state.reason) return state.client;

    var cfg = window.FRAMEY_CONFIG;

    if (!cfg || typeof cfg.isConfigured !== "function" || !cfg.isConfigured()) {
      state.reason = "config.js still has placeholder values";
      return null;
    }
    if (typeof window.supabase === "undefined" || !window.supabase.createClient) {
      state.reason = "the Supabase library did not load (check your connection / ad blocker)";
      return null;
    }

    try {
      state.client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false
        }
      });
    } catch (err) {
      state.reason = "could not create the Supabase client: " + err.message;
      state.client = null;
    }
    return state.client;
  }

  window.FrameySupabase = {
    /** @returns {object|null} a supabase-js client, or null if unavailable */
    get: init,
    /** @returns {string} why init() returned null ("" when it did not) */
    reason: function () {
      init();
      return state.reason;
    },
    isReady: function () {
      return !!init();
    }
  };
})();
