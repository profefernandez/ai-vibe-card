# 60 Watts of Clarity — Codebase Overview

## What It Is

An AI-powered clarity concierge, digital business card / personal website. The owner can import their existing site content, train an AI on it, and share an interactive card where visitors can chat, book meetings, and explore the owner's services. It includes a full admin dashboard for managing all of this.

---

## Tech Stack

| Layer           | Technology                                               |
| --------------- | -------------------------------------------------------- |
| Framework       | React 18 + TypeScript                                    |
| Build tool      | Vite (serves on port **8080**)                           |
| Package manager | **npm**                                                  |
| Styling         | Tailwind CSS + `shadcn/ui` (Radix UI)                    |
| Animation       | Framer Motion                                            |
| Backend / DB    | Self-hosted PostgreSQL + Express API (Scala Hosting VPS) |
| Data fetching   | TanStack React Query                                     |
| Routing         | React Router v6                                          |
| Forms           | react-hook-form + Zod                                    |

> Rate limiting uses `express-rate-limit` with its default in-memory store, so scaling the API beyond one replica multiplies every configured limit by N until a Redis-backed store is wired in.

---

## Project Structure

```
src/
├── main.tsx              # Entry point, mounts <App />
├── App.tsx               # Router + global providers (QueryClient, Toaster, Tooltip, ErrorBoundary)
├── pages/
│   ├── Index.tsx         # Public landing page → renders <HeroSection />
│   ├── Auth.tsx          # Sign in / sign up page (JWT auth against VPS API)
│   ├── Admin.tsx         # Protected admin dashboard (sidebar + tab routing)
│   ├── CardShare.tsx     # Public per-owner card route → renders <CardView />
│   └── NotFound.tsx      # 404 fallback
├── components/
│   ├── ErrorBoundary.tsx # Top-level error boundary
│   ├── card/             # Public card surface (grouped by feature)
│   │   ├── HeroSection.tsx   # Animated card wrapper for /
│   │   ├── CardView.tsx      # Card visual + drag-to-explore gesture
│   │   ├── ExplorePanel.tsx  # AI content search panel (POSTs to lemonade-chat)
│   │   └── SocialLinks.tsx   # Social media icon links
│   ├── admin/            # Admin dashboard tabs
│   │   ├── AdminSidebar.tsx       # Sidebar nav
│   │   ├── SiteImportTab.tsx      # Scrape an existing website via scrape-site API
│   │   ├── KnowledgeBaseTab.tsx   # Browse/edit KB folders + items (was ContentManagerTab)
│   │   ├── ApiConnectorTab.tsx    # Configure external API keys (encrypted)
│   │   ├── AiTrainingTab.tsx      # AI persona, rules, system prompt
│   │   ├── ConnectionsTab.tsx     # View cards/leads (was ReceivedCardsTab)
│   │   ├── ProfileTab.tsx         # Edit public card profile
│   │   ├── SettingsTab.tsx        # App settings
│   │   ├── OnboardingWizard.tsx   # First-run setup
│   │   └── MiniCard.tsx           # Compact card preview used inside admin
│   └── ui/               # shadcn/ui primitives (button, input, card, etc.)
├── lib/
│   ├── apiClient.ts      # 1-line back-compat shim → re-exports from ./api
│   ├── api/              # API client split by resource
│   │   ├── client.ts         # API_BASE, session storage, listener bus, apiFetch()
│   │   ├── auth.ts           # auth.login / register / logout / subscribe
│   │   ├── functions.ts      # functions.invoke()
│   │   ├── upload.ts         # upload.avatar / deleteAvatar / kbImage
│   │   ├── kbImages.ts       # KbImage type + kbImages CRUD
│   │   ├── kb.ts             # KbFolder/KbItem types + kbFolders/kbItems CRUD
│   │   ├── tables.ts         # QueryBuilder + from() (generic CRUD client)
│   │   └── index.ts          # Aggregates apiClient + re-exports types
│   ├── constants.ts      # Shared constants (incl. fallback explore suggestions)
│   ├── formatters.ts     # Display formatters
│   ├── theme.ts          # Theme tokens
│   ├── utils.ts          # cn() utility
│   └── validations.ts    # Zod schemas
├── contexts/
│   └── AuthContext.tsx   # JWT session context, subscribes to apiClient auth events
├── hooks/
│   ├── use-async-data.tsx
│   ├── use-mobile.tsx
│   └── use-toast.ts
├── types/
│   └── index.ts          # Single source of truth for shared TS types
├── assets/
│   └── profile-photo.png # Default profile avatar
└── test/
    ├── setup.ts          # Vitest jsdom setup (jest-dom matchers)
    └── example.test.ts   # Placeholder unit tests

api/
├── index.ts              # Express entry — exports validateEnv(), createApp(), start()
├── db.ts                 # Postgres pools (default + service/RLS-bypass) + withRequestClient
├── logger.ts             # Pino logger
├── middleware/
│   ├── auth.ts           # JWT Bearer verification
│   └── requireRole.ts    # Role-based route guard
├── routes/
│   ├── auth.ts                # /api/auth/login, /register, /refresh, /logout
│   ├── card.ts                # /api/card (owner) + /api/card/:slug (public) + /api/connections
│   ├── feedback.ts            # /api/feedback (HMAC-bound thumbs up/down on AI responses)
│   ├── kb.ts                  # /api/kb/folders + /api/kb/items
│   ├── kbImages.ts            # /api/kb/images CRUD
│   ├── kbUpload.ts            # /api/kb/upload (multipart)
│   ├── tables.ts              # Generic CRUD dispatcher (legacy; being peeled off)
│   ├── upload.ts              # /api/upload/avatar
│   ├── functions.ts           # Mounts /api/functions/* dispatcher (was functions/index.ts)
│   ├── lemonade-chat.ts       # AI chat — calls Lemonade/OpenAI/Anthropic/Google
│   ├── query-content.ts       # AI semantic search over content_blocks
│   ├── scrape-site.ts         # Firecrawl → site_pages + content_blocks
│   ├── refresh-sites.ts       # Cron: re-scrape sites
│   ├── prune-logs.ts          # Cron: log retention
│   ├── verify-domain.ts       # Domain ownership verification
│   └── test-api-connection.ts # Validates external API keys
├── lib/
│   ├── audit.ts          # Audit log writes
│   ├── crypto.ts         # AES-256-GCM (api_connections.api_key_encrypted)
│   ├── email.ts          # Nodemailer transport
│   ├── feedback-token.ts # HMAC-bound feedback tokens
│   ├── safe-fetch.ts     # Request wrapper (retry/timeout) for outbound HTTP
│   ├── sanitise.ts       # LLM input/output prompt-injection guard
│   └── sanitize-content.ts  # HTML scrub for scraped pages (NOT a duplicate of sanitise.ts)
├── migrations/           # node-pg-migrate (TypeScript)
├── scripts/              # Ops/seed scripts (test-rls-isolation, audit-api-keys, seed-user, …)
└── test/
    ├── helpers/
    │   ├── build-app.ts       # Test wrapper → calls createApp() (no listen)
    │   ├── db-fixtures.ts     # truncateAll, createOrgWithOwner
    │   ├── global-setup.ts    # Drops/creates aivibe_test_db, runs migrations
    │   └── setup-env.ts       # Per-worker env (NODE_ENV=test, fixture secrets)
    └── integration/
        ├── auth.test.ts       # register → login → JWT-protected route
        └── rls.test.ts        # Cross-org RLS isolation (uses rls_test_user role)

database/
  setup.sql              # Full self-hosted PostgreSQL schema (legacy reference; live schema lives in api/migrations/)

.github/workflows/
  test.yml               # CI: frontend + API tests against postgres:16 service
  deploy.yml             # CD: rsync + docker compose up to VPS on push to main
```

