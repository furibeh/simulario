interface ImportMetaEnv {
  /** Cloudflare Web Analytics token. Analytics load only when this is set. */
  readonly PUBLIC_CF_BEACON_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
