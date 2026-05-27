# Bonnenkistje — Rebuild Briefing (voor nieuwe Claude-sessie)

**Status**: vorige sessie heeft de feature gebouwd maar Mathijs vindt 't te lelijk
en te wankel. Aanpak voor jou: **pixel-perfecte herbouw vanuit Claude Design**,
geen vrije interpretatie. DB en server-laag werken al; ALLEEN de UI-componenten
moeten opnieuw, plus een paar bug-fixes.

---

## Wat dit ding is

`/archief` — "Bonnenkistje", het digitaal boekhoud-archief in BBQ Architect.
De belofte: *"Typ baktotaal — vind elke bon over 7 jaar heen, tot op het woord."*

Plus `/bonnen` — de scan-flow waar bonnen binnenkomen (drop PDF/foto/UBL → AI
extract via Haiku → "Bevestig in archief"-knop → bon in `/archief`).

## Het DESIGN dat je 1-op-1 moet implementeren

**Lees deze files eerst, in deze volgorde** (allemaal in `docs/bonnenkistje-design/`):

> Tip: de originele ZIP-handoff staat (lokaal) in `~/Downloads/bonnen boekhouding-handoff-5.zip`
> als je de complete bundle nodig hebt (incl. screenshots + uploads). De repo-versie
> bevat alleen de archief-relevante files om git-size beperkt te houden.