---

## Pages & Routes

| Route    | Component               | Auth Required              |
| -------- | ----------------------- | -------------------------- |
| `/`      | `Index` → `HeroSection` | No                         |
| `/auth`  | `Auth`                  | No                         |
| `/admin` | `Admin`                 | Yes (redirects to `/auth`) |
| `*`      | `NotFound`              | No                         |

---

## Key Features

### Public Card (`/`)
- Animated card with drag gesture (left-swipe opens **ExplorePanel**)
- Profile data (name, bio, photo, Calendly URL) fetched from the `profiles` table via VPS REST API
- Fallback defaults if no profile is configured
- Book a meeting button (links to Calendly)
- Social links

### Explore Panel
- Typed or suggestion-based queries
- Calls the `query-content` API endpoint (`POST /api/functions/query-content`)
- Returns formatted content blocks rendered as Markdown

### Admin Dashboard (`/admin`)
- Protected by JWT session (stored in localStorage)
- **Site Import** — enter a domain, triggers `scrape-site` API endpoint, stores pages as content blocks
- **Knowledge Base** — folders + items used as AI grounding context (replaces legacy Content Manager)
- **AI Training** — set AI personality, response style, custom rules, system prompt
- **API Connectors** — configure external service API keys (stored encrypted)
- **Connections** — view visitor card exchanges / leads (renamed from Received Cards)
- **Profile** — edit the public card's display information
- **Settings** — miscellaneous app settings
- **Onboarding Wizard** — first-run setup flow

