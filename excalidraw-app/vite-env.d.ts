/// <reference types="vite-plugin-pwa/vanillajs" />
/// <reference types="vite-plugin-pwa/info" />
/// <reference types="vite-plugin-svgr/client" />
interface ImportMetaEnv {
  VITE_APP_PORT: string;
  VITE_APP_DEV_DISABLE_LIVE_RELOAD: string;
  VITE_APP_COLLAPSE_OVERLAY: string;
  VITE_APP_ENABLE_ESLINT: string;
  VITE_APP_ENABLE_PWA: string;
  MODE: string;
  DEV: string;
  PROD: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
