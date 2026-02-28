# Recipe Management System (Version 3) - AI-Powered

Full-stack, AI-powered Recipe Management System built with:
- Frontend: React + Vite
- Backend: Node.js + Express
- Database: PostgreSQL (Render Postgres)
- ORM: Prisma
- Auth: Email/password + optional Google SSO (Passport OAuth2)
- PWA: Installable web app (manifest + service worker + install prompt)

## What Is Implemented

- Recipe CRUD with metadata (`cuisineType`, `prep/cook time`, `servings`, `difficulty`, `tags`)
- Role-based authorization:
  - `USER`: can edit/delete own non-system recipes only
  - `ADMIN`: can edit/delete any recipe
- Shared-view behavior:
  - all authenticated users can view all recipes
  - all authenticated users can view all reviews/ratings/comments
- Reviews/comments per recipe (rating 1-5 + comment)
- Pantry CRUD per user
- 100+ free recipe import from TheMealDB into **system recipes** (admin action)
- AI metadata suggestion with strict provider order:
  - text: DeepSeek first -> OpenAI fallback -> local heuristic fallback
- Automatic metadata completion/backfill for missing difficulty/prep/cook/servings
- AI image pipeline with strict provider order:
  - OpenAI image generation first
  - DeepSeek-assisted image query + external lookup fallback
  - final SVG fallback (always renderable)
- Image provenance persisted per recipe (`imageSource`, `imageQuery`, `imagePrompt`)
- Backfill script/endpoint for broken or missing recipe images
- Summary recipe cards + dedicated recipe details page:
  - cards show summary only
  - details page shows full ingredients, step-by-step instructions, time breakdown, timeline, author attribution, reviews
- Polished login/signup UI with validation states and remember-email/name convenience (no password storage)
- PWA install support + offline app shell caching

## AI Power In This App

- Smart metadata intelligence:
  - Auto-completes missing cuisine, difficulty, prep/cook time, servings, and tags
  - Uses deterministic provider order: DeepSeek -> OpenAI -> heuristic fallback
  - Supports bulk metadata backfill for existing recipes
- Pantry-aware cooking assistant:
  - Suggests what you can cook now and what you can almost cook
  - Detects missing ingredients and proposes substitutions
  - Uses normalized ingredient matching (plural/synonym aware) for better recall
  - Applies relaxed-filter fallback when strict filters return no matches
- AI image enrichment:
  - OpenAI image generation first
  - DeepSeek-assisted external image retrieval fallback
  - Guaranteed renderable final fallback
- Transparent AI provenance:
  - Stores source/provider metadata for generated suggestions and images
  - Keeps suggestions editable before final confirmation

## Repository Layout

- `client/` React + Vite app
- `server/` Express API + Prisma
- `render.yaml` Render blueprint (client + server + postgres)
- `docs/screenshots/` README screenshots

## Local Setup

### 1) Install dependencies

```bash
npm install
```

### 2) Configure environment

Backend:

```bash
copy server\.env.example server\.env
```

Frontend:

```bash
copy client\.env.example client\.env
```

### 3) Required backend env vars (`server/.env`)

- `DATABASE_URL`
- `SESSION_SECRET`
- `CLIENT_URL` (example: `http://localhost:5173`)
- `SERVER_URL` (example: `http://localhost:4000`)
- `GOOGLE_CLIENT_ID` (optional)
- `GOOGLE_CLIENT_SECRET` (optional)
- `DEEPSEEK_API_KEY` (text primary)
- `OPENAI_API_KEY` (text fallback + image primary)

Optional:
- `ALLOW_DEV_AUTH=true`

### 4) Prisma + seed

```bash
npm run prisma:generate --workspace server
npm run prisma:migrate --workspace server
npm run dev:seed --workspace server
```

### 5) Optional: import and image backfill

```bash
npm run import:free --workspace server -- 100
npm run images:backfill --workspace server -- 200
npm run metadata:backfill --workspace server -- 200
```

### 6) Run app

```bash
npm run dev
```

- Client: `http://localhost:5173`
- Server: `http://localhost:4000`

## Default Seeded Admin

Seed creates/updates an idempotent admin account:
- Email: `ayassine.auce@gmail.com`
- Password: `password@123`
- Role: `ADMIN`

## Google OAuth Setup (Optional)

If using Google SSO:
- Authorized JavaScript origins:
  - `http://localhost:5173`
  - `https://<your-client>.onrender.com`
- Authorized redirect URIs:
  - `http://localhost:4000/api/auth/google/callback`
  - `https://<your-server>.onrender.com/api/auth/google/callback`

## Render Deployment

This repo includes `render.yaml` (Blueprint deploy).

### Blueprint flow

1. Push repo to GitHub.
2. Create Render Blueprint from repo.
3. Render provisions:
   - `rms-postgres`
   - `rms-server`
   - `rms-client`
4. Add missing secret env vars in Render dashboard.

### Commands used by services

Server build command:

```bash
npm install && npm run prisma:generate && npm run build
```

Server start command:

```bash
npm run prisma:deploy && npm run start
```

Client build command:

```bash
npm install && npm run build
```

Client static publish path:

```txt
dist
```

### Render migrate + seed

Run once after server is up (Render Shell):

```bash
npm run dev:seed
npm run import:free -- 100
npm run images:backfill -- 200
```

## PWA Notes

- Manifest and SW generated via `vite-plugin-pwa`
- Install banner shown when `beforeinstallprompt` is available
- Core app shell cached for offline entry
- API data still requires network

## Scripts

Root:
- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run test`

Server:
- `npm run prisma:generate --workspace server`
- `npm run prisma:migrate --workspace server`
- `npm run prisma:deploy --workspace server`
- `npm run dev:seed --workspace server`
- `npm run import:free --workspace server -- 100`
- `npm run images:backfill --workspace server -- 200`
- `npm run metadata:backfill --workspace server -- 200`

## API Summary

- `GET /api/health`
- `GET /api/auth/me`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/google`
- `GET /api/auth/google/callback`
- `POST /api/auth/logout`
- `POST /api/auth/dev-login` (only if `ALLOW_DEV_AUTH=true`)
- `GET/POST/PUT/DELETE /api/recipes`
- `POST /api/recipes/import/free?count=100` (admin)
- `POST /api/recipes/images/backfill` (admin)
- `POST /api/recipes/metadata/backfill` (admin)
- `GET /api/recipes/:id/reviews`
- `POST /api/recipes/:id/reviews`
- `POST /api/recipes/:id/share`
- `DELETE /api/recipes/:id/share/:userId`
- `GET /api/recipes/:id/shares`
- `GET/POST/PUT/DELETE /api/pantry`
- `POST /api/ai/cook-now`
- `POST /api/ai/metadata`
- `POST /api/ai/recipes/:id/generate-image`

## Testing and Quality

Validated successfully:
- `npm run lint`
- `npm run build`
- `npm run test`

Automated tests cover:
- RBAC permission matrix
- Global recipe visibility access helper
- AI provider order logic
- Auth hash/verify flow
- Fallback AI helpers and health/auth baseline routes

## Screenshots

### Desktop

![Desktop](docs/screenshots/desktop.svg)

### Tablet

![Tablet](docs/screenshots/tablet.svg)

### Mobile

![Mobile](docs/screenshots/mobile.svg)

## Known Limitations

- Render free tier may sleep services and slow cold start.
- Session store is in-memory by default; production should use Redis.
- External image fallback quality depends on third-party sources.
- Live Render URLs are not included in this repository output.