1. `docs/bonnenkistje-design/README.md` (handoff intro)
2. `docs/bonnenkistje-design/project/Archief Bonnenkistje.html` (hoofdpagina, lees in z'n geheel)
3. `docs/bonnenkistje-design/project/archief-app.jsx` (orchestrator)
4. `docs/bonnenkistje-design/project/archief-atoms.jsx` (basis-componenten)
5. `docs/bonnenkistje-design/project/archief-data.jsx` (mock-data shape)
6. `docs/bonnenkistje-design/project/archief-kistje.jsx` (masonry kistje-mode)
7. `docs/bonnenkistje-design/project/archief-tabel.jsx` (tabel-mode)
8. `docs/bonnenkistje-design/project/archief-detail.jsx` (slide-over preview)
9. `docs/bonnenkistje-design/project/archief-filter.jsx` (filter sidebar)
10. `docs/bonnenkistje-design/project/archief-inbox.jsx` (inbox tab)
11. `docs/bonnenkistje-design/project/archief-modals.jsx` (empty-state SVG, bulk-export, deellink)

**Regel:** als jouw UI niet identiek oogt aan deze JSX-files, ben je niet klaar.
Geen "ik dacht dat het zo beter was". Geen "ik heb 'm wat aangepast voor B2B".
Wat het design zegt is wat het wordt.

## Wat NIET aanraken (werkt al)

DB-schema en RLS zijn klaar via deze migraties — laat staan:

- `20260520220000_bonnen_archief_search.sql` (tags, extracted_text, search_vec)
- `20260525131000_bonnen_required_columns.sql` (locked_at, source, file_path, status CHECK)
- `20260525132000_bonnen_bucket_private.sql` (storage policies)
- `20260525133000_bonnen_rls_lockdown.sql` (RLS strict + unlock_bon admin)
- `20260525134000_pg_trgm_bonnen.sql` (fuzzy search)
- `20260525135000_bon_share_tokens.sql` (deellinks tabel)
- `20260525136000_bon_audit_log.sql` (audit_log extend voor bonnen)
- `20260525137000_bonnen_rpcs.sql` (search_bonnen_ranked + helpers)
- `20260525138000_audit_trigger_delete_safe.sql` (audit-trigger defensive)

Server-laag werkt:
- `src/lib/dal/bonnen.ts` — searchBonnen, getBonSignedUrl, listInboxFacturen, etc.
- `src/lib/archief/extractPdfText.ts` — pdfjs + Haiku fallback
- `src/lib/archief/shareTokens.ts` — token-gen + resolve
- `src/app/api/archief/signed-url/route.ts` — signed URLs voor preview
- `src/app/api/archief/bulk-export/route.ts` — ZIP+CSV export
- `src/app/api/bonnen/commit/route.ts` — save bon naar DB + Storage upload
- `src/app/archief/actions.ts` — Server Actions (lock/unlock/share/etc.)
- `src/app/archief/page.tsx` — Server Component die data fetched

**Pak deze NIET aan tenzij je een echte bug vindt.** Dit is allemaal getest en werkt.

## Wat WEL aanraken (= de hele UI laag)

Dit moet opnieuw — 1-op-1 vanuit het design:

```
src/app/archief/_client.tsx                  — orchestrator (view-toggle, drawer-state)
src/app/archief/_components/
  BonGrid.tsx                                — Kistje-mode masonry
  BonTable.tsx                               — Tabel-mode TanStack
  BonFilters.tsx                             — 240px filter sidebar
  BonSearchBar.tsx                           — Notion-stijl monolithic search
  BonReceiptThumb.tsx                        — faux-receipt mini-mockup
  BonkSnippet.tsx                            — search-resultaat row
  BonPreview.tsx                             — 720px slide-over met 4 tabs
  PdfViewerInner.tsx                         — lazy-loaded @react-pdf-viewer
  BulkExportSheet.tsx                        — ZIP-export modal
  DeelLinkSheet.tsx                          — deellink + QR modal
  InboxList.tsx                              — email-in queue
  EmptyKistje.tsx                            — empty-state SVG (al goed, hergebruik)
  ActiveFilterPills.tsx                      — removable filter chips
  format.ts + statusMap.ts + sanitizeSnippet.ts  — helpers (al goed)
```

Bekijk wat ik gebouwd heb om te zien wat er MIS ging — maar gooi het gerust weg.

## Harde constraints

1. **organization_id is UUID** in dit schema, NIET BIGINT. Overal.
2. **`public.user_org_ids()` is de helper**, NIET `auth.user_org_ids()` —
   Supabase blokkeert sinds mid-2025 CREATE in `auth` schema vanuit Studio.
3. **Status CHECK accepteert 6 waarden**: `pending | review | processed | bevestigd | twijfel | vergrendeld`.
   UI mapt `review→twijfel` en `processed→bevestigd` (zie `statusMap.ts`).
4. **Postgres 15+ vereist IMMUTABLE wrapper voor `to_tsvector` in generated columns**.
   Voor bonnen: `bonnen_compute_search_vec(...)` is die wrapper.
5. **bonnen-tabel kolommen die je MOET kennen**:
   - id (BIGINT PK), organization_id (UUID NOT NULL), winkel, datum, totaal_bedrag,
     btw_laag_bedrag (9%), btw_hoog_bedrag (21%), netto_bedrag, leverancier_id,
     categorie, rgs_code, rgs_category_label, tags (TEXT[]), notities, status,
     source, image_url (legacy), file_path, file_mime, image_hash, locked_at,
     locked_by, bon_items (JSONB), raw_analysis (JSONB), extracted_text,
     search_vec (GENERATED tsvector), created_at, updated_at
6. **Stack**: Next.js 16.2 Turbopack, React 19, TypeScript strict, Tailwind v4 CSS-first,
   Supabase ssr (`createServerSupabase` + `createServiceSupabase` uit `@/lib/supabase-server`),
   @anthropic-ai/sdk 0.95, @tanstack/react-table 8, react-masonry-css, nuqs,
   @react-pdf-viewer/core 3.12 (peer-conflict met pdfjs-dist 5 — gebruik `--legacy-peer-deps`)
7. **Path aliasing**: `@/lib/...`, `@/components/...`, etc.
8. **NuqsAdapter** zit al in `src/app/layout.tsx`, niet aanraken.
9. **Geen styled-jsx** met `${var}` interpolation in body (Turbopack 16+ hangt).
   Gebruik plain CSS via `globals.css` of `<style>` zonder `jsx` prop.

## Wat Mathijs SPECIFIEK weerzin tegen heeft (in mijn implementatie)

- Cards zien er "Windows XP" uit — te plat, te grijs, geen visuele diepte
- Filter sidebar voelt "uitgekleed" — chips zien er goedkoop uit
- BonPreview slide-over: lege/verwarrende tabs, "Bestand niet gevonden" alarm
- Receipt-thumbnails: leeg wit met cameraicoontje (vóór mijn rich-up)
- Algeheel: voelt als prototype, niet als product
- Save-flow: was stuk (Bevestig-knop deed niets) — heb ik nu wel gefixed,
  maar UX van scan-pagina kan beter (te veel klikken)

## Wat Claude Design ANDERS doet (wat ik miste)

- Daadwerkelijk masonry-grid met visuele rust + goud-accenten op cruciale plekken
- Receipt-thumbnails zijn rijke faux-PDF mockups met SLIGRO header + nepregels +
  TOTAAL onderaan (NIET leeg) — heb ik later geprobeerd te fixen, te weinig
- Filter sidebar met section-headers in juiste typografische hiërarchie
- Stats-strip met BTW splits (heb ik laat toegevoegd, oogt nog niet als design)
- BonPreview drawer met goed gevulde 4 tabs: PDF inline render met search-highlight,
  Details key-value grid, Voorraad-impact mutaties, Activiteit timeline
- Bulk-export en Deellink modals met sterke visuele identiteit (goud + glass)

## Jouw werkwijze (advies vooraf)

1. **Lees alle 11 design files VOLLEDIG** voordat je een regel code schrijft
2. **Schrijf eerst** een herzien overzicht van wat je gaat doen, dan toon dat aan
   Mathijs voor goedkeuring
3. **Werk component-voor-component**, niet pagina-voor-pagina. Build één component
   helemaal af (Receipt-thumb bijvoorbeeld), laat 't zien, ga door naar volgende
4. **Vraag Mathijs naar screenshots** tussen iteraties — niet pas aan het eind
5. **GEEN incrementele tweaks** als de basis er niet identiek aan het design uitziet
6. **Auto-deploy via Vercel** — push naar `main` na elke afgeronde batch
7. **Check eerst met Mathijs** of je `npm install` mag draaien (peer-conflicts)
   en of hij autorisatie geeft voor push naar main

## Bug-lijst die nog open kan staan

- DELETE op bonnen: migratie 138000 fixt audit-trigger, run die in Studio als
  niet al gerund.
- Inbox tab: rendert leeg als `org_email_inbox` geen `bon_id` kolom heeft —
  DAL heeft fallback maar UI toont niets. Optioneel: voeg de kolom toe via
  een migratie + koppel met "Verwerk → archief" actie.
- "Open in Geld" knop in BonPreview-bottom-bar werkt nog niet (placeholder
  link naar /geld zonder bon-id).
- Mobile: BonPreview drawer is fixed 720px breed — onder 800px zou bottom-sheet
  patroon moeten. Niet getest.

## Memory-context (lees ook even)

In `~/.claude/projects/-Users-mathi-Documents-GitHub-bbq-architect-v2/memory/`:
- `feedback_full_complete_features.md` — Mathijs wil 100%-af, geen 70%-demo's
- `feedback_concurrent_patterns.md` — doe wat Tripleseat/Caterease doen, niet slim eigen
- `feedback_autonomous_merge_secuur.md` — push naar main mag, na CI groen
- `project_postgres15_generated_columns.md` — to_tsvector IMMUTABLE wrapper
- `feedback_migration_dependencies.md` — defensive existence-checks in migraties

## Eindcheck voor jou

Voordat je iets "klaar" noemt:
- [ ] Sta naast de Claude Design HTML, vergelijk pixel voor pixel
- [ ] Hover-states getest in 3 verschillende preset-themes (dark default + 2 anderen)
- [ ] Mobile responsive op 390px breedte gechecked
- [ ] BonPreview drawer alle 4 tabs hebben echte data of vriendelijke empty state
- [ ] Scan → Bevestig → /archief flow werkt end-to-end zonder console errors
- [ ] DELETE op een test-bon werkt zonder error
- [ ] Search "baktotaal" op een bon met dat woord toont highlight in card-snippet
- [ ] Niets is "ik dacht dat het zo beter was" — alleen "het design zegt zo"

Succes. Mathijs heeft het verdiend.
