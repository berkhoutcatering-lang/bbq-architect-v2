# 38 — AI Chat `/ai-chat`

**Type:** Persistent AI-assistant chat (Haiku streaming + tool-use)
**Source:** `src/app/ai-chat/page.tsx` + `/api/chat`

## Wat het moet doen

Sam typt vraag/instructie aan "Rook" (de AI). Haiku streamt antwoord. AI heeft tool-use voor: get_event_detail, list_upcoming_events, search_gerechten, create_klant, draft_email, etc. (~42 action-types). Plus respond_with_blocks tool voor structured output (nav-card, action-card, info, metric).

## Componenten
- Chat-stream UI (Sonner-stijl messages)
- Input-textarea met Enter-to-send + ⌘Enter voor newline
- Action-cards (klikbaar → execute action)
- ChatPanel (block-first per page) + ⌘K Vraag-Rook voor inline
- Persistent thread (folder-organisatie)

## Acceptance
1. ✅ Streaming UX <500ms first-token
2. ✅ Rate-limit 30 chat-requests/min/user
3. ✅ Thinking-mode toggle (slow but thoughtful Opus)
4. ✅ Tool-use audited in ai_action_proposals (Sam confirms before execute)
5. ✅ Cross-page persist (5min TTL localStorage AiStudioContext)

## Bevindingen
- ✅ APK confirmed: 547 AI-calls deze maand, €9.82 spend (Haiku-routing efficient)
- ✅ respond_with_blocks pattern in chat-route.ts
- ✅ 42 action-types via ACTION_TYPES registry (geen bbq-tools.ts — false alarm)
- ❌ AiAssistant 1865 regels = onderhoudslast (UX-master noemt refactor)

## Design-prompt

```
Bouw een persistent AI-chat-assistant voor catering-software BBQ Architect.

CONTEXT
Sam stelt vragen aan "Rook" (AI-naam, gepersonaliseerd). Haiku-streaming
voor speed, Sonnet/Opus voor zwaarder werk. Tool-use voor 42 acties
(get_event/list_events/create_klant/draft_email/etc.). Cross-page-persist
zodat Sam van /vandaag naar /offertes navigatie de conversatie behoudt.

LAYOUT
- 3 entry-points:
  1. /ai-chat full-page chat
  2. ChatPanel (block-first per page, sidebar-mode)
  3. ⌘K Vraag-Rook (1-shot quick-query, geen historie)

FULL-PAGE LAYOUT (/ai-chat)
- Sidebar links: thread-folders (Persoonlijk / Werk / Klanten / Recipes)
- Main: chat-stream
  - Per message: avatar + content + timestamp
  - Streaming-cursor tijdens typing
  - Action-cards (klikbaar)
  - Code-blocks met syntax-highlighting
- Footer input:
  - Textarea (auto-grow tot 6 rows)
  - Toolbar: model-picker (Haiku/Sonnet/Opus) + thinking-toggle + file-attach
  - "Verstuur" CTA + Enter-to-send shortcut

CHATPANEL (per-page block-first)
- Sidebar-mode rechts (300px wide)
- Toont contextueel pre-filled questions per page
- e.g. op /financien: "Hoe staat marge?" / "Waar mist foodcost?" / "Q1 BTW concept"
- Inline-replies appearen onder elke vraag
- Geen multi-turn conversatie (1-shot per question)

⌘K VRAAG-ROOK (palette-mode)
- Open ⌘K → typ vraag direct
- AI-antwoord in dialog-overlay
- Action-cards triggerable
- Sluit = geen historie bewaard (ephemeral)

TOOL-USE FLOW (action-cards)
- AI suggesteert action: "Maak klant 'Jan Jansen' aan? [ja] [nee]"
- ja → POST /api/ai-execute met action-type+params
- Audit-log in ai_action_proposals (Sam confirms before execute)
- Result toast: "Klant aangemaakt → naar /klanten/[id]"

RESPOND_WITH_BLOCKS TOOL
- AI returnt structured blocks:
  - nav_card: link naar specifieke route
  - action_card: 1-klik actie (zoals boven)
  - info_block: pure-info paragraaf
  - metric_block: KPI-getal met label
- UI rendert per block-type

THREADING (full-page only)
- Folders: organize threads per categorie
- Per thread: title (AI-summary van eerste message) + last-update
- Search-bar in sidebar (instant-match)

COST-CAP
- AI-cost per thread bijgehouden
- "Deze thread heeft je €0.12 gekost" footer
- Pro-tier hard-cap @ €15 = lock met "Upgrade naar Enterprise"

COMPONENTS
- shadcn/ui ScrollArea, Card, Badge, Sheet
- Streaming Anthropic SDK (al in deps)
- React-Markdown voor message-rendering
- cmdk voor ⌘K mode

ACCESSIBILITY
- Streaming-cursor: aria-busy
- Action-cards: aria-label "Klik om klant aan te maken"
- ⌘K dialog: focus-trap + ESC

MOBILE
- Full-page chat = full-screen
- ChatPanel = bottom-sheet-mode
- ⌘K = drawer-from-bottom

HARD RULES (kritiek)
- Customer-input NOOIT direct in prompt zonder delimiters (OWASP LLM01)
- Tool-use audit-log in ai_action_proposals (verplicht)
- Cost-cap server-side enforced via ai_usage tracking
- Rate-limit 30/min/user (al gebouwd)
- Cached prompt-prefix (system + brand-voice) — Haiku/Sonnet 90% off cache-hits

CONNECTS TO
- POST /api/chat (main endpoint, streaming)
- POST /api/ai-execute (tool-use dispatcher)
- ai_usage (cost-tracking)
- ai_action_proposals (audit-log voor tool-use)
- ai_conversation_folders (threading)
- 42 action-types registry
- ChatPanel + ⌘K Vraag-Rook (extra entry-points)
```
