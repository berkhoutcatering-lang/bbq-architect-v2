/**
 * Van partij naar labeldata. Alles komt uit de partij en het component;
 * de template verzint niets. De QR bevat alleen de URL naar de eenheid
 * (scan_token), nooit de gegevens zelf.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProductielabelData } from '../labelprinter/templates/productielabel';
import type { LabelVerzoek } from '../labelprinter/render';
import { formatInhoud, normaliseerEenheid } from './eenheden';
import { laadPartijDetail } from './detail';

export type LabelsUitkomst =
    | { ok: true; verzoek: LabelVerzoek; partijId: string; eenheidIds: string[] }
    | { ok: false; status: number; error: string };

/** Basis-URL voor de QR: de app-URL uit de omgeving, anders de host van het verzoek. */
export function scanBasisUrl(reqUrl: string): string {
    const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (env) return env.replace(/\/+$/, '');
    return new URL(reqUrl).origin;
}

/**
 * Labels voor een partij (alle eenheden) of voor een selectie eenheden
 * (herprint / "print ontbrekende"). Bij herprint moeten alle eenheden bij
 * dezelfde partij horen — anders is de unit-telling op het label onzin.
 */
export async function laadPartijLabels(
    supabase: SupabaseClient,
    orgId: string,
    keuze: { partijId: string; eenheidIds?: string[] | null; soort: 'partij_labels' } | { eenheidIds: string[]; soort: 'herprint' },
    basisUrl: string,
): Promise<LabelsUitkomst> {
    let partijId: string;
    if (keuze.soort === 'herprint') {
        const { data, error } = await supabase
            .from('voorraad_eenheden')
            .select('partij_id')
            .eq('organization_id', orgId)
            .in('id', keuze.eenheidIds);
        if (error) return { ok: false, status: 500, error: error.message };
        const partijen = new Set(((data ?? []) as Array<{ partij_id: string }>).map((r) => r.partij_id));
        if (partijen.size === 0) return { ok: false, status: 404, error: 'Eenheden niet gevonden' };
        if (partijen.size > 1) return { ok: false, status: 400, error: 'Herprint kan maar één partij tegelijk' };
        partijId = [...partijen][0];
    } else {
        partijId = keuze.partijId;
    }

    const d = await laadPartijDetail(supabase, orgId, { partijId });
    if (d.ok === false) return d;
    const { partij, eenheden, component } = d.data;

    const selectie = keuze.eenheidIds && keuze.eenheidIds.length > 0
        ? eenheden.filter((e) => keuze.eenheidIds!.includes(e.id))
        : eenheden;
    if (selectie.length === 0) return { ok: false, status: 400, error: 'Geen eenheden om te printen' };

    const labels = selectie.map((e) => {
        const eenheid = normaliseerEenheid(e.eenheid) ?? normaliseerEenheid(partij.verpakking_eenheid) ?? 'kg';
        const data: ProductielabelData = {
            naam: component?.name ?? 'Product',
            inhoud: formatInhoud(Number(e.inhoud), eenheid),
            productiedatum: String(partij.productiedatum),
            tht: partij.tht ? String(partij.tht) : null,
            partijnummer: partij.partijnummer,
            unitNr: e.volgnummer,
            unitTotaal: partij.aantal_eenheden,
            bewaaradvies: partij.bewaaradvies ?? component?.bewaaradvies ?? null,
            allergenen: component?.allergenen ?? [],
            qrUrl: `${basisUrl}/scan/${e.scan_token}`,
            eenheidCode: e.code,
        };
        return { eenheidId: e.id, data };
    });

    return { ok: true, verzoek: { soort: keuze.soort, labels }, partijId, eenheidIds: selectie.map((e) => e.id) };
}
