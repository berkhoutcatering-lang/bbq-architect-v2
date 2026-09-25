/**
 * Koppel-voorsteller — welk gerecht maakt de keuken voor dit webshop-artikel,
 * of welk voorraad-item koop je ervoor in?
 * Plan: docs/webshop-beheer-bouwplan.md §5.1.
 *
 * De AI kiest alleen uit wat er al is (de gerechten en voorraad-items van de
 * organisatie). Past er niets, dan zegt hij 'geen' en wat er dan aangemaakt
 * moet worden. Het voorstel komt in winkel_artikelen.koppel_voorstel en
 * Mathijs klikt "Zo doen" of kiest zelf — hier wordt niets vastgelegd.
 *
 * Patroon: aliasSuggester.ts. Haiku 4.5, Zod op de uitvoer, kosten geteld in
 * ai_usage, faalt stil met een leesbare reden.
 */
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { checkAiCostCapServer, logAiUsageServer } from '@/lib/aiUsageServer';

const MODEL_HAIKU = 'claude-haiku-4-5-20251001';
const HAIKU_INPUT_PER_MTOK_USD = 1;
const HAIKU_OUTPUT_PER_MTOK_USD = 5;
const HAIKU_CACHE_READ_MULT = 0.1;
const HAIKU_CACHE_WRITE_5M_MULT = 1.25;
const USD_TO_EUR_CENTS = 92;
const MAX_ARTIKELEN_PER_AANROEP = 30;

export interface KoppelArtikel {
    id: string;
    naam: string;
    eenheid: string;
    telt: 'stuks' | 'personen';
    moment_soort: 'geen' | 'moment' | 'dag';
    verzendbaar: boolean;
}
export interface KoppelGerecht { id: string; naam: string }
export interface KoppelVoorraad { id: number; naam: string; unit: string | null }

export interface KoppelVoorstel {
    soort: 'gerecht' | 'voorraad' | 'geen';
    /** gerecht-uuid of inventory-id; null bij 'geen'. */
    id: string | number | null;
    naam: string | null;
    zekerheid: 'hoog' | 'laag';
    /** Eén zin, in mensentaal. Bij 'geen': wat er aangemaakt moet worden. */
    reden: string;
}

export interface KoppelUitkomst {
    voorstellen: Map<string, KoppelVoorstel>;
    /** Waarom er (deels) geen voorstel is: budget op, model niet bereikbaar, … */
    fout?: string;
    costCents: number;
}

const SYSTEEM = `Je koppelt webshop-artikelen van een BBQ-cateraar (BBQ Architect, Hop & Bites) aan wat er in de keuken al bestaat.

Je krijgt drie lijsten: ARTIKELEN (uit de webshop), GERECHTEN (wat de keuken kan maken) en VOORRAAD (wat er ingekocht wordt).

VOOR ELK ARTIKEL kies je precies één van:
  "gerecht"  — de keuken MAAKT dit voor het artikel. Typisch: het artikel wordt op een afhaalmoment of -dag opgehaald, telt in personen, is gekoeld (planken, boxen, menu's).
  "voorraad" — dit wordt INGEKOCHT en doorverkocht. Typisch: telt in stuks, verzendbaar, een fles, zak, blik of doos van één product (bier, saus, noten).
  "geen"     — er staat niets passends in de lijsten. Zeg dan in 'reden' wat er aangemaakt zou moeten worden ("een voorraad-item 'bier Drenthe'" of "een gerecht 'Kerst-Box'").

STRIKTE REGELS:
1. Kies ALLEEN id's die letterlijk in de lijsten staan. Nooit een id verzinnen.
2. Een naam die alleen vaag lijkt is "laag"; een naam die hetzelfde product benoemt is "hoog".
3. Een doos met meerdere producten (borrelbox, bierpakket) is "geen" tenzij er een gerecht met die naam bestaat — een doos is geen enkel voorraad-item.
4. Verzin geen prijzen, hoeveelheden of ingrediënten. Alleen de koppeling.
5. Output: één JSON-array, per artikel {"artikel_id","soort","id","zekerheid","reden"}. Geen markdown, geen uitleg buiten de array. 'reden' is één korte Nederlandse zin.`;

