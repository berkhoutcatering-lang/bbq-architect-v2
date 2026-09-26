'use client';

/**
 * Producten — wat er in een pakket of op een plank ligt (Sinterklaas S1/S2).
 * Plan: docs/sinterklaas-bouwplan.md §4.
 *
 * Per product: type, prijs (winkel incl. / inkoop excl.), btw, voorraad en wat
 * er al gereserveerd of besteld is. Voorraad leeg = niet bijgehouden: blokkeert
 * nooit. Een prijs is nooit een gok: leeg blijft leeg.
 */
import { useMemo, useState } from 'react';
import { Beer, Check, Package, Plus, Wine } from 'lucide-react';
import Button from '@/components/Button';
import Drawer from './Drawer';
import { leesEuro, telt, toonEuro, type ArtikelRij, type ComponentRij, type OrderRij, type ProductRij, type SlotRij } from '../_lib/vakjes';
import { maakProduct, werkProductBij, zetProductActief } from '../actions';

type Melding = (tekst: string, soort?: 'success' | 'error' | 'info') => void;

export const PRODUCT_TYPES = ['bier', 'wijn', 'worst', 'amandelen', 'crackers', 'marmelade', 'doos', 'vleeswaar', 'kaas', 'zuur', 'krokant', 'verpakking', 'overig'] as const;
export type ProductType = typeof PRODUCT_TYPES[number];
const HERKOMST: { key: ProductRij['herkomst']; label: string }[] = [{ key: 'lokaal', label: 'lokaal' }, { key: 'groothandel', label: 'groothandel' }, { key: 'mr_hop', label: 'Mr. Hop' }, { key: 'eigen', label: 'eigen' }];

interface Props {
    producten: ProductRij[];
    slots: SlotRij[];
    artikelen: ArtikelRij[];
    componenten: ComponentRij[];
    orders: OrderRij[];
    herlaad: () => Promise<void>;
    melding: Melding;
}

export function hoeveelheidTekst(n: number, eenheid: 'stuk' | 'gram'): string {
    if (eenheid === 'gram') return n >= 1000 ? `${Math.round(n / 10) / 100} kg` : `${Math.round(n)} g`;
    return `${Math.round(n * 100) / 100} ${n === 1 ? 'stuk' : 'stuks'}`;
}

/** "€ 4,95 per stuk", "€ 2,95 per 100 g" */
export function prijsTekst(cents: number | null, p: Pick<ProductRij, 'eenheid' | 'prijs_per'>): string {
    if (cents == null) return '';
    const per = p.eenheid === 'gram' ? `per ${p.prijs_per} g` : p.prijs_per === 1 ? 'per stuk' : `per ${p.prijs_per} stuks`;
    return `€ ${toonEuro(cents)} ${per}`;
}

