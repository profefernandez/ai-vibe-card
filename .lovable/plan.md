

## Plan: Add Left Sidebar Navigation to Admin Dashboard

Replace the current top tab bar with a collapsible left sidebar using the Shadcn Sidebar component. Add new sections for Settings, Profile (business card info editor), and keep existing tabs as sidebar nav items.

### New Database Table

**`profiles`** -- stores editable business card info per user
- `id`, `user_id`, `display_name`, `tagline`, `bio`, `avatar_url`, `calendly_url`, `created_at`, `updated_at`
- RLS: owner read/write only

### Sidebar Navigation Items

| Icon | Label | Route/Section |
|------|-------|---------------|
| Globe | Site Import | existing tab |
| FileText | Content | existing tab |
| Brain | AI Training | existing tab |
| CreditCard | Received Cards | existing tab |
| Plug | API Connectors | existing tab |
| User | Profile / Card Info | **new** -- edit name, tagline, bio, avatar, Calendly link |
| Settings | Settings | **new** -- general preferences, share usage limits |

### Files to Create/Modify

1. **Database migration** -- `profiles` table with RLS
2. **`src/components/admin/AdminSidebar.tsx`** -- new sidebar component with all nav items, collapsible
3. **`src/components/admin/ProfileTab.tsx`** -- new form to edit business card details (name, tagline, bio, avatar URL, Calendly link) stored in `profiles` table
4. **`src/components/admin/SettingsTab.tsx`** -- new general settings (share usage limit defaults, etc.)
5. **`src/pages/Admin.tsx`** -- refactor from top tabs to `SidebarProvider` + sidebar layout, content area renders selected section via state

### Layout Structure

```text
┌────────────────────────────────────────────────┐
│ SidebarProvider (w-full)                       │
│ ┌──────────┬───────────────────────────────────┐│
│ │ Sidebar  │  Header (trigger + title + logout)││
│ │          │───────────────────────────────────││
│ │ Site Imp │  <Active Section Content>         ││
│ │ Content  │                                   ││
│ │ AI Train │                                   ││
│ │ Cards    │                                   ││
│ │ ──────── │                                   ││
│ │ API Conn │                                   ││
│ │ Profile  │                                   ││
│ │ Settings │                                   ││
│ │          │                                   ││
│ │ [Back]   │                                   ││
│ └──────────┴───────────────────────────────────┘│
└────────────────────────────────────────────────┘
```

The sidebar collapses to icon-only mode on smaller screens. Each nav item updates state to render the corresponding tab component in the main content area (no routing changes needed).

### Build Order
1. Create `profiles` table migration
2. Create `AdminSidebar.tsx`
3. Create `ProfileTab.tsx` (business card info form)
4. Create `SettingsTab.tsx`
5. Refactor `Admin.tsx` to sidebar layout

