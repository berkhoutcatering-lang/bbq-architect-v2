# BBQ Architect — Tool-by-tool design review

**Datum:** 2026-06-08
**Doel:** Per tool een complete design-prompt schrijven die Sam naar een externe builder kan sturen (Lovable / v0 / Bolt / human designer).

## Aanpak

Per tool: navigate → screenshot → functional test met [APK-TEST] data → 4-rubriek design-review (Bugs / UX-gaps / Visual / Cohesie) → design-prompt file.

## Output structuur

```
design-prompts/        # 60 stand-alone prompts voor externe builder
wave-1-golden-flow.md  # Wave 1 summary (deze sessie)
wave-2-hub-subpages.md # Wave 2 (toekomst)
wave-3-mobile-lars.md
wave-4-ai-endpoints.md
wave-5-systeem-integraties.md
```

## Wave status

| Wave | Scope | Tools | Status |
|---|---|---|---|
| 1 | Golden Flow | 10 | ✅ DONE (10/10 prompts) |
| 2 | Hub-subpagina's | 12 | ✅ DONE (12/12 prompts) |
| 3 | Mobile + Lars-flow | 8 | ✅ DONE (6 nieuwe + 2 dekt door W1) |
| 4 | AI-endpoints (Promptfoo) | 20 | ⏳ blocked op #34 test-user |
| 5 | Systeem + integraties | 10 | ✅ DONE (10/10 prompts) |

## [APK-TEST] dataset (Wave 1)

- klant_id: **44** ("[APK-TEST] Testklant BV")
- lead_id: **5**
- offerte_id: **37** (nummer APK-TEST-001, public_token `c4ea40e1-6d52-4811-bf49-ee1359cdb8f7`)
- event_id: **52** ("[APK-TEST] Event Golden Flow", confirmed, 30 dagen vooruit)
- gerecht_id: 1× "[APK-TEST] Testgerecht — Pulled Pork"

Cleanup-script aan einde sessie (zie plan-file).
