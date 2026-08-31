# Kennisbank

De naslaglaag waar de AI-kok zijn kennis vandaan haalt. Zie
`docs/agent-architectuur-plan.md` hoofdstuk 5 en 6.

## Waarom bestanden en geen schermpjes

Dit is **geen bedrijfsdata maar naslag**: vet- en vochtpercentages, aromadrempels,
wat een schuim nodig heeft. Dat verandert niet per cateraar. Als bestand krijg je
versiebeheer, kun je een wijziging in een diff nalezen, opnieuw importeren als er
iets misgaat, en er tests op draaien. En je keurt een bestand met dertig citrussen
in één keer goed in plaats van dertig losse schermen.

## Wat hier NIET in hoort

**Prijs en bestelbaarheid.** Die komen uit de eigen leverancierscatalogus en zijn
per leverancier anders. Zet je ze hier, dan wordt de kennisbank een echo van
zichzelf en is hij bovendien niet meer draagbaar naar een tweede cateraar.

Ook niet: alles wat over één specifiek eigen gerecht gaat. Dat hoort in
`gerecht_profielen` en is per tenant.

## Structuur

```
data/kennisbank/
  README.md                    dit bestand
  balans-correcties.json       "te zoet → zuur erbij" — compleet
  technieken.json              schuim, gel, karamel: wat een techniek nodig heeft
  ingredienten/
    citrussen.json             één bestand per productgroep
    uien-en-look.json
    kazen.json
    ...
```

Eén bestand per productgroep, want acht citrussen naast elkaar zijn beoordeelbaar
en één citroen in isolatie niet. Fouten vallen op door vergelijking.

## Herkomst per veld

De importer bewaakt deze scheiding niet — jij doet dat bij het goedkeuren.

| Blok | Waar het vandaan komt | Wie tekent |
|---|---|---|
| `vetPct`, `vochtPct`, `eiwitPct`, `ph`, `dichtheid` | NEVO (RIVM), import | niemand — feit |
| `aromaComponenten` | FlavorDB2, import | niemand — feit |
| `rol`, `smaakpalet`, `smaakregister`, drempels, `hitteGedrag` | AI stelt voor | jij, per groep |
| `bron` | verplicht bij alles wat geïmporteerd is | — |

Een profiel zonder `bron` op de harde getallen is een gok die zich voordoet als
feit. Vul die dan liever leeg.

## Importeren

```bash
node scripts/import-kennisbank.mjs            # alles
node scripts/import-kennisbank.mjs citrussen  # één groep
node scripts/import-kennisbank.mjs --dry-run  # laat zien wat er zou gebeuren
```

Draait met de service-role en gaat dus langs RLS heen. Idempotent: opnieuw
draaien werkt bij op `slug`, het maakt geen dubbelen aan.
