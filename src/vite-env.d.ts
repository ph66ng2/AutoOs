/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_UPDATER_CHANNEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
