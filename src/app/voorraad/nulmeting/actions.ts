/**
 * Server Actions voor de keuken-telling (nulmeting).
 *
 * Eén actie doet het hele gebaar dat de cateraar in de keuken maakt:
 * "dit product, zoveel pakken van zoveel, hier ligt het, en dit is de foto".
 *
 * Bewust één actie in plaats van los aanmaken + los tellen: in de keuken staat
 * hij met een pak in zijn hand voor een open vriezer. Twee rondjes wachten op
 * het netwerk is één te veel.
 *
 * Hard rule 5 (BBQ Architect): Zod-validatie + re-auth in elke action.
 * RLS-insert-klasse: organization_id gaat ALTIJD expliciet mee.
 */

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';
import { applyStockDelta } from '@/lib/dal/stockMutation';
import { telTotaal } from '@/lib/voorraadTelling';

const FOTO_BUCKET = 'voorraad-fotos';
/* Zo lang blijft een fotolink geldig. Ruim genoeg voor een middag tellen,
   kort genoeg dat een gedeelde link niet eeuwig blijft werken. */
const FOTO_URL_GELDIG_SEC = 60 * 60 * 24 * 7;

const TelProductSchema = z.object({
    /* Bestaat het item al? Dan bijwerken i.p.v. een tweede rij maken. */
    inventory_id: z.coerce.number().int().positive().nullable().optional(),

    naam: z.string().trim().min(1, 'Naam is verplicht').max(200),
    categorie: z.string().max(100).optional().default('Overig'),

    /* De rekenhulp: aantal pakken × inhoud per pak, in `eenheid`. */
    aantal_pakken: z.coerce.number().min(0, 'Kan niet negatief'),
    inhoud_per_pak: z.coerce.number().positive('Inhoud moet groter dan 0 zijn'),
    eenheid: z.string().trim().min(1).max(50),

    /* Waar in de keuken — dit is de looproute. */
    zone: z.enum(['vries', 'vers', 'houdbaar']),

    /* Hoeveel wil je hier minimaal van hebben? Voedt de bestellijst. */
    par_level: z.coerce.number().min(0).optional().default(0),

    /* Prijs per `eenheid`. Alleen meesturen als hij écht is afgeleid
       (zie prijsPerEenheid) — null betekent "nog onbekend", niet €0. */
    prijs_per_eenheid: z.coerce.number().min(0).nullable().optional(),

    leverancier_naam: z.string().max(200).optional().default(''),
    leverancier_id: z.coerce.number().int().positive().nullable().optional(),
    /* Vaste leverancier-koppeling uit de gescande bestel-catalogus. */
    supplier_product_id: z.coerce.number().int().positive().nullable().optional(),

    /* Foto als data-URL (client verkleint eerst). Leeg = geen foto. */
    foto_data_url: z.string().max(1_500_000).nullable().optional(),
});

export type TelProductInput = z.input<typeof TelProductSchema>;

export interface TelProductResult {
    id: number;
    naam: string;
    eenheid: string;
    totaal: number;
    /** Wat er vóór deze telling stond — zodat het scherm "was 3, nu 4" kan tonen. */
    vorige_stand: number;
    nieuw_item: boolean;
    foto_url: string | null;
}

interface ActionResult<T = unknown> {
    data?: T;
    error?: string;
    fields?: Record<string, string[]>;
}

/* ─── telProduct ──────────────────────────────────────────────────────── */

export async function telProduct(input: unknown): Promise<ActionResult<TelProductResult>> {
    const parsed = TelProductSchema.safeParse(input);
    if (!parsed.success) {
        return { error: 'validation', fields: parsed.error.flatten().fieldErrors as Record<string, string[]> };
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'unauthorized' };

    const orgId = await actieveOrganisatie(supabase, user.id);
    if (!orgId) return { error: 'geen actieve organisatie gevonden' };

    const res = await legVast(supabase, orgId, parsed.data);
    if ('error' in res) return { error: res.error };

    revalidatePath('/voorraad');
    revalidatePath('/voorraad/nulmeting');
    revalidatePath('/inkoop');
    return { data: res.data };
}

