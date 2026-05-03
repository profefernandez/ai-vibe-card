# 60 Watts of Clarity

An AI-powered clarity concierge, digital business card, and personal website.

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Framer Motion
- **Backend (target):** [Supabase](https://supabase.com) — Postgres + Auth + Storage with Row-Level Security, accessed directly from the browser via [`@supabase/supabase-js`](https://supabase.com/docs/reference/javascript/introduction)
- **Backend (legacy, being retired):** Express API + self-hosted PostgreSQL on a Scala Hosting VPS
- **Hosting:** Scala Hosting VPS continues to serve the static SPA build (`dist/`) via Apache. Data, auth, and storage calls go browser → Supabase, so no Node process or local Postgres is required on the VPS once migration is complete.
- **AI:** OpenAI-compatible chat, site scraping via Firecrawl

## Supabase setup

The front end ships with a Supabase client (`src/lib/supabase.ts`). Two
build-time env vars are required:

```sh
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

These are public values — the actual security fence is RLS, defined in
[`supabase/migrations/`](supabase/migrations/). Apply migrations in numeric
order via the Supabase CLI (`supabase db push`) or by pasting them into the
SQL editor. See [`supabase/README.md`](supabase/README.md) for the full
deploy flow (build → upload `dist/` to the Scala VPS → done).

## Getting Started

**Prerequisites:** Node.js & npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

```sh
# Clone the repo
git clone <YOUR_GIT_URL> clarity-60-watts
cd clarity-60-watts

# Install frontend dependencies
npm install

# Install API dependencies
cd api && npm install && cd ..

# Copy and configure environment variables
cp api/.env.example api/.env

# Start the API server (port 3001)
cd api && npm run dev &

# Start the frontend dev server (port 8080)
npm run dev
```

## Pre-commit hooks

This repo uses [pre-commit](https://pre-commit.com/) to run `gitleaks` on every commit so that secrets cannot be pushed accidentally. To enable it in your local clone:

```sh
pip install pre-commit && pre-commit install
```

After that, `git commit` will automatically scan staged files; the config lives in `.pre-commit-config.yaml`.

## Project Structure

```
src/           → React frontend (pages, components, hooks, lib)
api/           → Express backend (routes, middleware, DB)
database/      → SQL schema and setup
public/        → Static assets
```

## Deployment

Build the frontend and deploy the Express API to your VPS:

```sh
npm run build          # outputs to dist/
cd api && npm run build && npm start
```
