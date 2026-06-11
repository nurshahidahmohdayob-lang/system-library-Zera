# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Zera International Library System — a library management app for Zera Education. Single-page React 19 app served by an Express server that doubles as a Vite dev host and a backend API proxy. Persistence is Firebase (Auth + Firestore). The app has two faces: a public OPAC (catalog, digital resources, member portal) and a librarian/admin dashboard (catalog, circulation, inventory, barcodes, students/teachers, acquisitions, reports).

Originally scaffolded as a Google AI Studio app (note the `react-example` package name and the AI Studio banner in README) — some conventions trace back to that origin.

## Commands

```bash
npm install            # install deps
npm run dev            # run Express+Vite dev server (tsx server.ts) — this is the entry point, NOT `vite`
npm run emulators      # start Firebase Emulator Suite (Firestore :8080, Auth :9099, UI :4000); needs Java
npm run dev:emulator   # dev server pointed at the emulators (VITE_USE_EMULATOR=true) instead of prod Firestore
npm run build          # vite build (client) + esbuild bundle server.ts -> dist/server.cjs
npm start              # run production bundle (node dist/server.cjs), expects NODE_ENV=production
npm run lint           # tsc --noEmit && eslint .  — run this to typecheck; there is no test suite
npm run clean          # rm -rf dist
```

There are no automated tests. `npm run lint` (typecheck + eslint) is the only verification gate. `inspect-barcodes.ts` is a standalone diagnostic script (`tsx inspect-barcodes.ts`) that connects to Firestore and prints students with barcodes.

## Environment

Copy `.env.example`. Key vars (injected automatically in AI Studio, set manually otherwise):
- `GEMINI_API_KEY` — server-side Gemini calls; Vite also inlines it into the client bundle via `define` in `vite.config.ts`.
- `APP_URL` — self-referential host URL.
- `VITE_STUDENT_API_KEY` — pre-authorized token for the external student/staff registry sync.
- `DISABLE_HMR=true` — disables Vite HMR/file-watching (used in AI Studio to stop flicker during agent edits). Don't re-enable unconditionally.

Firebase client config is **committed** in `firebase-applet-config.json` (this is normal for Firebase web apps — security is enforced by Firestore rules, not by hiding the config).

## Architecture

### Server (`server.ts`)
One large file. In dev it mounts Vite as middleware (`middlewareMode`, SPA); in prod it serves `dist/` static + SPA fallback. CORS is wide open (`*`). API routes under `/api/v1`:
- `POST /api/v1/enrich-book-ai` — multi-source bibliographic enrichment (Google Books, Open Library, LOC Z39.50/SRU) with a Gemini fallback (`@google/genai`, lazily imported) to synthesize a synopsis. Uses `fetchWithTimeout` (AbortController) so a slow source can't hang the request.
- `GET /api/v1/students`, `/api/v1/students/:student`, `/api/v1/staff`, `/api/v1/staff/:staff` — proxy to an external school registry to bypass browser CORS, forwarding `Authorization: Bearer <key>`. When no `api_url` is supplied they return built-in mock data (see the large hardcoded `AP_STUDENTS` array and the deterministic generator that fabricates ~200 student profiles at the top of the file).

### Client data layer (`src/`)
- `src/lib/firebase.ts` — initializes Firebase app, Firestore with **persistent multi-tab local cache** (offline-first), and Auth. Reads the named Firestore database id from `firestoreDatabaseId` in the config.
- `src/services/` — all Firestore access goes through these:
  - `libraryService.ts` — `CatalogService` (book CRUD; full-text search is done client-side after fetching, no Algolia) and `CirculationService` (checkout/return via Firestore `runTransaction` for atomic copy/loan/availability updates).
  - `catalogService.ts` — pure metadata lookup/enrichment helpers (`lookupBookByIsbn`, `lookupBookByTitle`, `enrichBookDetails`) hitting Google Books / Open Library / LOC with `Promise.any` race + in-memory cache. Client-side counterpart to the server's enrich endpoint.
  - `BarcodeService.ts` — generates sequential barcodes per type with prefixes `Zera` (book), `Zerastudent`, `Zerastaff`; uses a Firestore counter doc + lowest-unused-number scan, allocated transactionally.
- `src/types/index.ts` — canonical TS types (`UserProfile`, `Book`, `BookCopy`, `Loan`, `OnlineResource`). The Firestore document shapes are also described in `firebase-blueprint.json`.

### Auth model (`src/hooks/useAuth.tsx`) — read carefully before touching auth
This is intentionally unusual and full of deliberate fallbacks:
- **Everyone who authenticates becomes `admin`.** Student/teacher self-registration is disabled. `register()` creates a Firebase Auth user then immediately *deletes* it and throws "Access Denied" — the only way to get an account is for an admin to pre-add the email in the Firebase console, after which the user signs in (first sign-in auto-creates an `admin` Firestore profile).
- **Bootstrapped admins** are hardcoded by email (`nurshahidahmohdayob@gmail.com`, `shahidah.a@zera.edu.my`) in both `useAuth.tsx` and `firestore.rules` (`isBootstrappedAdmin`). Keep these two lists in sync.
- **Local High-Availability / offline simulation mode**: on network errors, `login`/`register` fall back to a localStorage-backed fake session (`zera_active_local_credentials`, `zera_active_session`, `zera_local_registered_users`). `onAuthStateChanged` is short-circuited while a simulated session is active. This is why there's so much localStorage juggling — don't remove it assuming it's dead code.
- Firestore errors go through `handleFirestoreError` / `OperationType` (exported from this file), which throws a JSON-stringified diagnostic.

### UI (`src/App.tsx` + `src/components/`)
`App.tsx` holds the shell: `AuthProvider` wrapper, `Navbar`, the OPAC/AdminPanel toggle, and `AuthModal`. View switching is local `useState` (no router) — `OPAC` tabs and `AdminPanel` sidebar both select components by string id. Components split into `components/opac/` (public) and `components/admin/` (dashboard). Animations use `motion`/`framer-motion`.

### Styling — Zera Brand Kit
Tailwind v4 via `@tailwindcss/vite` (config lives in `src/index.css`, not a `tailwind.config.js`). Use the brand design tokens consistently: `zera-emerald`/`-dark`/`-light`, `zera-yellow`/`-dark`, and `natural-bg`/`-nav`/`-border`/`-text`/`-muted`. Serif display font for headings, sans for body. Match the existing rounded-2xl/3xl, uppercase-tracking, badge-heavy aesthetic when adding UI.

## Firestore security (`firestore.rules` + `security_spec.md`)
Rules are default-deny with per-collection validation (size limits, immutable `createdAt`, `request.time` enforcement, ownership/admin checks, relational `exists()` checks). `security_spec.md` documents the data invariants and a "Dirty Dozen" list of denial test payloads that the rules must reject — treat it as the spec when changing rules. Collections: `users`, `books`, `loans`, `acquisitions`, `inventory_sessions` (+ `copies`, `counters` used by services).

## Conventions
- Import alias `@/*` maps to the repo root (configured in both `tsconfig.json` and `vite.config.ts`), so imports look like `@/src/components/...` and `@/firebase-applet-config.json`.
- `.tsx`/`.ts` extension imports are allowed (`allowImportingTsExtensions`); the project is ESM (`"type": "module"`), `noEmit` (Vite/esbuild do the building).
- `cn()` in `src/lib/utils.ts` (clsx + tailwind-merge) for conditional classes.
