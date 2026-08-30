# AI Evaluation Suite

Deze folder bevat test-cases die de AI-endpoints controleren op regressie.

## Structuur

```
docs/ai-evals/
  README.md
  recipe-generate/       ← cases voor /api/recipe-generate (offerte-wizard menu's)
    case-001.json
    case-002.json
    ...
  parse-document/        ← toekomstige cases voor /api/parse-document
```

## Uitvoeren

```bash
# Terminal 1: start dev-server
npm run dev

# Terminal 2: draai evals
BBQ_EVAL_BASE=http://localhost:3000 npx tsx scripts/ai-eval.ts

# Threshold aanpassen (default 0.9 = 90%)
BBQ_EVAL_THRESHOLD=0.85 npx tsx scripts/ai-eval.ts
```

Exit codes:
- `0` — alle endpoints ≥ threshold (geen regressie)
- `1` — een of meer endpoints onder threshold (regressie gedetecteerd)
- `2` — technische fout (server niet bereikbaar, geen API key, etc.)

## Nieuwe case toevoegen

Maak een bestand `case-NNN.json` in de juiste endpoint-folder:

```json
{
  "id": "case-011",
  "description": "Wat deze case test in één regel",
  "request": {
    "path": "/api/recipe-generate",
    "body": {
      "mode": "menu",
      "prompt": "BBQ voor 30 man, budget €1500",
      "existing": [],
      "options": { "gasten": 30, "gangen": 3 }
    }
  },
  "expectations": [
    { "type": "has_path", "path": "data.gerechten" },
    { "type": "array_min_length", "path": "data.gerechten", "min": 3 }
  ]
}
```

## Beschikbare `expectations`

| Type | Parameters | Betekenis |
|---|---|---|
| `has_path` | `path` | Waarde op dat pad is niet null/undefined |
| `array_min_length` | `path`, `min` | Waarde is een array met ≥ min items |
| `number_gte` | `path`, `min` | Waarde is een getal ≥ min |
| `number_lte` | `path`, `max` | Waarde is een getal ≤ max |
| `string_contains` | `path`, `substring`, `caseInsensitive?` | Waarde bevat een substring |

`path` is dot-notation (bv. `data.gerechten.0.naam`).

## Richtlijnen

- **Houd cases scherp maar tolerant.** AI-output varieert — test op structuur + ranges, niet op exact-matching.
- **10–30 cases per endpoint is genoeg.** Meer geeft ruis zonder extra signaal.
- **Anonimiseer.** Geen echte klantnamen / PII in cases. Gebruik "Tuinvereniging X", "Bedrijf Y".
- **Kostencheck.** Elke run van 10 cases kost ~€0,20–€0,50. Draai niet vaker dan nodig.
- **Edge-cases erbij.** 2 van 10 cases moeten bewust lastig zijn (onvolledige input, ongewoon aantal gasten, dieet-beperkingen).

## Roadmap

- ~~**Sprint 1**: 10 cases voor recipe-generate~~ ✅
- **Sprint 2** (deels af, 18/30): 18 cases voor recipe-generate + CI-integratie (GitHub Actions wekelijks via ai-eval.yml). Resterende 12 cases: thematische events (Pasen / Kerst / Halloween), regio-specifieke smaakprofielen.
- **Sprint 3:** Parse-document cases (5 factuur-voorbeelden + 5 bon-voorbeelden)
- **Sprint 4:** Chat-API conversatie-cases

## Case-coverage matrix (18 cases)

| # | Categorie | Wat dekt het |
|---|---|---|
| 001 | Baseline | Standaard 30-pers 3-gangs |
| 002-004 | Variatie | Verschillende prompts |
| 005 | Halal-vriendelijk | Geen varkensvlees |
| 006-009 | Edge-cases | Verschillende combinaties |
| 010 | Internationaal | NL/EN mix |
| 011 | Premium | 6-pers premium-tier, prijs ≥40 |
| 012 | Bulk + budget-druk | 250 pers met €18 cap |
| 013 | Single-gang | 1 gang lunch |
| 014 | 100% vegan | Geen vlees/vis/zuivel |
| 015 | Recipe-modus | Eén enkel recept i.p.v. menu |
| 016 | Variatie-instructie | `existing` array uitsluiten |
| 017 | Kinderfeest | Geen alcohol, kindvriendelijk |
| 018 | Minimale prompt | "BBQ 30" — sensible defaults |
