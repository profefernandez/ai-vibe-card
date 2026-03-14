

## Hero-First Landing Page for 60 Watts of Clarity

### The Problem with Current Layout
Right now it's a vertical list of links — functional but passive. It doesn't **sell**. The user wants a page that actively converts visitors while the AI agent acts as a live concierge.

### The Vision: A Strategic Sales Page with Embedded AI Concierge

Instead of a Linktree clone, this becomes a **single-page sales experience** with the AI woven into the fabric of the page — not floating on top of it.

### Layout Architecture (mobile-first, full-viewport sections)

```text
┌─────────────────────────────────┐
│  HERO (100vh)                   │
│  ┌───────────────────────────┐  │
│  │ Profile photo + Name      │  │
│  │ Bold tagline               │  │
│  │ "AI for Social Work"       │  │
│  │                            │  │
│  │ Social icons (row)         │  │
│  │                            │  │
│  │ [Book a Call]  [Ask Watts] │  │
│  │     ↑ CTA          ↑ opens │  │
│  │                  inline AI │  │
│  └───────────────────────────┘  │
│  ↓ scroll indicator             │
├─────────────────────────────────┤
│  WHAT I DO (problem → solution) │
│  3 value props with icons       │
│  Short punchy copy              │
├─────────────────────────────────┤
│  SERVICES & PRICING             │
│  Tiered cards with clear CTAs   │
│  Each card: "Ask Watts about    │
│  this" button → opens chat      │
│  pre-filled with that service   │
├─────────────────────────────────┤
│  RESOURCES & LINKS              │
│  Categorized link cards         │
├─────────────────────────────────┤
│  FOOTER with social + copyright │
└─────────────────────────────────┘

AI: Persistent bottom bar (not a FAB)
┌─────────────────────────────────┐
│ ✨ Ask Watts anything...  [Send]│
└─────────────────────────────────┘
Expands upward into a chat panel when tapped.
```

### What Makes This Innovative

1. **AI as a persistent input bar** — always visible at the bottom like iMessage. Not hidden behind a bubble. The AI *is* the navigation. Users can type "schedule a call" or "what's the cheapest option?" and get answers + actions.

2. **Service cards have "Ask about this" buttons** — tapping pre-fills the AI chat with a question about that specific service, blurring the line between browsing and conversing.

3. **Hero section with dual CTAs** — "Book a Call" (direct action) and "Ask Watts" (scrolls to/focuses the AI input bar). Two conversion paths.

4. **Value proposition section** — Before showing pricing, a section that frames the problem ("AI is transforming social work") and the solution ("Learn, Build, Deploy — ethically"). This sells before listing prices.

5. **Full-viewport hero** — The profile, tagline, social icons, and CTAs fill the screen. No scrolling needed to understand what this is.

### Technical Plan

| File | Change |
|---|---|
| `src/pages/Index.tsx` | Restructure into hero (100vh) + value props + services + resources + footer. Add persistent AI bar at bottom. |
| `src/components/HeroSection.tsx` | **New** — Full-screen hero with photo, name, tagline, social icons, dual CTAs. Scroll indicator animation. |
| `src/components/ValueProps.tsx` | **New** — 3-column (stacked on mobile) section: "Learn AI Literacy", "Build AI Agents", "Deploy Ethically". |
| `src/components/ServicesSection.tsx` | Restyle as sales cards. Add "Ask Watts about this" button per card that triggers chat with pre-filled question. |
| `src/components/LinkCategories.tsx` | Keep but restyle to match new aesthetic. |
| `src/components/AiChatBar.tsx` | **New** — Replace floating bubble with a persistent bottom input bar. Expands into a slide-up chat panel. Service "Ask about this" buttons pre-fill the input. |
| `src/components/AiChatBubble.tsx` | **Delete** — replaced by AiChatBar. |
| `src/components/ProfileHeader.tsx` | **Delete** — absorbed into HeroSection. |
| `src/components/SocialLinks.tsx` | Keep as-is, imported into HeroSection. |
| `src/components/AiChatAgent.tsx` | Keep chat logic, minor updates to accept pre-filled messages from service cards. |

### State Management
- A simple React context or callback prop to allow service cards to send a pre-filled message to the AI bar (e.g., `onAskAbout("Tell me about the AI Agent Build service")`).

