# Overdracht: combideals waarin de klant kiest (voor de website-repo)

Datum: 26 oktober 2026. Hoort bij `docs/context/winkel-aanbod-en-vloer-plan.md`, fase 2 (keuzevakken), in `bbq-architect-v2`.

**Dit werk hoort in de website-repo (hopbites.nl), niet in `bbq-architect-v2`.** BBQ Architect heeft de kant gebouwd die rekent en vastlegt: [PR #252](https://github.com/berkhoutcatering-lang/bbq-architect-v2/pull/252). De website doet alleen de klantkant:
- de keuzes laten zien;
- de klant laten kiezen;
- de gekozen id's meesturen in de mand.

Alles wat geld is, blijft in BBQ Architect, net als nu.

## Zo geef je dit aan Claude in de website-repo

Kopieer dit bestand naar de website-repo en open daar een sessie met:

> Lees `OVERDRACHT-WEBSITE-KEUZEVAKKEN.md`. Bouw de keuze-stap voor artikelen met een kies-vak, op het contract hieronder. Reken zelf geen bedragen uit: toon wat `/keuzes` en `/offerte` teruggeven.

**Wanneer het live werkt:** pas als in BBQ Architect PR #252 is samengevoegd én migratie `20261026120000_winkel_keuzevakken.sql` op de live database staat. Mathijs kiest dat moment. Tot die tijd geeft `/keuzes` een lege lijst en verandert er voor de website niets.

---

## Wat een combideal is

Een artikel (slug, vaste prijs) met vakken. Een vak is:

- **vast**: altijd hetzelfde product, zoals nu bij de geschenkpakketten;
- **kies**: de klant kiest `keuzes` keer uit een lijst opties. Twee keer hetzelfde mag, tenzij `verschillend` = true ("twee sóórten worst"). Een optie kan een meerprijs hebben, die per keuze bovenop de artikelprijs komt.

Voorbeeld van Mathijs: "twee biertjes, twee soorten worst en een blokje kaas, en de klant kiest zelf". Dat zijn drie kies-vakken: Bier (kies 2), Worst (kies 2, verschillend) en Kaas (kies 1).

## 1. Ophalen: `GET /api/public-winkel/{slug}/keuzes`

Je krijgt alleen artikelen die actief én publiek zijn en minstens één kies-vak hebben.

```json
{
  "ok": true,
  "artikelen": [
    {
      "slug": "combideal-bier-worst-kaas",
      "naam": "Combideal",
      "prijsCenten": 2500,
      "verkoopbaar": true,
      "vakken": [
        {
          "slot": "9d2c…",            // vak-id: dit stuur je terug
          "naam": "Bier",
          "keuze": "kies",
          "keuzes": 2,
          "verschillend": false,
          "hoeveelheid": 1,
          "eenheid": "stuk",
          "product": null,
          "voorkeuze": null,          // product-id dat geldt als de klant niets kiest; null = moet kiezen
          "opties": [
            { "product": "71af…", "naam": "IPA",    "meerprijsCenten": 0,   "stand": "ja",        "alcohol": true },
            { "product": "c3e0…", "naam": "Stout",  "meerprijsCenten": 0,   "stand": "op",        "alcohol": true },
            { "product": "0b9d…", "naam": "Tripel", "meerprijsCenten": 150, "stand": "onbeperkt", "alcohol": true }
          ]
        },
        { "slot": "…", "naam": "Doos", "keuze": "vast", "keuzes": 1, "product": "…", "opties": [] }
      ]
    }
  ]
}
```

- `stand`:
  - `ja` = er ligt iets;
  - `op` = niet kiezen, toon hem doorgestreept of laat hem weg;
  - `onbeperkt` = niet bijgehouden.

  Er komen nooit voorraadgetallen mee. Bij het bestellen is BBQ Architect de poort.
- `verkoopbaar: false` = dit artikel nu niet tonen als bestelbaar.
- Uitgezette producten staan niet in `opties`.
- Rate limit: 120 per minuut per IP. Altijd `Cache-Control: no-store`.

## 2. Meesturen: `keuzes` op een mandregel

Bij `POST …/offerte` en `POST …/order` krijgt een regel van een combideal het veld `keuzes`:

```json
{ "slug": "combideal-bier-worst-kaas", "aantal": 1, "moment": null,
  "keuzes": [
    { "slot": "9d2c…", "producten": ["71af…", "0b9d…"] },
    { "slot": "4e11…", "producten": ["…appel…", "…peper…"] }
  ] }
```

- Per kies-vak precies `keuzes` product-id's. Herhaling = twee keer hetzelfde.
- Laat je een vak weg, dan neemt BBQ Architect de `voorkeuze`, als die er is. Zonder voorkeuze is het een validatiefout.
- Verschillende keuzes voor hetzelfde artikel? Dan maak je twee regels. `aantal` geldt per regel, met dezelfde keuzes.
- Een artikel zonder kies-vakken met een `keuzes`-veld blijft een validatiefout, net als nu.

## 3. Wat er terugkomt

- **Offerte:** `stukCenten` is nu inclusief de meerprijzen, en elke regel heeft `keuzes` zoals gerekend (met de ingevulde voorkeuzes). Toon die bedragen en reken zelf niets na.
- **Fouten** (`soort: "validatie"`) in gewone taal, klaar om te tonen:
  - "Combideal: kies 2 × Bier (nu 1)."
  - "Combideal: kies bij Worst 2 verschillende."
  - "Combideal: Stout is op dit moment niet beschikbaar."
  - "Combideal: Droge worst hoort niet bij Kaas."
  - "De keuzes voor Combideal kloppen niet." (een verkeerde vorm of een onbekend vak)
- **Voorraad:** is een gekozen product tussen het ophalen en het bestellen op geraakt, dan komt dezelfde fout als nu bij een product dat op is.
- **18+:** volgt de keuzes. Twee keer alcoholvrij betekent geen 18+-markering. Gebruik `alcohol` per optie om de hint al tijdens het kiezen te tonen.
- **Btw:** volgt wat er echt gekozen is. Dat rekent BBQ Architect, de website niet.

## Nog open

- **Foto's per keuze:** `/keuzes` geeft nu alleen product-id en naam. Na het samenvoegen van de catalogus (PR #249, `winkel_producten.slug` en `foto`) kan hier de productslug bij, zodat de website zijn eigen productfoto's hergebruikt. **[BEVESTIGEN]** of de website dat wil, of dat de naam genoeg is.
- **Keuzes aan de toonbank:** volgen na de opening (kassaplan), op hetzelfde rekenwerk.