---

## Database Tables

| Table             | Purpose                                                    |
| ----------------- | ---------------------------------------------------------- |
| `users`           | Auth accounts (email + bcrypt password hash). NOTE: the columns `reset_token` and `reset_token_expires_at` exist in the schema (initial migration) but no route currently reads or writes them — password reset is **not yet implemented**. The columns are retained pending that feature; do not drop without coordinating with whoever picks up the reset flow. |
| `profiles`        | Owner's public card info (name, bio, avatar, Calendly URL) |
| `sites`           | Imported sites (domain, scrape status, page count)         |
| `site_pages`      | Raw scraped pages (markdown, html, metadata JSONB)         |
| `content_blocks`  | Parsed content (heading, body, images[], tags[], category) |
| `ai_preferences`  | AI persona config (personality, system_prompt, rules)      |
| `api_connections` | External API keys per user (AES-256-GCM encrypted)         |
| `received_cards`  | Visitor card exchanges / leads                             |
| `organizations`   | Org tenancy boundary for RLS                               |
| `memberships`     | User ↔ org with role                                       |
| `kb_folders`      | KB folders (per site, flag `use_for_ai` opts into AI context) |
| `kb_items`        | KB items — text/url/image/file (citable unit for AI grounding) |
| `kb_images`       | KB image metadata + storage refs                           |
| `feedback`        | Thumbs up/down on AI responses (HMAC-bound feedback tokens) |
| `sessions`        | Refresh-token sessions (per JWT issuance)                  |

---

## Environment Variables

**Frontend** (`.env` in project root):
```env
# URL of the Express API. In dev, Vite proxies /api → localhost:3001.
VITE_API_URL="/api"
```

**API server** (`api/.env` or set in SPanel secrets):
```env
DATABASE_URL=postgresql://aivibe_user:<password>@127.0.0.1:5432/aivibe_db
JWT_SECRET=<32+ char random string>
FIRECRAWL_API_KEY=<key>
AI_API_URL=<AI gateway base URL>
AI_API_KEY=<AI gateway key>
AI_MODEL=gpt-4o-mini
PORT=3001
```

---

## Development Commands

```bash
# Install dependencies (root + api)
npm install
(cd api && npm install)

# Start frontend dev server (http://localhost:8080)
npm run dev

# Start API dev server (http://localhost:3001)
(cd api && npm run dev)

# Postgres (local docker)
docker start aivibe-pg

# Build for production
npm run build

# Run tests (frontend)
npm test

# Run tests (API — requires postgres + creates aivibe_test_db)
(cd api && npm test)
```

Tests are split between root (Vitest + jsdom for components) and `api/` (Vitest + supertest for routes, Vitest + raw `pg` for RLS). CI in `.github/workflows/test.yml` runs both against a postgres:16-alpine service.

---

## Path Aliases

`@/` maps to `src/` — e.g. `import { apiClient } from "@/lib/apiClient"`.