const voorstelSchema = z.object({
    artikel_id: z.string().min(1),
    soort: z.enum(['gerecht', 'voorraad', 'geen']),
    id: z.union([z.string(), z.number()]).nullable().optional(),
    zekerheid: z.enum(['hoog', 'laag']).optional().default('laag'),
    reden: z.string().max(240).optional().default(''),
});
const uitvoerSchema = z.array(voorstelSchema).max(MAX_ARTIKELEN_PER_AANROEP);

async function metHerhaling<T>(fn: () => Promise<T>, pogingen = 3): Promise<T> {
    let laatste: unknown;
    for (let i = 0; i < pogingen; i++) {
        try {
            return await fn();
        } catch (e: unknown) {
            laatste = e;
            const status = (e as { status?: number })?.status;
            const herhaalbaar = status === 429 || status === 529 || (status != null && status >= 500);
            if (!herhaalbaar || i >= pogingen - 1) throw e;
            await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** i + Math.random() * 500, 10_000)));
        }
    }
    throw laatste;
}

/**
 * Vraagt per artikel een koppeling. Hooguit 30 artikelen per aanroep (meer
 * wordt in stukken geknipt). Wat niet klopt (onbekend id) wordt 'geen' met
 * de reden erbij — nooit een verzonnen koppeling.
 */