/** De organisatie waar deze gebruiker actief lid van is. */
async function actieveOrganisatie(
    supabase: Awaited<ReturnType<typeof createServerSupabase>>,
    userId: string,
): Promise<string | null> {
    const { data } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    return (data?.organization_id as string | undefined) ?? null;
}

/**
 * Eén product vastleggen. Losgetrokken uit telProduct zodat de plak-lijst
 * exact hetzelfde pad gebruikt: één rij tellen via het scherm en dertig rijen
 * tellen via een geplakte lijst mogen nooit anders in de database landen.
 */
async function legVast(
    supabase: Awaited<ReturnType<typeof createServerSupabase>>,
    orgId: string,
    v: z.output<typeof TelProductSchema>,
): Promise<{ data: TelProductResult } | { error: string }> {
    const totaal = telTotaal(v.aantal_pakken, v.inhoud_per_pak);

    /* ── 1. Bestaand item vinden ──────────────────────────────────────
       Op id als het scherm die meegeeft, anders op naam. De naam-check is er
       omdat er een unique-index (ux_inventory_naam_org) op ligt: zonder deze
       stap krijgt de cateraar een database-fout in plaats van een bijgewerkte
       telling wanneer hij een product tegenkomt dat al bestond. */
    let bestaand: { id: number; current_stock: number | null; foto_url: string | null } | null = null;

    if (v.inventory_id) {
        const { data } = await supabase
            .from('inventory')
            .select('id, current_stock, foto_url')
            .eq('id', v.inventory_id)
            .maybeSingle();
        if (data) bestaand = data as typeof bestaand;
    }
    if (!bestaand) {
        const { data } = await supabase
            .from('inventory')
            .select('id, current_stock, foto_url')
            .eq('organization_id', orgId)
            .ilike('naam', v.naam)
            .limit(1)
            .maybeSingle();
        if (data) bestaand = data as typeof bestaand;
    }

    /* ── 2. Foto opslaan (best-effort) ────────────────────────────────
       De telling is de hoofdzaak; een mislukte upload mag hem niet blokkeren.
       Wel eerlijk terugmelden, zodat het scherm geen fotootje suggereert dat
       er niet is. */
    let fotoPad: string | null = bestaand?.foto_url ?? null;
    if (v.foto_data_url) {
        const opgeslagen = await uploadFoto(supabase, orgId, v.foto_data_url);
        if (opgeslagen) {
            /* Oude foto opruimen — anders groeit de bucket met elke hertelling. */
            if (bestaand?.foto_url && bestaand.foto_url !== opgeslagen) {
                await supabase.storage.from(FOTO_BUCKET).remove([bestaand.foto_url]).catch(() => { /* niet blokkerend */ });
            }
            fotoPad = opgeslagen;
        }
    }

    /* ── 3. Het item zelf ─────────────────────────────────────────────
       par_level én min_stock krijgen dezelfde waarde: "hier wil ik minimaal
       zoveel van hebben" is één getal in het hoofd van de cateraar. par_level
       is wat de bestelmotor als doel gebruikt, min_stock wat het overzicht als
       drempel kleurt — die twee uit elkaar laten lopen levert een item op dat
       oranje kleurt maar niet besteld wordt (of andersom). */
    const velden: Record<string, unknown> = {
        naam: v.naam,
        categorie: v.categorie || 'Overig',
        unit: v.eenheid,
        storage_type: v.zone,
        par_level: v.par_level,
        min_stock: v.par_level,
        last_count_at: new Date().toISOString(),
        foto_url: fotoPad,
    };
    /* Prijs alleen aanraken als hij is afgeleid. null = onbekend gebleven;
       dan laten we staan wat er stond in plaats van er €0 van te maken. */
    if (v.prijs_per_eenheid != null && v.prijs_per_eenheid > 0) {
        velden.purchase_price = v.prijs_per_eenheid;
    }
    if (v.leverancier_naam) velden.supplier = v.leverancier_naam;
    if (v.leverancier_id != null) velden.leverancier_id = v.leverancier_id;
    if (v.supplier_product_id != null) velden.preferred_supplier_product_id = v.supplier_product_id;

    let itemId: number;
    const vorigeStand = Number(bestaand?.current_stock ?? 0);
    const nieuwItem = !bestaand;

    if (bestaand) {
        const { error } = await supabase.from('inventory').update(velden).eq('id', bestaand.id);
        if (error) return { error: error.message };
        itemId = bestaand.id;
    } else {
        const { data, error } = await supabase
            .from('inventory')
            .insert({
                ...velden,
                organization_id: orgId,
                current_stock: 0, // de telling zelf loopt hieronder via de stock-RPC
            })
            .select('id')
            .single();
        if (error) {
            if (String(error.message || '').includes('ux_inventory_naam_org')) {
                return { error: `"${v.naam}" bestond net al — open het item en tel het daar bij.` };
            }
            return { error: error.message };
        }
        itemId = data.id as number;
    }

    /* ── 4. De telling wegschrijven ───────────────────────────────────
       Een telling is een absolute stand, geen bijboeking. We schrijven het
       verschil weg via de gedeelde atomaire RPC, zodat de mutatie in
       stock_movements terechtkomt (type 'count') en de historie klopt. */
    const delta = totaal - vorigeStand;
    if (delta !== 0) {
        const nieuweStand = await applyStockDelta(supabase, orgId, {
            inventoryId: itemId,
            delta,
            type: 'count',
            unitPrice: v.prijs_per_eenheid ?? null,
            note: `Keuken-telling · ${v.aantal_pakken} × ${v.inhoud_per_pak} ${v.eenheid}`,
        });
        if (nieuweStand == null) {
            return { error: 'Item opgeslagen, maar de telling kon niet worden weggeschreven — probeer opnieuw te tellen.' };
        }
    }

    return {
        data: {
            id: itemId,
            naam: v.naam,
            eenheid: v.eenheid,
            totaal,
            vorige_stand: vorigeStand,
            nieuw_item: nieuwItem,
            foto_url: fotoPad ? await signedFotoUrl(supabase, fotoPad) : null,
        },
    };
}