export default function ProductenPaneel({ producten, slots, artikelen, componenten, orders, herlaad, melding }: Props) {
    const [filter, setFilter] = useState<'alles' | ProductType>('alles');
    const [openId, setOpenId] = useState<string | 'nieuw' | null>(null);
    const [bezig, setBezig] = useState<string | null>(null);

    /* Gereserveerd + besteld per product, uit de componenten van betaalde en lopende orders. */
    const bezet = useMemo(() => {
        const nu = new Date();
        const regelTelt = new Map<number, 'betaald' | 'wacht'>();
        for (const o of orders) {
            if (!telt(o, nu)) continue;
            for (const r of o.winkel_order_regels) regelTelt.set(r.id, o.status === 'betaald' ? 'betaald' : 'wacht');
        }
        const uit = new Map<string, { betaald: number; wacht: number }>();
        for (const c of componenten) {
            if (!c.product_id) continue;
            const t = regelTelt.get(c.order_regel_id);
            if (!t) continue;
            const b = uit.get(c.product_id) ?? { betaald: 0, wacht: 0 };
            b[t] += c.hoeveelheid;
            uit.set(c.product_id, b);
        }
        return uit;
    }, [componenten, orders]);

    /* In welke artikelen zit dit product (via de slots)? */
    const inArtikelen = useMemo(() => {
        const opId = new Map(artikelen.map((a) => [a.id, a.naam]));
        const uit = new Map<string, string[]>();
        for (const s of slots) {
            if (!s.standaard_product_id) continue;
            const l = uit.get(s.standaard_product_id) ?? [];
            const naam = opId.get(s.artikel_id);
            if (naam && !l.includes(naam)) l.push(naam);
            uit.set(s.standaard_product_id, l);
        }
        return uit;
    }, [slots, artikelen]);

    const types = useMemo(() => PRODUCT_TYPES.filter((t) => producten.some((p) => p.type === t)), [producten]);
    const zichtbaar = producten.filter((p) => filter === 'alles' || p.type === filter);
    const open = openId === 'nieuw' ? 'nieuw' : openId ? producten.find((p) => p.id === openId) ?? null : null;
    const legeSlots = slots.filter((s) => !s.standaard_product_id).length;

    async function schakel(p: ProductRij) {
        setBezig(p.id);
        try {
            const r = await zetProductActief({ id: p.id, actief: !p.actief });
            if ('error' in r) { melding(r.error, 'error'); return; }
            melding(p.actief ? `${p.naam} staat uit` : `${p.naam} staat aan`, 'success');
            await herlaad();
        } finally { setBezig(null); }
    }

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="ws-teller" aria-pressed={filter === 'alles'} onClick={() => setFilter('alles')}><b>{producten.length}</b> producten</button>
                    {types.map((t) => <button key={t} type="button" className="ws-teller" aria-pressed={filter === t} onClick={() => setFilter(filter === t ? 'alles' : t)}><b>{producten.filter((p) => p.type === t).length}</b> {t}</button>)}
                </div>
                <Button variant="ghost" icon={<Plus size={14} />} onClick={() => setOpenId('nieuw')}>Nieuw product</Button>
            </div>
            {legeSlots > 0 && (
                <div className="ws-tip"><span style={{ color: 'var(--ws-warn)', display: 'flex' }}><Package size={13} /></span>{legeSlots} {legeSlots === 1 ? 'slot' : 'slots'} in de pakketten {legeSlots === 1 ? 'heeft' : 'hebben'} nog geen product. Zolang een slot leeg is, is dat pakket niet verkoopbaar — kies het product bij het artikel.</div>
            )}

            <div className="panel">
                <div className="ws-tabel-kop ws-producten-grid"><span>Product</span><span>Winkel incl.</span><span>Inkoop excl.</span><span>Btw</span><span>Voorraad</span><span>Aan</span><span>Zit in</span></div>
                {zichtbaar.length === 0 && <div className="ws-leeg" style={{ padding: 24, textAlign: 'center' }}>{producten.length === 0 ? 'Nog geen producten. Bier, wijn en worst maak je hier aan; daarna kies je ze bij de pakketten.' : 'Niets in deze selectie.'}</div>}
                {zichtbaar.map((p) => {
                    const b = bezet.get(p.id);
                    const gereserveerd = (b?.betaald ?? 0) + (b?.wacht ?? 0);
                    const vrij = p.voorraad == null ? null : p.voorraad - gereserveerd;
                    const op = vrij != null && vrij <= 0;
                    return (
                        <div key={p.id} className="ws-tabel-rij ws-producten-grid" onClick={() => setOpenId(p.id)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setOpenId(p.id); }} style={{ opacity: p.actief ? 1 : .55 }}>
                            <span style={{ fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                <span style={{ color: 'var(--brand-gold)', display: 'flex', flexShrink: 0 }}>{p.type === 'bier' ? <Beer size={14} /> : p.type === 'wijn' ? <Wine size={14} /> : <Package size={14} />}</span>
                                <span style={{ minWidth: 0 }}>{p.naam}<span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {p.type}{p.alcohol ? ' · 18+' : ''}{p.hop_and_bites_tip ? ' · tip' : ''}</span></span>
                            </span>
                            <span style={{ fontSize: 13 }}>{p.winkelprijs_incl_cents == null ? <span style={{ color: 'var(--muted-weak)' }}>onbekend</span> : <span className="ws-mono">{prijsTekst(p.winkelprijs_incl_cents, p)}</span>}</span>
                            <span style={{ fontSize: 13 }}>{p.inkoop_excl_cents == null ? <span style={{ color: 'var(--muted-weak)' }}>onbekend</span> : <span className="ws-mono">{prijsTekst(p.inkoop_excl_cents, p)}</span>}</span>
                            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{p.btw_pct}%</span>
                            <span style={{ fontSize: 13 }}>
                                {p.voorraad == null
                                    ? <span style={{ color: 'var(--muted)' }}>niet bijgehouden{gereserveerd ? ` · ${hoeveelheidTekst(gereserveerd, p.eenheid)} besteld` : ''}</span>
                                    : <span className="ws-mono" style={{ color: op ? 'var(--ws-vuur)' : undefined }}>{hoeveelheidTekst(p.voorraad, p.eenheid)} · {hoeveelheidTekst(gereserveerd, p.eenheid)} besteld{b?.wacht ? ` (waarvan ${hoeveelheidTekst(b.wacht, p.eenheid)} gereserveerd)` : ''} · {op ? 'op' : `${hoeveelheidTekst(vrij!, p.eenheid)} vrij`}</span>}
                            </span>
                            <span onClick={(e) => e.stopPropagation()}>
                                <button type="button" className="ws-schakel" role="switch" aria-checked={p.actief} aria-label={p.actief ? 'Uitzetten' : 'Aanzetten'} disabled={bezig === p.id} onClick={() => schakel(p)} />
                            </span>
                            <span style={{ fontSize: 12, color: 'var(--muted)', minWidth: 0 }}>{(inArtikelen.get(p.id) ?? []).join(', ') || '—'}</span>
                        </div>
                    );
                })}
            </div>

            {open && <ProductDrawer product={open === 'nieuw' ? null : open} onClose={() => setOpenId(null)} herlaad={herlaad} melding={melding} />}
        </>
    );
}

