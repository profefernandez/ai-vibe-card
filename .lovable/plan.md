

## Plan: Website Import Pipeline — Scrape, Store, and Render

### The Idea

The founder (or any future customer) enters their website domain, authorizes it, and the system scrapes their site. That scraped content (text, images, page structure) gets stored in the backend. When a visitor uses the Explore panel and asks a question, the AI matches the query to the stored content and renders the relevant sections visually — no traditional chat, just dynamically pulled website fragments.

### Architecture

```text
┌──────────────────────┐     ┌───────────────┐     ┌──────────────────┐
│  Founder Admin Panel │────▶│  Edge Function │────▶│  Firecrawl API   │
│  (enter domain,      │     │  (scrape proxy)│     │  (web scraper)   │
│   authorize, scrape) │     └───────┬───────┘     └──────────────────┘
└──────────────────────┘             │
                                     ▼
                            ┌───────────────────┐
                            │  Database Tables   │
                            │  - sites           │
                            │  - site_pages      │
                            │  - content_blocks  │
                            └───────┬───────────┘
                                     │
          ┌──────────────────────────┤
          ▼                          ▼
┌──────────────────┐     ┌──────────────────────┐
│  AI Edge Function│     │   Explore Panel       │
│  (match query to │────▶│   (renders matched    │
│   content blocks)│     │    content visually)  │
└──────────────────┘     └──────────────────────┘
```

### What we'll build (Phase 1)

**1. Database tables** (3 tables via migration):
- **`sites`** — stores authorized domains (domain, name, scrape status, owner config)
- **`site_pages`** — individual scraped pages (URL, title, raw markdown, html, metadata)
- **`content_blocks`** — parsed content chunks from each page (heading, body text, images, category/tags) — these are what the AI selects from when rendering

**2. Firecrawl integration** for web scraping:
- Connect the Firecrawl connector (available in Lovable)
- Create an edge function that accepts a domain, crawls it via Firecrawl, and stores each page's content into `site_pages`
- A second processing step parses pages into `content_blocks` (sections with headings, text, images)

**3. Founder Admin page** (`/admin`):
- Simple form: enter domain URL, click "Import Site"
- Shows scrape progress and list of imported pages
- Ability to review/edit content blocks before they go live
- Protected behind authentication (founder only)

**4. AI query-to-content matching** (edge function):
- Takes the user's search query from the Explore panel
- Uses Lovable AI (built-in, no API key needed) to match the query against stored content blocks
- Returns the matching blocks with their text, images, and metadata

**5. Update ExplorePanel rendering**:
- Replace the placeholder skeleton blocks with real rendered content
- Each content block renders as a styled section (heading + text + optional image)
- No chat bubbles — just visual website sections appearing dynamically

### Technical details

- **Firecrawl** is available as a connector — we'll use `standard_connectors--connect` to set it up, then create edge functions to call the Firecrawl API for crawling
- **Content block parsing**: After scraping, we split markdown by headings (h1, h2, h3) into individual blocks, each stored with its heading, body, and any image URLs found within
- **AI matching**: An edge function uses Lovable AI (e.g. `gemini-2.5-flash`) to rank which content blocks best answer the query, returning the top 3-5
- **Auth**: We'll add simple founder authentication so only the site owner can access `/admin` and trigger scrapes
- **RLS policies**: Sites and content are public-read (visitors need to see them), but write-access is restricted to the authenticated founder

### Files to create/modify
- **Database migration**: `sites`, `site_pages`, `content_blocks` tables + RLS
- **Edge functions**: `scrape-site` (Firecrawl crawl), `process-pages` (parse into blocks), `query-content` (AI matching)
- **`src/pages/Admin.tsx`** — founder dashboard for domain import
- **`src/components/ExplorePanel.tsx`** — wire up to `query-content` edge function, render real blocks
- **`src/App.tsx`** — add `/admin` route

### Build order
1. Connect Firecrawl connector
2. Create database tables
3. Build scrape edge function + admin page
4. Build content parsing logic
5. Build AI query matching edge function
6. Wire ExplorePanel to render real content

