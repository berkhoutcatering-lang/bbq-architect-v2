/**
 * De vriezerlijst (Keuken → Vriezer): wat aan de kassa is ingevroren (Toonbank, pakjes/eruit,
 * invriezen) en nog niet als gebruikt is afgevinkt, oudste bovenaan. Ingevroren vlees is voor
 * eigen gebruik, niet om weer te verkopen. Bron: winkel_stuks (ingevroren_op, opgebruikt_at),
 * migratie 20261120130000.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface VriezerStuk {
    id: string;
    naam: string;
    /** Bij kaas met een eigen sticker; een pakje van de slager heeft geen gewicht. */
    gewicht_g: number | null;
    prijs_cents: number;
    tht: string | null;
    ingevroren_op: string;
    opgebruikt_at: string | null;
    /** Wie het aan de kassa invroor (personeel), als dat bekend is. */
    door: string | null;
}

export interface Vriezer {
    /** Nog in de vriezer, oudste bovenaan. */
    open: VriezerStuk[];
    /** De laatste die als gebruikt zijn afgevinkt (om een vergissing terug te draaien). */
    gebruikt: VriezerStuk[];
    /** De migratie draait nog niet. */
    ontbreekt: boolean;
}

const NIET_GEMIGREERD = new Set(['42703', '42P01', 'PGRST200', 'PGRST204', 'PGRST205']);

type Rij = {
    id: string; gewicht_g: number | null; prijs_cents: number; tht: string | null; ingevroren_op: string; opgebruikt_at: string | null;
    winkel_producten: { naam: string } | { naam: string }[] | null;
};

/** Hoeveel hele dagen iets in de vriezer ligt (Nederlandse kalenderdagen). */
export function dagenIngevroren(ingevroren_op: string, vandaag: string): number {
    const d = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
    return Math.max(0, Math.round((d(vandaag) - d(ingevroren_op)) / 86_400_000));
}

/** Oudste invriesdatum eerst; bij dezelfde dag de vroegste THT, dan op naam. */
export function sorteerVriezer(a: VriezerStuk, b: VriezerStuk): number {
    return a.ingevroren_op.localeCompare(b.ingevroren_op)
        || (a.tht ?? '9999').localeCompare(b.tht ?? '9999')
        || a.naam.localeCompare(b.naam, 'nl');
}

export async function laadVriezer(supabase: SupabaseClient, orgId: string): Promise<Vriezer> {
    const kolommen = 'id, gewicht_g, prijs_cents, tht, ingevroren_op, opgebruikt_at, winkel_producten(naam)';
    const [open, gebruikt] = await Promise.all([
        supabase.from('winkel_stuks').select(kolommen).eq('organization_id', orgId)
            .not('ingevroren_op', 'is', null).is('opgebruikt_at', null)
            .order('ingevroren_op', { ascending: true }).limit(500),
        supabase.from('winkel_stuks').select(kolommen).eq('organization_id', orgId)
            .not('opgebruikt_at', 'is', null)
            .order('opgebruikt_at', { ascending: false }).limit(10),
    ]);
    const fout = open.error ?? gebruikt.error;
    if (fout && NIET_GEMIGREERD.has(String(fout.code))) return { open: [], gebruikt: [], ontbreekt: true };
    if (fout) throw new Error(fout.message);

    const rijen = [...(open.data ?? []), ...(gebruikt.data ?? [])] as unknown as Rij[];
    // Wie het invroor staat in het logboek van de kassa.
    const doorBij = new Map<string, string>();
    if (rijen.length) {
        const { data } = await supabase.from('winkel_stuk_eruit')
            .select('stuk_id, personeel(naam)').eq('organization_id', orgId)
            .in('stuk_id', rijen.map((r) => r.id)).eq('wat', 'invriezen').is('teruggezet_at', null);
        for (const r of (data ?? []) as unknown as { stuk_id: string; personeel: { naam: string } | { naam: string }[] | null }[]) {
            const p = Array.isArray(r.personeel) ? r.personeel[0] : r.personeel;
            if (p?.naam) doorBij.set(r.stuk_id, p.naam);
        }
    }
    const naar = (r: Rij): VriezerStuk => {
        const p = Array.isArray(r.winkel_producten) ? r.winkel_producten[0] : r.winkel_producten;
        return {
            id: r.id, naam: p?.naam ?? 'Onbekend product', gewicht_g: r.gewicht_g, prijs_cents: r.prijs_cents,
            tht: r.tht ? r.tht.slice(0, 10) : null, ingevroren_op: r.ingevroren_op.slice(0, 10), opgebruikt_at: r.opgebruikt_at,
            door: doorBij.get(r.id) ?? null,
        };
    };
    return {
        open: ((open.data ?? []) as unknown as Rij[]).map(naar).sort(sorteerVriezer),
        gebruikt: ((gebruikt.data ?? []) as unknown as Rij[]).map(naar),
        ontbreekt: false,
    };
}
