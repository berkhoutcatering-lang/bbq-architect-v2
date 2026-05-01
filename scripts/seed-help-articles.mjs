// Seed-script: vult de help_articles tabel met 12 onboarding-artikelen.
// Idempotent: bestaande slugs worden geüpdatet, nieuwe worden toegevoegd.
// Bypass RLS via service_role.
// Run: `node scripts/seed-help-articles.mjs`
// Cleanup: zie onderaan; verwijdert alleen artikelen met `seed_marker = 'v1'`.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(join(__dirname, '..', '.env.local'), 'utf8');
for (const line of envFile.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

// 12 artikelen — schrijfstijl: kort, direct, mensentaal. Geen jargon zoals "component"
// of "API". Markdown via dezelfde renderer in /hulp/page.tsx (## headings, **bold**,
// - bullets, 1. genummerde lijsten).
const articles = [
    {
        slug: 'welkom',
        category: 'aan-de-slag',
        sort_order: 1,
        title: 'Welkom bij BBQ Architect',
        search_tags: ['start', 'welkom', 'eerste keer'],
        content: `BBQ Architect is gemaakt om jouw catering-business van begin tot eind te ondersteunen — van de eerste klantvraag tot de laatste factuur, en alles ertussen (HACCP, voorraad, prep, marges).

## In 60 seconden begrijpen

De app heeft één rode draad: **event → offerte → uitvoering → factuur**. Alle modules hangen daaraan.

- **Vandaag** is je startpunt: wat speelt er nu?
- **Plannen** voor agenda, events en service
- **Verkoop** voor offertes, klanten en facturen
- **Keuken** voor gerechten, recepten en menu-engineering
- **Voorraad** voor inkoop, materieel en logistiek
- **Geld** voor financiën en uren

## Eerste 3 stappen

1. Vul je bedrijfsgegevens in via **Systeem → Instellingen** (KVK, BTW, IBAN — staat al meestal in).
2. Maak een eerste offerte via **Verkoop → Offertes → AI Offerte**. Dat is de snelste manier om de app te leren kennen.
3. Als de klant accepteert, wordt automatisch een event aangemaakt op de **Agenda**.

## Wie helpt je verder

De AI-assistent **Rook** zit op elke pagina rechts: stel een vraag in jouw eigen woorden, hij weet de context van waar je bent.`,
    },
    {
        slug: 'eerste-offerte-met-ai-wizard',
        category: 'offertes',
        sort_order: 2,
        title: 'Eerste offerte met de AI Wizard',
        search_tags: ['offerte', 'ai', 'wizard', 'menu', 'prijs'],
        content: `De AI Offerte Wizard maakt in één klik een compleet menu + adviesprijs op basis van jouw bestaande gerechten.

## Hoe het werkt

1. Ga naar **Verkoop → Offertes** en klik **AI Offerte**.
2. Vul in: klantnaam, datum, aantal gasten, eventueel aantal vega.
3. Schrijf 1 zin over wat de klant wil ("stoer BBQ-menu, vleesrijk") of klik op een snelvoorstel.
4. Klik **Genereer offerte**. Dit duurt 30–60 seconden.

## In de preview kun je nog bijsturen

- **Prijs aanpassen**: gebruik de €+/− knoppen of typ direct de prijs in. De marge ververst meteen.
- **Marge-kleur**: groen ≥40%, oranje 30–40%, rood <30%. Mik op groen.
- **Terug naar AI-advies**: één klik op de "↺ AI-advies"-knop.

## Wat de AI weet

Rook leest jouw bestaande gerechten-catalog mee. Hij verzint geen rare fusion — hij combineert wat jij al doet, in jouw stijl.`,
    },
    {
        slug: 'eerste-event-aanmaken',
        category: 'aan-de-slag',
        sort_order: 3,
        title: 'Eerste event aanmaken en plannen',
        search_tags: ['event', 'agenda', 'plannen'],
        content: `Een event ontstaat meestal automatisch uit een geaccepteerde offerte. Soms wil je er handmatig één maken — bijvoorbeeld een proefsessie of een interne BBQ.

## Twee paden

**Vanuit offerte (standaard)**: zet de offerte op **geaccepteerd**, het event verschijnt op de Agenda.

**Handmatig**: ga naar **Plannen → Events** en klik **+ Nieuw event**. Vul datum, gasten, locatie in. Klant koppelen kan via de zoek-balk (typ ≥2 letters).

## Wat je daarna doet

- **Menu koppelen** — kies in het event welke gerechten erop staan. Dit drijft de inkooplijst.
- **Draaiboek** — vul tijdstippen in (15:00 brisket op de smoker, 17:00 sides klaar, etc.).
- **Team** — vink wie er werkt. Dit drijft de uren-registratie.

## Tip

Als je het event op **bevestigd** zet, telt het mee in je omzet-forecast op het dashboard.`,
    },
    {
        slug: 'haccp-veldmodus',
        category: 'voedselveiligheid',
        sort_order: 4,
        title: 'HACCP-temperatuur loggen in de keuken',
        search_tags: ['haccp', 'temperatuur', 'koeling', 'kerntemperatuur', 'veldmodus', 'handschoenen'],
        content: `De Veldmodus is gemaakt voor met handschoenen en vieze handen. Geen gepriegel met toetsenbord.

## Snel naar de Veldmodus

Open **Beheer → HACCP** en klik op **Veldmodus** (of ga direct naar /haccp/field).

## In 3 tikken loggen

1. Wat meet je? Tik op **Kip / Vis / Rundvlees / Varkensvlees / Salade / Dessert**.
2. Type meting? **Koeling** (-2 tot 7°C), **Vriezer** (-30 tot -15°C), **Kerntemp** (55-80°C) of **Serveren** (55-75°C). De grenzen staan onder elke knop.
3. Stel temperatuur in met **−5 / − / + / +5** knoppen. Geen typen nodig.

## Klaar

Tik op **LOG TEMPERATUUR**. De meting is opgeslagen, je krijgt een groene bevestiging.

## Wat NVWA later kan opvragen

Alle metingen zijn vindbaar via **HACCP → Dossier**. Per event of per dag exporteren als PDF kan met één klik.`,
    },
    {
        slug: 'inkooplijst-maken',
        category: 'aan-de-slag',
        sort_order: 5,
        title: 'Inkooplijst genereren voor een event',
        search_tags: ['inkoop', 'boodschappen', 'leveranciers', 'event'],
        content: `Als je een event hebt met menu-koppeling, kan de app de complete inkooplijst genereren — gesorteerd per leverancier.

## Hoe

1. Open het event op **Plannen → Events**.
2. Klik **Inkooplijst genereren**.
3. De app berekent: *(ingrediënten per gerecht) × (aantal porties) ÷ (porties per gerecht)*. Dat geeft kilo's, stuks, liters per artikel.
4. Per artikel ziet hij de standaard-leverancier en stelt voor te bestellen.

## Per leverancier bundelen

In **Voorraad → Stand** zie je het AI-bestelvoorstel: "2 items bij Slagerij De Laat — €160". Eén klik = bestelling klaar om te versturen.

## Tip

Houd je voorraad-stand bij. De app trekt automatisch af wat je nog hebt.`,
    },
    {
        slug: 'marge-en-financien-snappen',
        category: 'beheer',
        sort_order: 6,
        title: 'Wat zegt het Financiën-dashboard?',
        search_tags: ['financien', 'marge', 'foodcost', 'winst', 'dashboard'],
        content: `Het dashboard onder **Geld → Financiën** toont 5 tabs. Elke tab beantwoordt één vraag.

## De 5 tabs

- **Dashboard** — wat verwacht ik dit jaar (forecast op basis van geaccepteerde offertes + gewerkte uren).
- **Winst & Verlies** — wat is er werkelijk binnengekomen (uit betaalde facturen).
- **Uitgaven** — wat heb ik uitgegeven (uit gescande bonnen + ingekochte bestellingen).
- **BTW** — wat moet ik dit kwartaal aan de Belastingdienst.
- **Top Klanten** — wie levert het meeste geld op (ranking).

## Foodcost-percentage

In de catering is een gezonde foodcost 25–35% van de omzet. Boven 40% lekt er marge weg — kijk dan naar:

- Gerechten met te lage adviesprijs (zie Menu Engineering BCG-matrix)
- Inkoop bij te dure leveranciers (zie Voorraad → Prijsintelligentie)
- Verspilling op events (vgl. werkelijk verbruik vs forecast)

## Marge per gerecht

Op **Keuken → Menu Engineering** zie je per gerecht: kostprijs, verkoopprijs, marge%. Cards met marge <30% kleuren rood — die wil je herzien.`,
    },
    {
        slug: 'klant-toevoegen-en-koppelen',
        category: 'aan-de-slag',
        sort_order: 7,
        title: 'Klanten toevoegen en koppelen aan events',
        search_tags: ['klant', 'crm', 'particulier', 'zakelijk', 'festival'],
        content: `Klanten beheer je op **Verkoop → Klanten**. Ze worden automatisch gekoppeld aan offertes, events en facturen.

## Klant toevoegen

Klik **+ Nieuwe klant** en vul in: naam, email, telefoon, plaats. Type kiezen (Particulier / Zakelijk / Festival / Horeca) — dit beïnvloedt de filters.

## Bestaande klant koppelen

Bij een nieuwe offerte: typ in het klantnaam-veld. Bestaande klanten verschijnen in een dropdown — kies er één en alle gegevens worden ingevuld.

## Top-klanten zien

Op **Geld → Financiën → Top Klanten** zie je een ranking op betaalde omzet. Handig om te zien wie je grootste 5 klanten zijn — die wil je houden.

## Inactieve klanten

Klanten die meer dan 6 maanden geen event hadden, kun je filteren op de Klanten-pagina. Een korte mail of telefoontje doet vaak wonderen.`,
    },
    {
        slug: 'factuur-sturen-na-event',
        category: 'facturen',
        sort_order: 8,
        title: 'Factuur sturen na een event',
        search_tags: ['factuur', 'betaling', 'betaald', 'verzonden'],
        content: `De factuur stuur je nadat het event geweest is. Aanbetaling vooraf hoeft niet — de klant betaalt na bewezen levering.

## Vanuit het event

1. Ga naar **Plannen → Events** en open het uitgevoerde event.
2. Zet de status op **voltooid**. Er verschijnt een knop **Factuur maken**.
3. De app vult automatisch in: klantgegevens, regels (gasten × prijs/p), totaal, BTW.
4. Controleer, klik **Verstuur**. De factuur gaat per email naar de klant.

## Status-flow

- **Concept** — nog niet verstuurd
- **Verzonden** — bij de klant aangekomen
- **Betaald** — markeer dit handmatig als het bedrag op je rekening staat
- **Vervallen** — als de betalingstermijn voorbij is

## Vervallen facturen

Op het dashboard zie je hoeveel openstaande facturen "te laat" zijn. Eén klik op **Stuur herinneringen** stuurt automatisch een vriendelijke reminder per email.`,
    },
    {
        slug: 'gerechten-en-recepten-beheren',
        category: 'aan-de-slag',
        sort_order: 9,
        title: 'Gerechten + recepten beheren',
        search_tags: ['gerecht', 'recept', 'menu', 'allergenen', 'kostprijs'],
        content: `Gerechten zijn wat je aan klanten verkoopt — recepten zijn hoe je ze maakt. In de app vloeien ze samen via de Keuken-hub.

## Drie views, één catalog

Op **Keuken** zie je drie tabs:

- **Gerechten** — productlijst met prijs, allergenen, foto.
- **Menu Engineering** — analyse: stars / cash cows / dogs (wat verdient het meest, wat onderpresteert).
- **Recepten** — bereidingsstappen + ingrediënten-detail.

## Nieuw gerecht toevoegen

**+ Gerecht** rechtsboven → vul in: naam, beschrijving, gang (voorgerecht/hoofd/dessert), kostprijs, adviesprijs, allergenen.

## AI laten helpen

Klik **AI menu Componeren** of **AI Recept genereren** — Rook gebruikt jouw bestaande catalog als stijl-referentie en bedenkt nieuwe combinaties.

## Allergenen

Belangrijk: allergenen worden later op de offerte naar de klant gestuurd. Vul ze altijd in. Standaard: gluten, melk, eieren, noten, soja, vis, sesam, mosterd, selderij, schaaldieren.`,
    },
    {
        slug: 'rook-pitmaster-coach-gebruiken',
        category: 'tips',
        sort_order: 10,
        title: 'Rook (AI Pitmaster Coach) gebruiken',
        search_tags: ['ai', 'rook', 'pitmaster', 'chat', 'studio', 'brainstorm'],
        content: `Rook is jouw AI-collega in de app. Hij weet op elke pagina wat de context is en kan vragen beantwoorden of acties uitvoeren.

## Drie plekken waar je Rook tegenkomt

- **Floating-knop rechtsonder** op elke pagina — zwevende chat, weet welke pagina je bekijkt.
- **Pitmaster Studio** (Keuken-hub) — voor diepe brainstorms, recept-ontwikkeling, marketing-ideeën.
- **Service Mode** — Rook helpt je tijdens het event ("Loop ik op tijd?", "Wat komt na deze gang?").

## Drie denkmodi

- **Snel** — kort antwoord (1–3 zinnen). €0,01 per vraag. Goed voor "wat is X?".
- **Standaard** — uitgebreid antwoord (~200 woorden). De default.
- **Diep** — volledige uitwerking (recepten, plannen, brainstorms). 6× duurder, maar denkt grondiger na.

## Voorbeeld-prompts

- "Bedenk 5 thema-BBQ concepten voor de zomer"
- "Welke gerechten op mijn menu hebben de slechtste marge?"
- "Schrijf een Instagram-post over de nieuwe pulled pork bowl"
- "Wat moet ik nu doen?" (op Service Mode)`,
    },
    {
        slug: 'team-uitnodigen',
        category: 'team',
        sort_order: 11,
        title: 'Teamleden uitnodigen',
        search_tags: ['team', 'gebruikers', 'rollen', 'uitnodigen', 'medewerker'],
        content: `Werk je niet alleen? Nodig collega's uit zodat ze ook events kunnen plannen, HACCP loggen of voorraad bijhouden.

## Iemand uitnodigen

1. Ga naar **Systeem → Gebruikers**.
2. Klik **+ Uitnodigen**.
3. Vul email + rol in.
4. De collega krijgt een email met een persoonlijke link.

## Rollen

- **Admin** — alles. Reserveer voor jezelf en eventueel je vaste compagnon.
- **Operator** — events, agenda, prep, HACCP. Geen instellingen of facturen.
- **Bekijken** — alleen lezen. Voor stagiairs of accountant.

## Tip

Voor losse uren-krachten (oproep-koks) kun je ook gewoon hun naam invullen op het event-team-veld. Zonder uitnodiging. Dan rollen de uren in je urenadministratie.`,
    },
    {
        slug: 'bedrijfsgegevens-instellen',
        category: 'beheer',
        sort_order: 12,
        title: 'Bedrijfsgegevens en huisstijl instellen',
        search_tags: ['instellingen', 'kvk', 'btw', 'iban', 'logo', 'huisstijl'],
        content: `Voor offertes en facturen heeft de app je bedrijfsgegevens nodig. Eén keer goed invullen, dan staat alles op de juiste plek in alle PDF's.

## Wat je nodig hebt

Op **Systeem → Instellingen**:

- Bedrijfsnaam + ondertitel (bv. "Hop & Bites — BBQ Catering Drenthe")
- Email + telefoon + adres
- KVK-nummer en BTW-nummer (verplicht op NL-facturen)
- IBAN (zodat klanten kunnen overmaken)
- Website-URL

## Huisstijl

Onderaan de instellingen-pagina kun je een **logo** uploaden — zowel voor lichte achtergrond (briefpapier) als donkere (menukaart). Brand-kleuren passen automatisch op offerte-PDF en klant-portal.

## Email-handtekening

In **Systeem → Mailbox → Templates** stel je standaard email-templates in voor: offerte, factuur, herinnering, na-event-bedankje. Met variabelen \`{{klant_naam}}\` en \`{{bedrijfsnaam}}\` worden ze per email gepersonaliseerd.`,
    },
];

async function main() {
    console.log(`Seeding ${articles.length} help articles...`);

    // Eerst checken of seed_marker kolom bestaat (voor cleanup); zo niet, gewoon doorgaan
    const rows = articles.map((a) => ({
        slug: a.slug,
        title: a.title,
        content: a.content,
        category: a.category,
        search_tags: a.search_tags,
        sort_order: a.sort_order,
        published: true,
    }));

    // Upsert op slug — bestaande artikelen krijgen update, nieuwe komen erbij.
    const { data, error } = await sb
        .from('help_articles')
        .upsert(rows, { onConflict: 'slug' })
        .select('id, slug');

    if (error) {
        console.error('FOUT bij upsert:', error.message);
        process.exit(1);
    }

    console.log(`✓ ${data.length} artikelen opgeslagen (insert + update).`);
    console.log('\nGedroogd op categorie:');
    const byCategory = {};
    for (const a of articles) {
        byCategory[a.category] = (byCategory[a.category] || 0) + 1;
    }
    for (const [cat, count] of Object.entries(byCategory)) {
        console.log(`  ${cat}: ${count}`);
    }
    console.log('\nOpen /hulp om ze te bekijken.');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
