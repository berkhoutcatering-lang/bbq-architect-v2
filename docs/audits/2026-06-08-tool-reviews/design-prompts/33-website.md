# 33 — Website-editor `/website`

**Type:** White-label public-site editor (lichte CMS)
**Source:** `src/app/website/page.tsx`

## Wat het moet doen

Sam heeft een publieke site (`{slug}.bbq-architect.nl` of custom domain). Beheert: hero-text, sfeerfoto, menu-preview (uit gerechten), FAQ, galerij. Wijzigingen direct live op publieke site.

## Componenten
- Section-editor (hero / over / menu / galerij / FAQ / contact)
- Live preview-iframe
- Per-section: BlockNote-text + photo-upload
- "Publish"-knop met versioning

## Acceptance
1. ✅ Theming cascadet uit settings (zelfde tokens als /q/[token])
2. ✅ Photo-upload naar website-images bucket (10MB)
3. ✅ FAQ-sectie publiek leesbaar via website_faq RLS
4. ✅ Domain-routing via Vercel Platforms

## Bevindingen
- ✅ website_* tabellen al gestructureerd (hero/gerechten/faq/gallery)
- ❌ Geen versioning (publish = direct live, geen rollback)
- ❌ Custom domain alleen Enterprise-tier

## Design-prompt

```
Bouw een website-editor voor catering-software BBQ Architect.

CONTEXT
Pro/Enterprise-tenants krijgen een publieke site. Sam beheert content
zonder developer. Live-preview naast editor. White-label theming cascade.

LAYOUT
- Sub-tab nav: Instellingen | Gebruikers | Mailbox | Website (active) | Hulp | Admin
- Header: "Website" + "Open publieke site" link + "Publish"-CTA
- 2-koloms split:
  LEFT: Section-editor
  RIGHT: Live preview-iframe (iframe naar publieke-site preview)

SECTIES (links)
1. HERO
   - Bedrijfsnaam (auto uit settings)
   - Tagline (BlockNote textarea, short)
   - Hero-foto (upload of stock)
   - Primary CTA-tekst (default "Offerte aanvragen" → /aanvraag/[slug])
2. OVER ONS
   - Verhaal (BlockNote rich-text)
   - Foto-gallery (3-5 sfeerbeelden)
   - Founder-quote
3. MENU PREVIEW
   - Gerechten-selectie (cmdk uit gerechten)
   - Layout: grid / lijst / carousel
   - Linkt naar /aanvraag/[slug] voor "Compleet menu aanvragen"
4. GALERIJ
   - Foto-grid (drag-reorder)
   - Categorieën (gerechten / events / locaties / team)
   - Lightbox bij click
5. FAQ
   - Q&A-paren (accordion)
   - Vrije volgorde drag
   - AI-generate "Genereer 5 standaard FAQ's"
6. CONTACT
   - Contact-info uit settings
   - Embed-map (Leaflet of MapLibre)
   - WhatsApp-quick-button

PREVIEW IFRAME
- iframe naar /{slug}?preview=1
- Mode-toggle: Desktop / Mobile
- Refresh-button (na save)

PUBLISH-FLOW
- "Publish wijzigingen" CTA
- Confirm-dialog "Live op {slug}.bbq-architect.nl voor publiek"
- Versioning: snapshot in website_versions (toekomst v2)

DOMAIN-SETTINGS (Enterprise-only)
- Custom domain input
- DNS-records uitleg
- SSL-status

COMPONENTS
- shadcn/ui Tabs, Card, Accordion, Dialog
- BlockNote voor rich-text
- File-upload voor foto's
- MapLibre voor embed-map
- iframe sandbox voor preview

ACCESSIBILITY
- Editor sections aria-labelled
- Preview-iframe title-attr
- Publish-confirm: aria-modal

MOBILE
- 2-koloms → tabs (Editor | Preview)
- Publish-button sticky bottom

HARD RULES
- Public read alleen via website_* tabellen (RLS public, geen settings-leak)
- Foto-upload validatie (max 10MB, image-mime-types)
- Publish triggert revalidation cron

CONNECTS TO
- website_hero / website_gerechten / website_faq / website_gallery / website_gangen
- settings.brand_theme (cascade)
- website-images bucket
- Vercel Platforms voor custom domains (Enterprise)
```
