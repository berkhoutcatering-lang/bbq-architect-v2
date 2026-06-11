# 34 — Help center `/hulp`

**Type:** Contextual help-articles + AI-help (Sonnet + RAG)
**Source:** `src/app/hulp/page.tsx` + `/api/help/*`

## Wat het moet doen

Sam zit ergens vast (e.g. "hoe stel ik BTW-tarief in?") → opent /hulp → zoekt artikel of stelt vraag aan AI (Sonnet + RAG over help-articles). Contextueel: als Sam vanaf /facturen komt, krijgt hij facturen-gerelateerde artikelen eerst.

## Componenten
- Search-bar met instant-results
- Artikel-grid per hub-categorie
- AI-help drawer (vraag → Sonnet antwoord met cited artikelen)
- Feedback per artikel (helpful? ja/nee + comment)

## Acceptance
1. ✅ Contextual: detecteer "vanaf welke hub" via referrer + suggest relevante artikelen
2. ✅ AI-help via /api/help/contextual met RAG (Sonnet 4.6 + Citations)
3. ✅ Helpful-feedback in help_article_feedback tabel
4. ✅ Search via pg_trgm (al in deps)

## Bevindingen
- ✅ /api/help/contextual + /api/help/feedback bestaan
- ❌ Aantal artikelen onbekend — moet seed-help-articles.mjs zien
- ❌ Geen "Vraag aan Sam"-fallback voor onbeantwoorde vragen

## Design-prompt

```
Bouw een help-center voor catering-software BBQ Architect.

CONTEXT
Pro-tier wil minder support-tickets. /hulp = self-service: zoek artikel
OF stel vraag aan AI. Geen "ticket-systeem" (komt via mail).

LAYOUT
- Sub-tab nav: Instellingen | Gebruikers | Mailbox | Website | Hulp (active) | Admin
- Header: "Help Center" + grote search-bar
- Search-bar instant-results dropdown (max 8 hits)

HOMEPAGE (no search)
- "Meest gelezen" sectie (top 5 articles by views)
- Categorie-grid (per hub):
  - Vandaag (5 articles)
  - Plannen (12)
  - Verkoop (18)
  - Menu (10)
  - Voorraad (8)
  - Geld (15)
  - Systeem (7)

CONTEXTUAL SUGGESTIONS (top-bar)
- Detecteer hub van waar gebruiker kwam (sessionStorage of URL-param)
- Banner: "Vragen over Verkoop? Bekijk deze 3 artikelen"

ARTIKEL-PAGE /hulp/[slug]
- Breadcrumb: Hulp > Categorie > Titel
- Body: BlockNote-rendered content + embedded screenshots
- Sidebar: gerelateerde artikelen + "Was dit nuttig?" feedback
- Footer: "Vraag-en-antwoord met AI" CTA → opens AI-help drawer

AI-HELP DRAWER (rechts slide-in)
- Vraag-input: "Hoe stel ik BTW in?"
- Streaming Sonnet response met:
  - 1-paragraaf antwoord
  - Cited bronnen: "Pulled from: BTW-Tarieven artikel, Facturen-setup artikel"
  - Klikbare artikel-pills naar full-page
- History: laatste 5 vragen van deze user
- Niet-beantwoord? → "Mail Sam" CTA met onderwerp prefilled

FEEDBACK
- Per artikel: 👍 / 👎 + optional comment
- AI-response: dezelfde feedback-loop
- Sam ziet aggregate in /admin/help-stats

COMPONENTS
- shadcn/ui Card, Input, Drawer, Badge
- BlockNote-renderer voor article-body
- Streaming Anthropic SDK voor AI-help
- pg_trgm search (al in DB)

ACCESSIBILITY
- Search: aria-autocomplete + aria-live results-count
- AI-streaming: aria-live="polite"
- Feedback-buttons: aria-pressed

MOBILE
- Categorie-grid 1-koloms
- AI-help drawer full-screen
- Search-bar sticky top

HARD RULES
- AI-help streamt + Citations API (geen hallucinated steps)
- Feedback opslaan in help_article_feedback (FK naar article)
- pg_trgm GIN-index op title + body voor instant search

CONNECTS TO
- help_articles tabel
- help_article_feedback (per-article)
- POST /api/help (search)
- POST /api/help/contextual (AI-help met RAG)
- POST /api/help/feedback
```
