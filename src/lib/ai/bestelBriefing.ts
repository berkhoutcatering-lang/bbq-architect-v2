/**
 * Bestelbriefing — de AI leest een screenshot (WhatsApp, mail, briefje) en een
 * korte beschrijving van een bestelling die per telefoon of aan de balie
 * binnenkwam, en zet het formulier "Bestelling invoeren" klaar.
 *
 * D/A/H: de AI leest en stelt voor (taal en oordeel), Mathijs kijkt na en slaat
 * op. Hier zit alleen het zuivere deel: de opdracht, en het nalezen van het
 * antwoord. Wat de AI teruggeeft wordt streng gefilterd:
 *   - een product bestaat alleen als de slug in het assortiment staat, anders
 *     wordt het een regel op maat;
 *   - een prijs alleen als die letterlijk genoemd is; anders de catalogus of
 *     "prijs volgt" (geen verzonnen prijzen);
 *   - een datum alleen als echte datum, vandaag of later;
 *   - allergenen uit de vaste lijst, de rest gaat naar "andere".
 */
import { z } from 'zod';
import { ALLERGEEN_KEUZES, BRONNEN, type Bron } from '@/lib/winkel/handmatig';

/** Snel en goed in lezen van screenshots; dit moet aan de balie binnen seconden klaar zijn. */
export const BRIEFING_MODEL = 'claude-sonnet-5-5';

export interface BriefingArtikel {
    slug: string;
    naam: string;
    eenheid: string;
}

export const BRIEFING_SYSTEEM = `Je helpt Hop & Bites, een ambachtswinkel met keuken in Schoonoord. Mathijs krijgt bestellingen per telefoon, WhatsApp, mail of aan de balie. Hij geeft je een of meer screenshots en/of een korte beschrijving. Jij maakt er een briefing van en zet het bestelformulier klaar. Mathijs kijkt alles na voordat het wordt opgeslagen.

# REGELS
- Vul alleen in wat er staat of wat Mathijs zegt. Niet zeker = leeg laten (null) en als vraag noemen.
- Prijs: alleen als die letterlijk in de tekst of op de screenshot staat ("9,95 p.p.", "€ 25 per stuk") — dan als prijs_per_stuk in euro's, per eenheid van het product (per persoon, per stuk). Nooit zelf een prijs bedenken of uitrekenen; niet genoemd = null.
- Producten: gebruik de slug uit het assortiment als het duidelijk dat product is. Anders een regel "op maat" met een korte naam.
- Datum als JJJJ-MM-DD. "Vrijdag", "morgen", "kerstavond" reken je om vanaf de datum van vandaag die je krijgt. Twijfel = null en een vraag.
- Tijd als uu:mm, of null.
- Bron: "telefoon", "balie", "mail" of "anders". WhatsApp-screenshot = "anders", tenzij Mathijs iets anders zegt.
- Allergieën en dieetwensen altijd overnemen, ook als het terloops staat. Een allergie mis je nooit.
- Harde regels zijn dingen als "geen alcohol", "geen olijven": kort, één per regel.
- Briefing: 2 tot 4 korte zinnen in gewoon Nederlands. Wie, wat, wanneer, waar je op moet letten. Geen opsmuk.
- Vragen: wat Mathijs nog moet navragen bij de klant (ontbrekende dag, aantal, contact). Leeg als alles er is.

# ANTWOORD
Alleen één JSON-object, geen tekst eromheen:
{
  "briefing": "string",
  "vragen": ["string"],
  "klant": { "naam": "string|null", "email": "string|null", "telefoon": "string|null" },
  "bron": "telefoon|balie|mail|anders",
  "datum": "JJJJ-MM-DD|null",
  "tijd": "uu:mm|null",
  "regels": [
    { "soort": "artikel", "slug": "string", "aantal": 1, "prijs_per_stuk": "number|null", "toelichting": "string" },
    { "soort": "op-maat", "naam": "string", "aantal": 1, "prijs_per_stuk": "number|null", "toelichting": "string" }
  ],
  "vegetarisch": 0,
  "allergenen": ["string"],
  "harde_regels": ["string"],
  "opmerking": "string"
}`;

export function bouwBriefingVraag(opts: { artikelen: BriefingArtikel[]; beschrijving: string; vandaag: string; weekdag: string; fotoAantal: number }): string {
    const lijst = opts.artikelen.length
        ? opts.artikelen.map((a) => `- ${a.slug} — ${a.naam} (${a.eenheid})`).join('\n')
        : '(leeg)';
    return [
        `Vandaag is ${opts.weekdag} ${opts.vandaag}.`,
        '',
        '# ASSORTIMENT (slug — naam)',
        lijst,
        '',
        `# BESTELLING`,
        opts.fotoAantal > 0 ? `${opts.fotoAantal} screenshot${opts.fotoAantal === 1 ? '' : 's'} hierboven.` : 'Geen screenshot.',
        opts.beschrijving.trim() ? `Mathijs zegt: ${opts.beschrijving.trim()}` : 'Mathijs zegt er niets bij.',
    ].join('\n');
}

/* ── Nalezen ───────────────────────────────────────────────────────────────── */

export interface BriefingRegel {
    soort: 'artikel' | 'op-maat';
    slug: string;
    naam: string;
    aantal: number | null;
    /** Alleen als de prijs letterlijk genoemd is; null = catalogusprijs of prijs volgt. */
    stukCenten: number | null;
    toelichting: string;
}

