/**
 * Een streepjescode aan een winkelproduct koppelen, vervangen of weghalen.
 * Pagina: /voorraad/winkel/codes. Ook gebruikt door de productlade
 * (zetBestelgegevens) en "Product toevoegen" (nieuwProduct) voor de controle
 * op dubbelen, zodat er één manier van opslaan is.
 *
 * - De code zelf: controleerEan (./ean.ts).
 * - Dubbel: hoort de code (of zijn UPC-A/EAN-13-tweeling) al bij een ander
 *   product van deze organisatie, dan noemen we dat product en koppelen we
 *   niets. De unieke index winkel_producten_ean_uniek is het vangnet voor
 *   twee gelijktijdige scans (eanFoutMelding).
 * - De kassa: een gewijzigde ean hoogt winkel_catalogus_versie vanzelf op
 *   (trigger trg_winkel_cv_product, migratie 20261118130000), dus de
 *   Toonbank haalt de code bij de volgende peiling op.
 *
 * Geen Supabase hier: de opslag komt binnen als EanOpslag, zodat de regels
 * zonder database te testen zijn.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { controleerEan, eanVarianten } from './ean';
import { eanFoutMelding } from './toonbankVelden';

export interface EanProduct {
    id: string;
    naam: string;
    ean: string | null;
}

interface DbFout { code?: string | null; message?: string | null; details?: string | null }

export interface EanOpslag {
    product(id: string): Promise<EanProduct | null>;
    /** Producten van deze organisatie met een van deze codes. */
    metCodes(codes: string[]): Promise<EanProduct[]>;
    zetEan(id: string, ean: string | null): Promise<DbFout | null>;
}

export type KoppelUitkomst =
    | { ok: true; product: { id: string; naam: string }; ean: string | null; vorige: string | null }
    | { ok: false; fout: string; bijProduct?: { id: string; naam: string } };

/**
 * Hoort deze code al bij een ander product? Dan dat product, anders null.
 * `behalve` = het product dat de code krijgt (null bij een nieuw product).
 */
export async function eanBijAnderProduct(db: EanOpslag, ean: string, behalve: string | null): Promise<EanProduct | null> {
    const treffers = await db.metCodes(eanVarianten(ean));
    return treffers.find((p) => p.id !== behalve) ?? null;
}

export function bezetMelding(ander: { naam: string }): string {
    return `Deze code hoort al bij ${ander.naam}. Er is niets gekoppeld.`;
}

/**
 * Koppel `invoer` aan het product, of haal de code weg met `invoer` = null.
 * Een andere code op het product wordt vervangen; de oude komt terug als
 * `vorige`, zodat het scherm "was …" kan zeggen.
 */
export async function koppelEan(db: EanOpslag, productId: string, invoer: string | null): Promise<KoppelUitkomst> {
    let ean: string | null = null;
    if (invoer != null) {
        const c = controleerEan(invoer);
        if (c.ok === false) return { ok: false, fout: c.fout };
        ean = c.code;
    }

    const product = await db.product(productId);
    if (!product) return { ok: false, fout: 'Dit product bestaat niet (meer). Ververs de pagina.' };
    const naar = { id: product.id, naam: product.naam };

    if (ean === product.ean) return { ok: true, product: naar, ean, vorige: product.ean };

    if (ean != null) {
        const ander = await eanBijAnderProduct(db, ean, product.id);
        if (ander) return { ok: false, fout: bezetMelding(ander), bijProduct: { id: ander.id, naam: ander.naam } };
    }

    const fout = await db.zetEan(product.id, ean);
    if (fout) return { ok: false, fout: eanFoutMelding(fout) ?? 'Opslaan lukte niet. Probeer het nog een keer.' };
    return { ok: true, product: naar, ean, vorige: product.ean };
}

/** De echte opslag: winkel_producten van één organisatie. */
export function supabaseEanOpslag(supabase: SupabaseClient, orgId: string): EanOpslag {
    return {
        async product(id) {
            const { data } = await supabase.from('winkel_producten').select('id, naam, ean')
                .eq('id', id).eq('organization_id', orgId).maybeSingle();
            return (data as EanProduct | null) ?? null;
        },
        async metCodes(codes) {
            const { data } = await supabase.from('winkel_producten').select('id, naam, ean')
                .eq('organization_id', orgId).in('ean', codes);
            return (data ?? []) as EanProduct[];
        },
        async zetEan(id, ean) {
            const { error } = await supabase.from('winkel_producten').update({ ean })
                .eq('id', id).eq('organization_id', orgId);
            return error;
        },
    };
}
