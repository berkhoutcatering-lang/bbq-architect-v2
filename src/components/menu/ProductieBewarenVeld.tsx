'use client';

/**
 * "Productie & bewaren" op een zelf-bereide bouwsteen: hoe gaat dit product
 * de voorraad in en wat komt er op het label. Dit is de bron voor
 * 12 kg → 12 zakken → 12 labels; staat het leeg, dan vraagt de afrond-sheet
 * in de keuken het één keer en bewaart het hier.
 */

import { EENHEDEN, type Eenheid } from '@/lib/productie/eenheden';

export interface ProductieBewaren {
    verpakking_grootte: string;           // tekstveld, leeg = onbekend
    verpakking_eenheid: Eenheid;
    bewaarmethode: '' | 'vers' | 'vries' | 'houdbaar';
    bewaaradvies: string;
    houdbaarheid_dagen: string;           // tekstveld, leeg = onbekend
    partij_prefix: string;
}

export const LEGE_PRODUCTIE: ProductieBewaren = {
    verpakking_grootte: '', verpakking_eenheid: 'kg', bewaarmethode: '', bewaaradvies: '', houdbaarheid_dagen: '', partij_prefix: '',
};

export function productieUitRij(c: Record<string, unknown>): ProductieBewaren {
    const eenheid = (EENHEDEN as readonly string[]).includes(String(c.verpakking_eenheid)) ? (c.verpakking_eenheid as Eenheid) : 'kg';
    const bm = c.bewaarmethode;
    return {
        verpakking_grootte: c.verpakking_grootte != null ? String(c.verpakking_grootte) : '',
        verpakking_eenheid: eenheid,
        bewaarmethode: bm === 'vers' || bm === 'vries' || bm === 'houdbaar' ? bm : '',
        bewaaradvies: typeof c.bewaaradvies === 'string' ? c.bewaaradvies : '',
        houdbaarheid_dagen: c.houdbaarheid_na_bewerking_dagen != null ? String(c.houdbaarheid_na_bewerking_dagen) : '',
        partij_prefix: typeof c.partij_prefix === 'string' ? c.partij_prefix : '',
    };
}

/** Wat er naar PATCH /api/components/[id] gaat. Leeg = null (wissen). */
export function productieNaarPayload(p: ProductieBewaren): Record<string, unknown> {
    const grootte = parseFloat(p.verpakking_grootte.replace(',', '.'));
    const dagen = parseInt(p.houdbaarheid_dagen, 10);
    return {
        verpakking_grootte: Number.isFinite(grootte) && grootte > 0 ? grootte : null,
        verpakking_eenheid: Number.isFinite(grootte) && grootte > 0 ? p.verpakking_eenheid : null,
        bewaarmethode: p.bewaarmethode || null,
        bewaaradvies: p.bewaaradvies.trim() || null,
        houdbaarheid_na_bewerking_dagen: Number.isFinite(dagen) && dagen >= 0 ? dagen : null,
        partij_prefix: p.partij_prefix.trim() ? p.partij_prefix.trim().toUpperCase().slice(0, 4) : null,
    };
}

const BEWAAR_LABEL: Record<Exclude<ProductieBewaren['bewaarmethode'], ''>, string> = { vers: 'Koelkast (vers)', vries: 'Vriezer', houdbaar: 'Droog / houdbaar' };

export default function ProductieBewarenVeld({ value, onChange, naam }: {
    value: ProductieBewaren;
    onChange: (v: ProductieBewaren) => void;
    naam: string;
}) {
    const zet = (deel: Partial<ProductieBewaren>) => onChange({ ...value, ...deel });
    const grootte = parseFloat(value.verpakking_grootte.replace(',', '.'));
    const voorbeeld = Number.isFinite(grootte) && grootte > 0 ? `12 ${value.verpakking_eenheid} gemaakt = ${Math.floor(12 / grootte)} eenheden = ${Math.floor(12 / grootte)} labels` : null;

    return (
        <section className="kf-section">
            <h3 className="kf-section-title">Productie & bewaren</h3>
            <p className="kf-help">Hoe gaat {naam || 'dit product'} de voorraad in? Dit bepaalt het aantal zakken en labels na een productie — niemand vult ooit zelf een labelaantal in.</p>
            <div className="kf-grid-3">
                <label className="kf-field">
                    <span className="kf-label">Inhoud per eenheid</span>
                    <input type="number" step="0.001" min="0" inputMode="decimal" value={value.verpakking_grootte} onChange={(e) => zet({ verpakking_grootte: e.target.value })} placeholder="1" className="kf-input" />
                </label>
                <label className="kf-field">
                    <span className="kf-label">Eenheid</span>
                    <select value={value.verpakking_eenheid} onChange={(e) => zet({ verpakking_eenheid: e.target.value as Eenheid })} className="kf-input">
                        {EENHEDEN.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                </label>
                <label className="kf-field">
                    <span className="kf-label">Houdbaar (dagen)</span>
                    <input type="number" step="1" min="0" inputMode="numeric" value={value.houdbaarheid_dagen} onChange={(e) => zet({ houdbaarheid_dagen: e.target.value })} placeholder="bv. 90" className="kf-input" />
                </label>
            </div>
            {voorbeeld && <p className="kf-help">→ {voorbeeld}</p>}
            <div className="kf-grid-3">
                <label className="kf-field">
                    <span className="kf-label">Bewaren in</span>
                    <select value={value.bewaarmethode} onChange={(e) => zet({ bewaarmethode: e.target.value as ProductieBewaren['bewaarmethode'] })} className="kf-input">
                        <option value="">— kies —</option>
                        {(Object.keys(BEWAAR_LABEL) as Array<keyof typeof BEWAAR_LABEL>).map((k) => <option key={k} value={k}>{BEWAAR_LABEL[k]}</option>)}
                    </select>
                </label>
                <label className="kf-field">
                    <span className="kf-label">Tekst op het label</span>
                    <input type="text" value={value.bewaaradvies} onChange={(e) => zet({ bewaaradvies: e.target.value })} placeholder="bv. max. -18 °C" maxLength={60} className="kf-input" />
                </label>
                <label className="kf-field">
                    <span className="kf-label">Batch-letters</span>
                    <input type="text" value={value.partij_prefix} onChange={(e) => zet({ partij_prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) })} placeholder="PP" maxLength={4} className="kf-input" />
                </label>
            </div>
            <p className="kf-help">Batchnummer wordt {value.partij_prefix || 'letters uit de naam'}-JJJJMMDD-01. De tekst op het label wordt letterlijk geprint; er wordt geen bewaartemperatuur verzonnen.</p>
        </section>
    );
}