/* ── Drawer ────────────────────────────────────────────────────────────────── */

interface Form {
    naam: string; type: ProductType; omschrijving: string; eenheid: 'stuk' | 'gram'; prijs_per: string;
    winkel: string; inkoop: string; btw_pct: 0 | 9 | 21; herkomst: ProductRij['herkomst']; alcohol: boolean; tip: boolean; voorraad: string; actief: boolean;
}
function vanProduct(p: ProductRij | null): Form {
    return {
        naam: p?.naam ?? '', type: (p?.type as ProductType) ?? 'bier', omschrijving: p?.omschrijving ?? '', eenheid: p?.eenheid ?? 'stuk', prijs_per: String(p?.prijs_per ?? 1),
        winkel: toonEuro(p?.winkelprijs_incl_cents), inkoop: toonEuro(p?.inkoop_excl_cents), btw_pct: (p?.btw_pct as 0 | 9 | 21) ?? 9, herkomst: p?.herkomst ?? null,
        alcohol: p?.alcohol ?? false, tip: p?.hop_and_bites_tip ?? false, voorraad: p?.voorraad == null ? '' : String(p.voorraad), actief: p?.actief ?? true,
    };
}

export function ProductDrawer({ product, onClose, herlaad, melding, onAangemaakt }: { product: ProductRij | null; onClose: () => void; herlaad: () => Promise<void>; melding: Melding; onAangemaakt?: (id: string, naam: string) => void }) {
    const [f, setF] = useState<Form>(() => vanProduct(product));
    const [bezig, setBezig] = useState(false);
    const zet = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

    /* Alcohol volgt het type, tenzij je het zelf omzet. */
    function zetType(t: ProductType) {
        setF((x) => ({ ...x, type: t, alcohol: t === 'bier' || t === 'wijn' ? true : x.alcohol, btw_pct: t === 'bier' || t === 'wijn' || t === 'doos' ? 21 : x.btw_pct, eenheid: t === 'amandelen' || t === 'vleeswaar' || t === 'kaas' || t === 'zuur' || t === 'krokant' ? 'gram' : x.eenheid }));
    }

    async function opslaan() {
        const winkel = leesEuro(f.winkel);
        const inkoop = leesEuro(f.inkoop);
        if (winkel === undefined || inkoop === undefined) { melding('Dat is geen geldig bedrag.', 'error'); return; }
        const prijsPer = Number(f.prijs_per.replace(',', '.'));
        if (!(prijsPer > 0)) { melding('Prijs per: een getal groter dan 0 (1 stuk, 100 gram).', 'error'); return; }
        const voorraad = f.voorraad.trim() === '' ? null : Number(f.voorraad.replace(',', '.'));
        if (voorraad != null && !(voorraad >= 0)) { melding('Voorraad is een getal, of leeg = niet bijgehouden.', 'error'); return; }
        const velden = {
            naam: f.naam, type: f.type, omschrijving: f.omschrijving.trim() || null, eenheid: f.eenheid, prijs_per: prijsPer,
            winkelprijs_incl_cents: winkel, inkoop_excl_cents: inkoop, btw_pct: f.btw_pct, herkomst: f.herkomst, alcohol: f.alcohol, hop_and_bites_tip: f.tip, voorraad, actief: f.actief,
        };
        setBezig(true);
        try {
            if (product) {
                const r = await werkProductBij({ ...velden, id: product.id });
                if ('error' in r) { melding(r.error, 'error'); return; }
                melding('Product opgeslagen', 'success');
            } else {
                const r = await maakProduct(velden);
                if ('error' in r) { melding(r.error, 'error'); return; }
                melding('Product aangemaakt', 'success');
                onAangemaakt?.(r.data.id, velden.naam);
            }
            await herlaad();
            onClose();
        } finally { setBezig(false); }
    }

    const eenheidLabel = f.eenheid === 'gram' ? 'gram' : 'stuks';
    return (
        <Drawer title={product?.naam || 'Nieuw product'} subtitle={product ? `${product.type}${product.winkelprijs_incl_cents != null ? ` · ${prijsTekst(product.winkelprijs_incl_cents, product)}` : ''}` : 'Wat er in een pakket of op een plank ligt'} onClose={onClose} width={560}
            footer={<><Button icon={<Check size={14} />} loading={bezig} onClick={opslaan}>{product ? 'Opslaan' : 'Aanmaken'}</Button><Button variant="ghost" onClick={onClose}>Annuleren</Button></>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div className="field"><label>Naam</label><input value={f.naam} onChange={(e) => zet('naam', e.target.value)} placeholder="Maallust Witte Wieven" /></div>
                <div className="field"><label>Type</label><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {PRODUCT_TYPES.map((t) => <button key={t} type="button" className="ws-pil" aria-pressed={f.type === t} onClick={() => zetType(t)}>{t}</button>)}
                </div></div>
                <div className="field"><label>Omschrijving</label><input value={f.omschrijving} onChange={(e) => zet('omschrijving', e.target.value)} placeholder="Fris en soepel, 5,5 %" /><div className="field-hint">Voor later op de site en in de QR-app; nu alleen voor jou</div></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div className="field"><label>Eenheid</label><div className="ws-keuze"><button type="button" aria-pressed={f.eenheid === 'stuk'} onClick={() => zet('eenheid', 'stuk')}>stuks</button><button type="button" aria-pressed={f.eenheid === 'gram'} onClick={() => zet('eenheid', 'gram')}>gram</button></div></div>
                    <div className="field"><label>Prijs per</label><input inputMode="decimal" value={f.prijs_per} onChange={(e) => zet('prijs_per', e.target.value)} /><div className="field-hint">{eenheidLabel} — amandelen: per 100 g</div></div>
                    <div className="field"><label>Winkelprijs incl. btw</label><input inputMode="decimal" value={f.winkel} onChange={(e) => zet('winkel', e.target.value)} placeholder="4,95" /><div className="field-hint">Leeg = onbekend; nooit 0 als gok</div></div>
                    <div className="field"><label>Inkoop excl. btw</label><input inputMode="decimal" value={f.inkoop} onChange={(e) => zet('inkoop', e.target.value)} placeholder="2,75" /><div className="field-hint">Voor de marge, nooit voor de klant</div></div>
                    <div className="field"><label>Btw</label><div className="ws-keuze">{([0, 9, 21] as const).map((p) => <button key={p} type="button" aria-pressed={f.btw_pct === p} onClick={() => zet('btw_pct', p)}>{p}%</button>)}</div></div>
                    <div className="field"><label>Voorraad</label><input inputMode="decimal" value={f.voorraad} onChange={(e) => zet('voorraad', e.target.value)} placeholder="niet bijgehouden" /><div className="field-hint">In {eenheidLabel}. Leeg = niet bijgehouden, blokkeert nooit. Een getal = harde grens.</div></div>
                </div>
                <div className="field"><label>Herkomst</label><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {HERKOMST.map((h) => <button key={h.key} type="button" className="ws-pil" aria-pressed={f.herkomst === h.key} onClick={() => zet('herkomst', f.herkomst === h.key ? null : h.key)}>{h.label}</button>)}
                </div></div>
                <div className="ws-chips">
                    <button type="button" className="ws-chip" aria-pressed={f.alcohol} onClick={() => zet('alcohol', !f.alcohol)}><Wine size={14} />Alcohol (18+)</button>
                    <button type="button" className="ws-chip" aria-pressed={f.tip} onClick={() => zet('tip', !f.tip)}><Check size={14} />Hop &amp; Bites-tip</button>
                    <button type="button" className="ws-chip" aria-pressed={f.actief} onClick={() => zet('actief', !f.actief)}><Check size={14} />Actief</button>
                </div>
            </div>
        </Drawer>
    );
}
