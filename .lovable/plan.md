

## Plan: Expand Admin Dashboard + Received Cards with Embeds & Usage Limits

### What we're building

The approved plan from the previous message, with two clarifications from the user:

1. **Received Cards show as visual embeds** -- each card renders as a mini business card preview (avatar, name, tagline, domain) rather than a plain list item. Users can see and interact with these visually.

2. **Usage limits protect API keys** -- the card owner sets a limit on how many times their card can be queried/used by recipients. Once the limit is hit, the card stops working. This prevents API key abuse when sharing.

### Database (3 new tables + 1 alteration)

**`ai_preferences`** -- AI training rules per user
- `id`, `user_id`, `system_prompt`, `rules` (jsonb), `personality`, `response_style`, `created_at`, `updated_at`
- RLS: owner-only read/write

**`api_connections`** -- stored API keys per provider
- `id`, `user_id`, `provider` (text), `api_key_encrypted` (text), `model_name` (text), `is_active` (boolean), `created_at`
- RLS: owner-only read/write

**`received_cards`** -- business cards shared to a user (max 20)
- `id`, `owner_id`, `sender_name`, `sender_domain`, `sender_avatar` (text/url), `sender_tagline`, `sender_site_id` (nullable FK to sites), `notes`, `usage_count` (int, default 0), `usage_limit` (int, set by sender), `created_at`
- RLS: owner-only read/write/delete

**Alter `sites` table** -- add `share_usage_limit` (int, default 10) so the card owner controls how many times each shared card can be used before it deactivates.

### Admin Dashboard -- 5 tabs

Refactor `Admin.tsx` into a tabbed layout. Extract existing scraper into its own component.

| Tab | Component | Description |
|-----|-----------|-------------|
| Site Import | `SiteImportTab.tsx` | Existing scraper UI (extracted) |
| Content Manager | `ContentManagerTab.tsx` | View/edit/delete content blocks grouped by site |
| API Connector | `ApiConnectorTab.tsx` | Add API keys for OpenAI, Anthropic, Google, Launch Lemonade; test connection; toggle active provider |
| AI Training | `AiTrainingTab.tsx` | System prompt editor, rules list, response style picker |
| Received Cards | `ReceivedCardsTab.tsx` | Visual card grid (up to 20), each rendered as a mini business card embed with usage counter showing `usage_count / usage_limit` |

### Received Cards -- visual embed design

Each received card renders as a styled mini business card:
```text
┌──────────────────────────┐
│  [Avatar]  Sender Name   │
│           @domain.com    │
│  "Tagline text here"     │
│                          │
│  Uses: 3/10    [Delete]  │
└──────────────────────────┘
```

### Usage limit flow

1. Card owner sets `share_usage_limit` in their site settings (Site Import tab or a settings section)
2. When sharing, the limit is copied to `received_cards.usage_limit`
3. Each time a recipient queries content via the Explore panel on a shared card, `usage_count` increments
4. When `usage_count >= usage_limit`, queries return an "limit reached" message instead of content

### Edge function

**`test-api-connection`** -- accepts provider + key, pings the API, returns success/failure. Added to `config.toml`.

### Files to create/modify

- **Migration SQL**: 3 new tables + alter sites
- **`src/pages/Admin.tsx`**: Refactor into tabbed shell
- **`src/components/admin/SiteImportTab.tsx`**: Extract existing code
- **`src/components/admin/ContentManagerTab.tsx`**: New
- **`src/components/admin/ApiConnectorTab.tsx`**: New
- **`src/components/admin/AiTrainingTab.tsx`**: New
- **`src/components/admin/ReceivedCardsTab.tsx`**: New -- visual card embeds with usage display
- **`supabase/functions/test-api-connection/index.ts`**: New
- **`supabase/config.toml`**: Add function entry

### Build order
1. Database migration (3 tables + sites alteration)
2. Refactor Admin.tsx into tabs, extract Site Import
3. Build Content Manager tab
4. Build API Connector tab + test edge function
5. Build AI Training tab
6. Build Received Cards tab with visual embeds and usage tracking