export async function stelKoppelingenVoor(
    organizationId: string,
    artikelen: KoppelArtikel[],
    gerechten: KoppelGerecht[],
    voorraad: KoppelVoorraad[],
): Promise<KoppelUitkomst> {
    const leeg: KoppelUitkomst = { voorstellen: new Map(), costCents: 0 };
    if (artikelen.length === 0) return leeg;

    if (artikelen.length > MAX_ARTIKELEN_PER_AANROEP) {
        const totaal: KoppelUitkomst = { voorstellen: new Map(), costCents: 0 };
        for (let i = 0; i < artikelen.length; i += MAX_ARTIKELEN_PER_AANROEP) {
            const deel = await stelKoppelingenVoor(organizationId, artikelen.slice(i, i + MAX_ARTIKELEN_PER_AANROEP), gerechten, voorraad);
            deel.voorstellen.forEach((v, k) => totaal.voorstellen.set(k, v));
            totaal.costCents += deel.costCents;
            if (deel.fout) totaal.fout = deel.fout;
        }
        return totaal;
    }

    const cap = await checkAiCostCapServer(organizationId);
    if (!cap.allowed && cap.reason === 'over_cap') {
        return { ...leeg, fout: `AI-budget voor deze maand is op (€${(cap.usedCents / 100).toFixed(2)} van €${(cap.capCents / 100).toFixed(2)}). Koppel zelf, of wacht tot volgende maand.` };
    }
    if (!process.env.ANTHROPIC_API_KEY) return { ...leeg, fout: 'Geen AI-sleutel ingesteld (ANTHROPIC_API_KEY).' };

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
    const invoer = {
        ARTIKELEN: artikelen.map((a) => ({ id: a.id, naam: a.naam, eenheid: a.eenheid, telt: a.telt, afhalen: a.moment_soort, verzendbaar: a.verzendbaar })),
        GERECHTEN: gerechten.map((g) => ({ id: g.id, naam: g.naam })),
        VOORRAAD: voorraad.map((v) => ({ id: v.id, naam: v.naam, eenheid: v.unit ?? null })),
    };

    let antwoord: Anthropic.Messages.Message;
    try {
        antwoord = await metHerhaling(() => client.messages.create({
            model: MODEL_HAIKU,
            max_tokens: 2500,
            system: [{ type: 'text', text: SYSTEEM, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: `Koppel elk artikel. Output: JSON-array.\n\n${JSON.stringify(invoer)}` }],
        }));
    } catch (e) {
        const m = e instanceof Error ? e.message : 'onbekend';
        console.warn('[winkelKoppelVoorsteller] aanroep mislukt:', m.slice(0, 200));
        return { ...leeg, fout: 'De koppel-voorsteller was even niet bereikbaar. Probeer het straks nog eens, of koppel zelf.' };
    }

    const u = antwoord.usage;
    const inTok = u.input_tokens ?? 0;
    const outTok = u.output_tokens ?? 0;
    const cacheRead = u.cache_read_input_tokens ?? 0;
    const cacheWrite = u.cache_creation_input_tokens ?? 0;
    const costUsd = (inTok * HAIKU_INPUT_PER_MTOK_USD + outTok * HAIKU_OUTPUT_PER_MTOK_USD
        + cacheRead * HAIKU_INPUT_PER_MTOK_USD * HAIKU_CACHE_READ_MULT
        + cacheWrite * HAIKU_INPUT_PER_MTOK_USD * HAIKU_CACHE_WRITE_5M_MULT) / 1_000_000;
    const costCents = Math.round(costUsd * USD_TO_EUR_CENTS);
    void logAiUsageServer({
        organization_id: organizationId, action_type: 'other', model: MODEL_HAIKU,
        tokens_input: inTok, tokens_output: outTok, tokens_cache_read: cacheRead, tokens_cache_creation: cacheWrite,
        cost_eur_cents: costCents, metadata: { feature: 'winkel_koppel', artikelen: artikelen.length },
    });

    const tekst = antwoord.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
    const voorstellen = new Map<string, KoppelVoorstel>();
    let parsed: unknown;
    try {
        parsed = JSON.parse(tekst.replace(/^[\s\S]*?(\[)/, '[').replace(/](?![\s\S]*])/, ']').trim());
    } catch {
        return { voorstellen, costCents, fout: 'Het antwoord van de koppel-voorsteller was niet leesbaar. Koppel zelf.' };
    }
    const r = uitvoerSchema.safeParse(parsed);
    if (!r.success) return { voorstellen, costCents, fout: 'Het antwoord van de koppel-voorsteller had niet de verwachte vorm. Koppel zelf.' };

    const gerechtOpId = new Map(gerechten.map((g) => [g.id, g]));
    const voorraadOpId = new Map(voorraad.map((v) => [String(v.id), v]));
    const artikelIds = new Set(artikelen.map((a) => a.id));
    for (const v of r.data) {
        if (!artikelIds.has(v.artikel_id)) continue;
        const reden = v.reden.trim();
        if (v.soort === 'gerecht') {
            const g = v.id != null ? gerechtOpId.get(String(v.id)) : undefined;
            voorstellen.set(v.artikel_id, g
                ? { soort: 'gerecht', id: g.id, naam: g.naam, zekerheid: v.zekerheid, reden }
                : { soort: 'geen', id: null, naam: null, zekerheid: 'laag', reden: reden || 'Het voorgestelde gerecht bestaat niet.' });
        } else if (v.soort === 'voorraad') {
            const i = v.id != null ? voorraadOpId.get(String(v.id)) : undefined;
            voorstellen.set(v.artikel_id, i
                ? { soort: 'voorraad', id: i.id, naam: i.naam, zekerheid: v.zekerheid, reden }
                : { soort: 'geen', id: null, naam: null, zekerheid: 'laag', reden: reden || 'Het voorgestelde voorraad-item bestaat niet.' });
        } else {
            voorstellen.set(v.artikel_id, { soort: 'geen', id: null, naam: null, zekerheid: 'laag', reden: reden || 'Nog niets passends; maak eerst een gerecht of voorraad-item aan.' });
        }
    }
    return { voorstellen, costCents };
}

export const KOPPEL_MODEL = MODEL_HAIKU;
