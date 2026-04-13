# AI Vibe Card — Codebase Overview

## What It Is

An AI-powered digital business card / personal website. The owner can import their existing site content, train an AI on it, and share an interactive card where visitors can chat, book meetings, and explore the owner's services. It includes a full admin dashboard for managing all of this.

---

## Tech Stack

| Layer           | Technology                                               |
| --------------- | -------------------------------------------------------- |
| Framework       | React 18 + TypeScript                                    |
| Build tool      | Vite (serves on port **8080**)                           |
| Package manager | **Bun**                                                  |
| Styling         | Tailwind CSS + `shadcn/ui` (Radix UI)                    |
| Animation       | Framer Motion                                            |
| Backend / DB    | Self-hosted PostgreSQL + Express API (Scala Hosting VPS) |
| Data fetching   | TanStack React Query                                     |
| Routing         | React Router v6                                          |
| Forms           | react-hook-form + Zod                                    |

---

## Project Structure

```
src/
├── main.tsx              # Entry point, mounts <App />
├── App.tsx               # Router + global providers (QueryClient, Toaster, Tooltip)
├── pages/
│   ├── Index.tsx         # Public landing page → renders <HeroSection />
│   ├── Auth.tsx          # Sign in / sign up page (JWT auth against VPS API)
│   ├── Admin.tsx         # Protected admin dashboard (sidebar + tab routing)
│   └── NotFound.tsx      # 404 fallback
├── components/
│   ├── HeroSection.tsx   # Main animated business card (drag-to-explore gesture)
│   ├── ExplorePanel.tsx  # AI content search panel (calls lemonade-chat with site context)
│   ├── AiChatAgent.tsx   # Full AI chat agent component
│   ├── SocialLinks.tsx   # Social media icon links
│   ├── LinkCategories.tsx
│   ├── NavLink.tsx
│   ├── ServicesSection.tsx
│   ├── ValueProps.tsx
│   └── admin/            # Admin dashboard tab components
│       ├── AdminSidebar.tsx        # Sidebar nav (import/content/ai/cards/api/profile/settings)
│       ├── SiteImportTab.tsx       # Scrape an existing website via VPS scrape-site API
│       ├── ContentManagerTab.tsx   # Browse/edit scraped content blocks
│       ├── ApiConnectorTab.tsx     # Connect external APIs (OpenAI key, etc.)
│       ├── AiTrainingTab.tsx       # Configure AI persona, rules, system prompt
│       ├── ReceivedCardsTab.tsx    # View cards/leads received from visitors
│       ├── ProfileTab.tsx          # Edit profile (name, bio, photo, Calendly URL)
│       └── SettingsTab.tsx         # App settings
├── integrations/
│   └── api/
│       ├── client.ts     # VPS REST client (reads VITE_API_URL env var)
│       └── types.ts      # TypeScript types (kept for reference)
├── lib/
│   └── utils.ts          # `cn()` utility (clsx + tailwind-merge)
├── hooks/
│   ├── use-mobile.tsx    # Detect mobile breakpoint
│   └── use-toast.ts      # Toast notification hook
└── components/ui/        # shadcn/ui primitive components (button, input, card, etc.)

api/
├── index.ts              # Express server entry point (port 3001)
├── db.ts                 # PostgreSQL pool (pg)
├── middleware/
│   └── auth.ts           # JWT Bearer token verification
└── routes/
    ├── auth.ts           # POST /api/auth/login, /api/auth/register
    ├── tables.ts         # Generic CRUD: GET/POST/PATCH/DELETE /api/tables/:table
    └── functions/
        ├── index.ts          # Mounts function handlers
        ├── scrape-site.ts    # Firecrawl → stores site_pages + content_blocks
        ├── query-content.ts  # AI semantic search over content_blocks
        └── test-api-connection.ts  # Validates external API keys

database/
  setup.sql             → Full self-hosted PostgreSQL schema for Scala Hosting VPS
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
- **Content Manager** — browse/edit/delete content blocks per site
- **AI Training** — set AI personality, response style, custom rules, system prompt
- **API Connectors** — configure external service API keys (stored encrypted)
- **Received Cards** — view visitor interactions / leads
- **Profile** — edit the public card's display information
- **Settings** — miscellaneous app settings

---

## Database Tables

| Table             | Purpose                                                    |
| ----------------- | ---------------------------------------------------------- |
| `users`           | Auth accounts (email + bcrypt password hash)               |
| `profiles`        | Owner's public card info (name, bio, avatar, Calendly URL) |
| `sites`           | Imported sites (domain, scrape status, page count)         |
| `site_pages`      | Raw scraped pages (markdown, html, metadata JSONB)         |
| `content_blocks`  | Parsed content (heading, body, images[], tags[], category) |
| `ai_preferences`  | AI persona config (personality, system_prompt, rules)      |
| `api_connections` | External API keys per user                                 |
| `received_cards`  | Visitor card exchanges / leads                             |

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
# Install dependencies
bun install

# Start dev server (http://localhost:8080)
bun run dev

# Build for production
bun run build

# Run tests
bun run test
```

---

## Path Aliases

`@/` maps to `src/` — e.g. `import { apiClient } from "@/lib/apiClient"`.
