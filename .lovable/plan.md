

## Plan: Transforming Business Card into Chat UI with Side Panel Layout

### What happens today
- The hero is a single vertical card with branding, photo, social links, CTAs, and an inline chat input at the bottom
- When a user submits a message, a full-screen overlay chat panel slides up from the bottom, completely hiding the card

### What we'll build

**Two states of the same card, with a seamless animated transition:**

**State 1 — Business Card (default)**
- Make the card taller and more spacious (larger text, more padding, bigger photo)
- All branding elements stacked vertically as they are now

**State 2 — Chat Mode (after typing in "Ask Watts anything")**
- The card expands to a wider layout (e.g. `max-w-4xl`)
- Branding elements animate out to a **left sidebar** panel within the card:
  - "60 Watts of Clarity" title at the top of the sidebar
  - Profile photo, name, title, mission statement
  - Social links
  - Book a Call + Ask Watts buttons
  - All contained in a bordered business card column
- The **right/center area** becomes the chat interface (messages + input)
- A close button lets users collapse back to the business card state
- On mobile: the sidebar collapses or stacks above the chat

```text
┌─────────────────────────────────────────────┐
│  ┌─────────────┐  ┌──────────────────────┐  │
│  │ 60 Watts... │  │  Ask Watts (chat)    │  │
│  │  [photo]    │  │  ┌────────────────┐  │  │
│  │ Tanya W.    │  │  │ messages...    │  │  │
│  │ Founder     │  │  │                │  │  │
│  │ Mission...  │  │  │                │  │  │
│  │ [socials]   │  │  └────────────────┘  │  │
│  │ [Book Call] │  │  [Type your question] │  │
│  │ [Ask Watts] │  │                      │  │
│  └─────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────┘
```

### Technical approach

1. **Lift chat state up** — Move `isExpanded` state from `AiChatBar` into `HeroSection` so the parent controls the layout transition

2. **HeroSection.tsx** — Major refactor:
   - Add `isChatOpen` state
   - Use `framer-motion` `layout` animations on the card container to animate width changes (`max-w-lg` → `max-w-4xl`)
   - When `isChatOpen=false`: render current vertical business card layout (with slightly larger sizing)
   - When `isChatOpen=true`: render a two-column grid — left column has the branding (business card sidebar), right column has the `AiChatAgent` component directly embedded
   - Animate the transition with `AnimatePresence` and `layout` props

3. **AiChatBar.tsx** — Simplify:
   - Remove the full-screen overlay expansion logic
   - The inline input bar triggers `onExpand` callback to parent instead of managing its own overlay
   - Pass `isExpanded` and `onClose` props from parent

4. **Make the card bigger in default state**:
   - Increase heading from `text-4xl` to `text-5xl`
   - Increase photo from `w-28 h-28` to `w-32 h-32`
   - Add more vertical spacing between elements

5. **Mobile handling**: On small screens, the chat will take the full card and the branding sidebar will collapse to a compact header strip

### Files to modify
- `src/components/HeroSection.tsx` — Major refactor for two-state layout
- `src/components/AiChatBar.tsx` — Simplify to delegate expansion to parent
- `src/index.css` — Any needed transition utilities

