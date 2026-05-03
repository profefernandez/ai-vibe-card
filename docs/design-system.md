# Design Tokens & Admin Fields Contract

This document is the Phase 0 contract for the redesign, admin-driven theming, and Supabase migration. The public card should become a render-only skeleton: it reads a published theme document plus profile/content data, then renders without making visual decisions in component code.

## Current admin controls

- **Settings**: theme mode, accent color, card font preset, SEO/Open Graph fields, robots/crawler policy, cross-card AI query toggle, share usage limits.
- **Profile**: identity content, avatar, CTA, social links, services, public card copy.
- **AI Training**: AI persona, prompt, rules, response style, safety settings.
- **Knowledge Base**: folders, text/url/image/file items, KB images used by the card gallery.
- **Site Import**: imported site/domain data and scraped content.
- **API Connectors**: encrypted external provider credentials.
- **Connections**: visitor card exchanges and approved connections.

## Current public card render surface

The public card is currently rendered by these components:

- `CardView`
- `HeroSection`
- `HeroSlider`
- `PhotoStage`
- `FeatureIcons`
- `FooterBar`
- `SocialLinks`
- `ExplorePanel`

These components still contain hard-coded visual choices and must be skeletonized in later phases.

## Hard-coded front-end decisions to convert into admin fields

| Area                   | Current source                                                                    | Future admin-owned fields                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Color palette          | `tailwind.config.ts`, `src/index.css`, `src/lib/theme.ts`, card component classes | `mode`, `accent`, `cardBackground`, `cardForeground`, `mutedText`, `borderColor`, `linkColor`, `gradientStops` |
| Typography             | `src/index.css`, `src/lib/theme.ts`, card text classes                            | `fontHeading`, `fontBody`, `fontMono`, `scale`, `weightHeading`, `weightBody`, `letterSpacing`, `lineHeight`   |
| Shape                  | Tailwind radius utilities and inline style                                        | `radius`, `borderWidth`, `photoShape`, `photoFrame`, button/card shape variants                                |
| Depth                  | Tailwind shadow utilities and inline style                                        | `shadow`                                                                                                       |
| Spacing/layout density | Tailwind spacing utilities and grid classes                                       | `density`, `containerWidth`, `sectionOrder`, `mobileSectionOrder`                                              |
| Hero behavior          | `HeroSlider`, `PhotoStage`, `CardView` layout                                     | `heroVariant`, slider timing, photo stage style                                                                |
| Motion                 | Framer Motion values in card components                                           | `motionLevel` mapped to approved presets                                                                       |
| Responsive behavior    | Viewport breakpoints in class names                                               | `mobileSectionOrder`, container-query-driven layout rules                                                      |
| Icon set               | `FeatureIcons` fixed icon list                                                    | curated icon set/variant field                                                                                 |

## Target stack contract

- **Database, auth, storage, realtime**: Supabase Postgres with RLS, Supabase Auth, Supabase Storage, optional Realtime.
- **API**: Supabase Edge Functions for secret-bearing or service-role operations: Lemonade, Firecrawl, AI gateway calls, email, scraping, domain verification, refresh/prune jobs, audit writes.
- **Web hosting**: Vercel or Netlify for the Vite SPA.
- **Cron**: Supabase scheduled Edge Functions.
- **Design/runtime libraries**: keep shadcn/ui, Radix, Tailwind, Framer Motion, `class-variance-authority`, `react-hook-form`, and `zod`; add new libraries only in the implementation PR that uses them.

## Runtime assets to retire after cutover

These remain until the Supabase/Vercel cutover is complete, then should be removed in the teardown phase:

- Scala Hosting VPS / SPanel NodeJS Manager
- Apache or nginx reverse proxy configuration
- PM2-managed Express process
- self-hosted PostgreSQL setup
- `api/`
- `deploy.sh`
- `deploy/`
- `Dockerfile.api`
- `Dockerfile.web`
- `docker-compose.yml`
- `cron/refresh-sites.sh`
- `database/setup.sql`
- SPanel-specific agent instructions

## Theme document shape

The canonical schema lives in `src/lib/validations.ts` as `cardThemeSchema`. Store this as a JSONB document on `profiles` or in a dedicated `card_theme` table during the Supabase migration. The preferred Supabase shape is a dedicated `card_theme` row per user with `is_published` and version rows in `card_theme_versions`.

### Color

- `mode`: `light | dark | auto`
- `accent`: curated slug or validated color string
- `cardBackground`
- `cardForeground`
- `mutedText`
- `borderColor`
- `linkColor`
- `gradientStops`: optional 2–4 color stops

### Typography

- `fontHeading`: curated font slug
- `fontBody`: curated font slug
- `fontMono`: curated font slug
- `scale`: `compact | comfortable | spacious`
- `weightHeading`: `400 | 500 | 600 | 700 | 800`
- `weightBody`: `300 | 400 | 500 | 600`
- `letterSpacing`: `tight | normal | wide`
- `lineHeight`: `compact | normal | relaxed`

### Shape

- `radius`: `sm | md | lg | xl | full`
- `shadow`: `none | soft | lifted | dramatic`
- `borderWidth`: `none | hairline | thin | medium`

### Layout

- `density`: `cozy | standard | airy`
- `heroVariant`: `slider | photo-stage | minimal | split`
- `sectionOrder`: drag-orderable desktop section IDs
- `mobileSectionOrder`: separate mobile section IDs
- `containerWidth`: `narrow | standard | wide | full`

### Motion

- `motionLevel`: `none | subtle | expressive`

### Imagery

- `photoShape`: `circle | squircle | rounded-rect`
- `photoFrame`: `none | ring | glow`

## Public read and RLS expectations

- Draft theme rows are owner-only.
- Published theme rows must be anonymously readable for `/c/:slug`.
- Writes are owner-only.
- Edge Functions may use the service role only for service-only operations; regular user reads/writes should forward the user's JWT and let RLS enforce ownership.

## Definition of done for later phases

- Every visible card decision maps to a field in `cardThemeSchema`.
- The card render path accepts profile/content/theme data and does not hard-code color, font, spacing, shape, layout, or motion choices.
- Admin can preview unsaved token changes through the same `applyTheme` pipeline used by the public card.
- Supabase RLS tests prove user A cannot read or mutate user B's private rows.
