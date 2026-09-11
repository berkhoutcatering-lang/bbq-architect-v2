# Contract: website bijsturen (v1)

Wat Mathijs op `/verkoop/website` omzet, leest hopbites.nl via één publieke route.
Bron van het contract: `BOUWBRIEF-BEHEERSCHERM.md` in de website-repo, blok B1.

```
GET /api/public-bijsturing/{organisatie-slug}
```

```json
{
  "sluiting": { "reden": "We staan op locatie.", "tot": "2026-09-09T16:00:00.000Z" },
  "openingstijden": [
    { "datum": "2026-09-12", "van": "10:00", "tot": "17:00", "gesloten": false },
    { "datum": "2026-09-13", "van": null, "tot": null, "gesloten": true }
  ],
  "weekaanbod": {
    "van": "2026-09-07", "tot": "2026-09-13",
    "titel": "Deze week", "tekst": "Vers gerookte zalm, zolang de voorraad strekt.",
    "producten": ["borrel-journey"]
  },
  "uitverkocht": ["borrel-journey"]
}
```

| Antwoord | Betekenis voor de site |
| --- | --- |
| `200` met velden op `null` / lege lijsten | Niets bijgestuurd — de normale toestand |
| `404` | Onbekende organisatie |
| `503` | Database niet bereikbaar — de site behandelt dit als *onbereikbaar*, niet als dicht |

## Wat de route al weglaat

- Een sluiting die `sluiting_actief = false` heeft of waarvan `tot` voorbij is.
- Openingstijden van vóór vandaag (Nederlandse tijd).
- Een weekaanbod waarvan de laatste dag voorbij is. Een aanbod dat nog moet beginnen gaat wél mee.

De site maakt daarna zelf nog alles schoon (tekstlengtes, slugs, kloktijden) en past haar
eigen regels toe: bijsturing kan alleen dichtdoen, nooit opendoen; een slug die niet op
`aan` staat wordt genegeerd.

## Waar het staat

| Bestand | Wat |
| --- | --- |
| `supabase/migrations/20260911120000_website_bijsturing.sql` | `website_bijsturing` (één rij per org) en `website_openingstijden` |
| `src/lib/websiteBijsturing.ts` | rijen → contract, met tests ernaast |
| `src/app/api/public-bijsturing/[slug]/route.ts` | de route (service-role, publiek via `src/proxy.ts`) |
| `src/app/verkoop/website/` | het scherm en de server actions |

De site cachet het antwoord 30 seconden. De productlijst in het scherm
(`WEBSITE_PRODUCTEN`) is een spiegel van `lib/content/content.ts` in de website-repo;
komt daar een lijn bij, dan hoort hij hier ook bij — of je typt de slug los in.
