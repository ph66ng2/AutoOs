/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_SUPABASE_PASSWORD_RECOVERY_REDIRECT?: string;
  readonly VITE_UPDATER_CHANNEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
