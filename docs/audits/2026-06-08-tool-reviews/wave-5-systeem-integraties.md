# Wave 5 — Systeem + integraties (10 tools) — ✅ DONE

Configuratie, externe koppelingen, onboarding, AI-assistant.

| # | Tool | Status | Prompt |
|---|---|---|---|
| 29 | Instellingen + theming | ✅ | [29-instellingen.md](./design-prompts/29-instellingen.md) |
| 30 | Integraties OAuth-board | ✅ | [30-integraties.md](./design-prompts/30-integraties.md) |
| 31 | Gebruikers + rol-matrix | ✅ | [31-gebruikers.md](./design-prompts/31-gebruikers.md) |
| 32 | Mailbox + templates | ✅ | [32-mailbox.md](./design-prompts/32-mailbox.md) |
| 33 | Website-editor | ✅ | [33-website.md](./design-prompts/33-website.md) |
| 34 | Help center + AI-RAG | ✅ | [34-hulp.md](./design-prompts/34-hulp.md) |
| 35 | Platform admin | ✅ | [35-admin.md](./design-prompts/35-admin.md) |
| 36 | Onboarding wizard | ✅ | [36-onboarding.md](./design-prompts/36-onboarding.md) |
| 37 | Klantgesprek-extractor | ✅ | [37-klantgesprek.md](./design-prompts/37-klantgesprek.md) |
| 38 | AI-chat persistent | ✅ | [38-ai-chat.md](./design-prompts/38-ai-chat.md) |

## Hoofdthema's

- White-label theming cascade (5 tokens × 8 presets) door alle tenant-facing UIs
- OAuth-flows: Moneybird, Mollie, Google Calendar (+ Chrome extension API-keys)
- Rol-gating: Admin/Pitmaster/Medewerker (RLS uit #4 design-doc)
- Send-only mail-flow via Resend (Cloudflare worker doet inkomende)
- AI-features over hele platform via 3 entry-points (chat-page / ChatPanel / ⌘K)
- 42 action-types registry voor AI tool-use met audit-log
- AVG-export/delete via /admin (Article 15/17/20)

## Bevindingen

- ✅ /admin tier-restriction werkt (PLATFORM_ADMIN_EMAILS env-check)
- ✅ PersonaQuiz cross-device persistent (APK-fix #30)
- ✅ AI-spend trackable per tenant in /admin/ai-cost
- ❌ Geen "Test connection"-knop per integratie
- ❌ Geen versioning op website-editor (publish = direct live, geen rollback)
- ❌ AiAssistant 1865r refactor blijft openstaan (memory tip)