/* ─── telLijst ────────────────────────────────────────────────────────────
   Een hele geplakte lijst in één keer wegschrijven.

   Bestaat omdat product-voor-product tikken niet werkt als je met twintig
   regels op een kladblaadje voor een open vriezer staat. De regels zijn op het
   scherm al nagelopen en gecorrigeerd; hier worden ze alleen nog vastgelegd —
   via exact hetzelfde pad als één losse telling. */

const LijstRegelSchema = z.object({
    naam: z.string().trim().min(1).max(200),
    aantal_pakken: z.coerce.number().min(0),
    inhoud_per_pak: z.coerce.number().positive(),
    eenheid: z.string().trim().min(1).max(50),
    par_level: z.coerce.number().min(0).optional().default(0),
});

const TelLijstSchema = z.object({
    zone: z.enum(['vries', 'vers', 'houdbaar']),
    /* Bovengrens is een vangnet tegen een geplakt boek, geen echte limiet:
       een vriezer met meer dan 200 verschillende producten bestaat niet. */
    regels: z.array(LijstRegelSchema).min(1).max(200),
});

export interface TelLijstResult {
    /** Per regel wat ermee gebeurd is, in dezelfde volgorde als geplakt. */
    resultaten: Array<{
        naam: string;
        gelukt: boolean;
        nieuw: boolean;
        totaal: number;
        eenheid: string;
        fout?: string;
    }>;
    opgeslagen: number;
    mislukt: number;
}

