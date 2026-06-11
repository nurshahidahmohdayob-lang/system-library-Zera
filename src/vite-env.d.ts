/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to 'true' to point Firestore/Auth at the local Firebase Emulator Suite (dev only). */
  readonly VITE_USE_EMULATOR?: string;
  readonly VITE_STUDENT_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
