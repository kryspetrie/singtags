/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/vue" />

declare module 'wasm-media-encoders/wasm/mp3?url' {
  const url: string
  export default url
}

declare module 'wasm-media-encoders/wasm/ogg?url' {
  const url: string
  export default url
}

declare module 'spessasynth_lib/dist/spessasynth_processor.min.js?url' {
  const url: string
  export default url
}

interface ImportMetaEnv {
  /** Public Google OAuth Web client ID (never a secret). Empty disables Drive sync. */
  readonly VITE_GOOGLE_OAUTH_CLIENT_ID?: string
}