export async function telLijst(input: unknown): Promise<ActionResult<TelLijstResult>> {
    const parsed = TelLijstSchema.safeParse(input);
    if (!parsed.success) {
        return { error: 'validation', fields: parsed.error.flatten().fieldErrors as Record<string, string[]> };
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'unauthorized' };

    const orgId = await actieveOrganisatie(supabase, user.id);
    if (!orgId) return { error: 'geen actieve organisatie gevonden' };

    const resultaten: TelLijstResult['resultaten'] = [];

    /* Bewust één voor één en niet in bulk: elke regel moet z'n eigen
       stock_movement krijgen (anders klopt de historie niet) en één rotte regel
       mag de andere achttien niet meeslepen. Twintig regels is een fractie van
       een seconde; correctheid weegt hier zwaarder dan een bulk-insert. */
    for (const r of parsed.data.regels) {
        const res = await legVast(supabase, orgId, {
            inventory_id: null,
            naam: r.naam,
            categorie: 'Overig',
            aantal_pakken: r.aantal_pakken,
            inhoud_per_pak: r.inhoud_per_pak,
            eenheid: r.eenheid,
            zone: parsed.data.zone,
            par_level: r.par_level,
            prijs_per_eenheid: null,
            leverancier_naam: '',
            leverancier_id: null,
            supplier_product_id: null,
            foto_data_url: null,
        });

        if ('error' in res) {
            resultaten.push({ naam: r.naam, gelukt: false, nieuw: false, totaal: 0, eenheid: r.eenheid, fout: res.error });
        } else {
            resultaten.push({
                naam: res.data.naam, gelukt: true, nieuw: res.data.nieuw_item,
                totaal: res.data.totaal, eenheid: res.data.eenheid,
            });
        }
    }

    revalidatePath('/voorraad');
    revalidatePath('/voorraad/nulmeting');
    revalidatePath('/inkoop');

    return {
        data: {
            resultaten,
            opgeslagen: resultaten.filter((r) => r.gelukt).length,
            mislukt: resultaten.filter((r) => !r.gelukt).length,
        },
    };
}

/* ─── Foto-helpers ────────────────────────────────────────────────────── */

/** Data-URL → private bucket. Returnt het opgeslagen pad, of null bij falen. */
async function uploadFoto(
    supabase: Awaited<ReturnType<typeof createServerSupabase>>,
    orgId: string,
    dataUrl: string,
): Promise<string | null> {
    try {
        const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(dataUrl);
        if (!match) return null;
        const mime = match[1];
        const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
        const bytes = Buffer.from(match[2], 'base64');
        if (bytes.byteLength === 0 || bytes.byteLength > 5 * 1024 * 1024) return null;

        /* Eerste map = organization_id; daar hangt de storage-policy op. */
        const pad = `${orgId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage
            .from(FOTO_BUCKET)
            .upload(pad, bytes, { contentType: mime, upsert: false });
        if (error) return null;
        return pad;
    } catch {
        return null;
    }
}

/** Kortlopende leeslink voor een foto in de private bucket. */
async function signedFotoUrl(
    supabase: Awaited<ReturnType<typeof createServerSupabase>>,
    pad: string,
): Promise<string | null> {
    try {
        const { data } = await supabase.storage.from(FOTO_BUCKET).createSignedUrl(pad, FOTO_URL_GELDIG_SEC);
        return data?.signedUrl ?? null;
    } catch {
        return null;
    }
}

/* ─── Zone wijzigen zonder opnieuw te tellen ──────────────────────────
   Voor het opruimen achteraf: een item dat in de verkeerde kast bleek te
   liggen hoef je niet opnieuw te tellen om te verplaatsen. */
const ZetZoneSchema = z.object({
    inventory_id: z.coerce.number().int().positive(),
    zone: z.enum(['vries', 'vers', 'houdbaar']),
});

export async function zetZone(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = ZetZoneSchema.safeParse(input);
    if (!parsed.success) return { error: 'validation' };

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'unauthorized' };

    const { error } = await supabase
        .from('inventory')
        .update({ storage_type: parsed.data.zone })
        .eq('id', parsed.data.inventory_id);
    if (error) return { error: error.message };

    revalidatePath('/voorraad/nulmeting');
    revalidatePath('/voorraad');
    return { data: { ok: true } };
}