export interface Briefing {
    briefing: string;
    vragen: string[];
    klant: { naam: string; email: string; telefoon: string };
    bron: Bron;
    datum: string | null;
    tijd: string | null;
    regels: BriefingRegel[];
    vegetarisch: number;
    /** Uit de vaste lijst (kleine letters, zoals ALLERGEEN_KEUZES). */
    allergenen: string[];
    /** Wat niet in de vaste lijst past. */
    andereAllergenen: string[];
    hardeRegels: string[];
    opmerking: string;
}

const tekst = (max: number) => z.string().trim().max(max).catch('');
const lijst = (max: number, lengte: number) => z.array(z.string().trim().min(1).max(lengte)).max(max).catch([]);

const Ruw = z.object({
    briefing: tekst(1200),
    vragen: lijst(10, 300),
    klant: z.object({
        naam: z.string().nullable().catch(null),
        email: z.string().nullable().catch(null),
        telefoon: z.string().nullable().catch(null),
    }).partial().catch({}),
    bron: z.string().nullable().catch(null),
    datum: z.string().nullable().catch(null),
    tijd: z.string().nullable().catch(null),
    regels: z.array(z.object({
        soort: z.string().catch('op-maat'),
        slug: z.string().nullable().optional().catch(null),
        naam: z.string().nullable().optional().catch(null),
        aantal: z.union([z.number(), z.string()]).nullable().optional().catch(null),
        prijs_per_stuk: z.union([z.number(), z.string()]).nullable().optional().catch(null),
        toelichting: z.string().nullable().optional().catch(null),
    }).passthrough()).max(40).catch([]),
    vegetarisch: z.union([z.number(), z.string()]).nullable().catch(null),
    allergenen: lijst(30, 60),
    harde_regels: lijst(20, 200),
    opmerking: tekst(2000),
}).passthrough();

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function heelGetal(v: unknown): number | null {
    const n = typeof v === 'string' ? Number(v.replace(',', '.')) : typeof v === 'number' ? v : NaN;
    return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : null;
}

/** 9.95, "9,95" of "€ 9,95" → 995. Onzin of nul → null. */
function centen(v: unknown): number | null {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[€\s]/g, '').replace(',', '.')) : NaN;
    if (!Number.isFinite(n) || n <= 0 || n > 100_000) return null;
    return Math.round(n * 100);
}

function geldigeDatum(v: string | null, vandaag: string): string | null {
    if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
    const d = new Date(`${v}T12:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return null;
    return v >= vandaag ? v : null;
}

function geldigeTijd(v: string | null): string | null {
    if (!v) return null;
    const m = /^(\d{1,2})[:.](\d{2})$/.exec(v.trim());
    if (!m) return null;
    const u = Number(m[1]);
    const min = Number(m[2]);
    if (u > 23 || min > 59) return null;
    return `${String(u).padStart(2, '0')}:${m[2]}`;
}

/** Leest het antwoord van de AI en houdt alleen over wat klopt. null = onleesbaar. */
export function leesBriefing(ruw: unknown, artikelen: BriefingArtikel[], vandaag: string): Briefing | null {
    if (!ruw || typeof ruw !== 'object') return null;
    const p = Ruw.safeParse(ruw);
    if (!p.success) return null;
    const r = p.data;
    const opSlug = new Map(artikelen.map((a) => [a.slug, a]));

    const regels: BriefingRegel[] = [];
    for (const x of r.regels) {
        const aantal = heelGetal(x.aantal);
        const toelichting = (x.toelichting ?? '').trim().slice(0, 2000);
        const stukCenten = centen(x.prijs_per_stuk);
        const art = x.slug ? opSlug.get(x.slug.trim()) : undefined;
        if (x.soort === 'artikel' && art) {
            regels.push({ soort: 'artikel', slug: art.slug, naam: art.naam, aantal, stukCenten, toelichting });
            continue;
        }
        /* Onbekende slug of op maat: een regel op maat met de naam die de AI gaf. */
        const naam = (x.naam ?? x.slug ?? '').trim().slice(0, 120);
        if (!naam) continue;
        regels.push({ soort: 'op-maat', slug: '', naam, aantal, stukCenten, toelichting });
    }

    const allergenen: string[] = [];
    const andereAllergenen: string[] = [];
    for (const a of r.allergenen) {
        const klein = a.toLowerCase();
        if (ALLERGEEN_KEUZES.includes(klein)) { if (!allergenen.includes(klein)) allergenen.push(klein); }
        else if (!andereAllergenen.includes(a)) andereAllergenen.push(a);
    }

    const email = (r.klant.email ?? '').trim();
    const bron = (BRONNEN as readonly string[]).includes(r.bron ?? '') ? (r.bron as Bron) : 'anders';
    const vega = typeof r.vegetarisch === 'number' ? r.vegetarisch : Number(r.vegetarisch ?? 0);

    return {
        briefing: r.briefing,
        vragen: r.vragen,
        klant: {
            naam: (r.klant.naam ?? '').trim().slice(0, 120),
            email: EMAIL.test(email) && email.length <= 200 ? email : '',
            telefoon: (r.klant.telefoon ?? '').trim().slice(0, 40),
        },
        bron,
        datum: geldigeDatum(r.datum, vandaag),
        tijd: geldigeTijd(r.tijd),
        regels,
        vegetarisch: Number.isInteger(vega) && vega >= 0 && vega <= 10_000 ? vega : 0,
        allergenen,
        andereAllergenen,
        hardeRegels: r.harde_regels,
        opmerking: r.opmerking,
    };
}
