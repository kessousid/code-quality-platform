/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Not readonly: test files mutate this directly to point the API client
  // at a real local server per-test (see src/test/local-api-server.ts).
  VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
