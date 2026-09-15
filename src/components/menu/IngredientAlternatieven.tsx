'use client';
/* IngredientAlternatieven — "Bidfood heeft het niet, of we twijfelen":
   drie gerichte alternatieven uit de kostprijs-catalogus, gekozen door de AI,
   geprijsd door de code. Mathijs kiest er één, of laat de regel leeg.

   Sinds 15 sep ook: zelf zoeken in álle catalogi (ook de slager, niet alleen
   de kostprijs-leverancier) en zelf een product met prijs invullen. "Ik koop
   mijn vlees bij de slager, daar heb ik een andere procureur."

   Gedeeld door de Bedenk-met-AI-preview en het gerecht-formulier, zodat een
   ingrediënt op beide plekken op dezelfde manier aan een product hangt.
   Golf 2 van docs/leveranciersvoorkeur-plan.md. */

import { useEffect, useState } from 'react';
import { Loader2, Check, X, Sparkles, Search, PenLine } from 'lucide-react';
import type { MatchRegel } from '@/lib/ingredientMatchDb';
import { MRButton, MREyebrow } from './atoms';
import { isVervanging, korteProductnaam } from '@/lib/ingredientVervangen';
import { fmtEuro } from './helpers';

export interface AlternatiefUit {
    match: MatchRegel;
    reden: string;
}

interface Props {
    naam: string;
    qtyPp: number;
    unit: string;
    huidige: MatchRegel | null;
    /** vervanging = een ánder product (spiering voor procureur): de aanroeper
        hernoemt de regel naar `nieuweNaam` en past de bereiding aan. Een
        koppeling (zelfde product, andere pot) laat de naam staan. */
    onKies: (match: MatchRegel, opties?: { vervanging: boolean; nieuweNaam: string }) => void;
    /** "Laat leeg, ik vul zelf in" — de regel blijft zonder kostprijs. */
    onLeeg: () => void;
    onSluit: () => void;
}

function prijsRegel(m: MatchRegel, qtyPp: number, unit: string): string {
    if (m.line_cost_cents == null) {
        return `eenheid past niet (${m.base_unit === 'stuk' ? 'per stuk' : 'per ' + m.base_unit} vs ${unit || '?'})`;
    }
    const perPortie = fmtEuro(m.line_cost_cents / 100);
    const perBasis = m.base_unit === 'stuk'
        ? `${fmtEuro(m.cents_per_base_unit / 100)} per stuk`
        : `${fmtEuro(m.cents_per_base_unit * 10)} per ${m.base_unit === 'g' ? 'kg' : 'liter'}`;
    return `${perPortie} voor ${qtyPp} ${unit}${m.unit_approx ? ' ≈' : ''} · ${perBasis}`;
}

interface ZoekHit {
    source?: 'price_list' | 'supplier_product';
    supplier_price_id: number;
    supplier_product_id?: number | null;
    naam: string;
    leverancier: string | null;
    prijs_per_kg: number | null;
    prijs_per_stuk: number | null;
    base_cost_cents?: number | null;
    base_quantity?: number | null;
    base_unit?: string | null;
}

function hitPrijs(h: ZoekHit): string {
    if (h.source === 'supplier_product' && h.base_cost_cents != null && h.base_quantity) {
        const u = h.base_unit === 'ml' ? 'liter' : h.base_unit === 'g' ? 'kg' : 'stuk';
        const perBasis = h.base_unit === 'g' || h.base_unit === 'ml' ? (h.base_cost_cents / h.base_quantity) * 10 : h.base_cost_cents / h.base_quantity / 100;
        return `${fmtEuro(perBasis)} per ${u}`;
    }
    if (h.prijs_per_kg) return `${fmtEuro(h.prijs_per_kg)} per kg`;
    if (h.prijs_per_stuk) return `${fmtEuro(h.prijs_per_stuk)} per stuk`;
    return 'prijs zonder eenheid';
}

/* Catalogus-treffer → koppeling met prijs voor déze hoeveelheid (server rekent). */
async function kiesUitCatalogus(h: ZoekHit, qtyPp: number, unit: string): Promise<MatchRegel> {
    const body = h.source === 'supplier_product'
        ? { source: 'supplier_product', ref_id: h.supplier_product_id, qty_pp: qtyPp, eenheid: unit }
        : { source: 'supplier', ref_id: h.supplier_price_id, qty_pp: qtyPp, eenheid: unit };
    const r = await fetch('/api/recipe/kies-product', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const b = await r.json().catch(() => ({}));
    if (!r.ok || !b.success) throw new Error(b.error || `Kiezen mislukt (${r.status})`);
    return b.data.match as MatchRegel;
}

export function IngredientAlternatieven({ naam, qtyPp, unit, huidige, onKies, onLeeg, onSluit }: Props) {
    /* Zelf zoeken (alle leveranciers) en zelf invullen. */
    const [zoek, setZoek] = useState('');
    const [hits, setHits] = useState<ZoekHit[]>([]);
    const [eigenHits, setEigenHits] = useState<Array<{ component_id: number; naam: string; leverancier: string | null; prijs: number; per: string }>>([]);
    const [zoekt, setZoekt] = useState(false);
    const [eigenOpen, setEigenOpen] = useState(false);
    const [eigen, setEigen] = useState({ naam: '', prijs: '', per: 'kg', leverancier: '' });
    const [kiesFout, setKiesFout] = useState<string | null>(null);
    const [bezigMetKiezen, setBezigMetKiezen] = useState(false);

    useEffect(() => {
        const q = zoek.trim();
        if (q.length < 2) { setHits([]); setEigenHits([]); return; }
        let actief = true;
        setZoekt(true);
        const t = setTimeout(() => {
            Promise.all([
                fetch(`/api/recipe/bibliotheek-zoek?q=${encodeURIComponent(q)}`).then((r) => r.json()).catch(() => ({ results: [] })),
                fetch(`/api/catalog/search?q=${encodeURIComponent(q)}&supplierProducts=1`).then((r) => r.json()).catch(() => ({ results: [] })),
            ]).then(([eigen, cat]) => {
                if (!actief) return;
                setEigenHits(Array.isArray(eigen.results) ? eigen.results : []);
                setHits(Array.isArray(cat.results) ? cat.results.slice(0, 12) : []);
            }).finally(() => { if (actief) setZoekt(false); });
        }, 250);
        return () => { actief = false; clearTimeout(t); };
    }, [zoek]);

    async function bewaarKeuze(match: MatchRegel) {
        const vervanging = isVervanging(naam, match.name);
        /* Alleen de allereerste keuze voor dit ingrediënt wordt de standaard;
           daarna geldt een keuze voor dít gerecht. Anders springt "paprika-
           poeder" heen en weer tussen Bidfood (saus) en Van Beekum (rub).
           Een vervanging (spiering voor procureur) is geen synoniem en wordt
           nooit een alias. */
        if (!vervanging) {
            fetch('/api/recipe/aliases', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ alleen_als_nieuw: true, aliases: [{ naam, match: { source: match.source, ref_id: match.ref_id, name: match.name, supplier: match.supplier ?? null } }] }),
            }).catch(() => { /* volgende keer opnieuw */ });
        }
        onKies(match, { vervanging, nieuweNaam: korteProductnaam(match.name) });
    }

    async function kiesEigenHit(h: { component_id: number }) {
        setKiesFout(null); setBezigMetKiezen(true);
        try {
            const r = await fetch('/api/recipe/kies-product', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'component', ref_id: h.component_id, qty_pp: qtyPp, eenheid: unit }) });
            const b = await r.json().catch(() => ({}));
            if (!r.ok || !b.success) throw new Error(b.error || `Kiezen mislukt (${r.status})`);
            await bewaarKeuze(b.data.match as MatchRegel);
        } catch (e) { setKiesFout(e instanceof Error ? e.message : 'Kiezen mislukt'); }
        finally { setBezigMetKiezen(false); }
    }

    async function kiesHit(h: ZoekHit) {
        setKiesFout(null); setBezigMetKiezen(true);
        try { await bewaarKeuze(await kiesUitCatalogus(h, qtyPp, unit)); }
        catch (e) { setKiesFout(e instanceof Error ? e.message : 'Kiezen mislukt'); }
        finally { setBezigMetKiezen(false); }
    }

    async function bewaarEigen() {
        setKiesFout(null); setBezigMetKiezen(true);
        try {
            const r = await fetch('/api/recipe/kies-product', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ eigen: { naam: eigen.naam, prijs_eur: Number(String(eigen.prijs).replace(',', '.')), per: eigen.per, leverancier: eigen.leverancier }, qty_pp: qtyPp, eenheid: unit }),
            });
            const b = await r.json().catch(() => ({}));
            if (!r.ok || !b.success) throw new Error(b.error || `Opslaan mislukt (${r.status})`);
            await bewaarKeuze(b.data.match as MatchRegel);
        } catch (e) { setKiesFout(e instanceof Error ? e.message : 'Opslaan mislukt'); }
        finally { setBezigMetKiezen(false); }
    }

    /* Eén status-object: laden → klaar of fout. De vraag gaat één keer per
       ingrediënt+koppeling de deur uit (kost een paar cent), daarom hangt het
       effect aan de sleutel en niet aan de object-identiteit van `huidige`. */
    const [staat, setStaat] = useState<{
        laden: boolean; fout: string | null;
        oordeel: { klopt: boolean | null; reden: string };
        alternatieven: AlternatiefUit[]; leverancier: string | null;
    }>({ laden: true, fout: null, oordeel: { klopt: null, reden: '' }, alternatieven: [], leverancier: null });
    const { laden, fout, oordeel, alternatieven, leverancier } = staat;
    const huidigeSleutel = huidige ? `${huidige.source}:${huidige.ref_id}` : '';

    useEffect(() => {
        let actief = true;
        fetch('/api/recipe/alternatives', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                naam, qty_pp: qtyPp, eenheid: unit,
                huidige: huidige ? { name: huidige.name, source: huidige.source, ref_id: huidige.ref_id } : null,
            }),
        })
            .then(async (r) => {
                const b = await r.json().catch(() => ({}));
                if (!r.ok || !b.success) throw new Error(b.error || b.message || `HTTP ${r.status}`);
                return b.data;
            })
            .then((d) => {
                if (!actief) return;
                setStaat({
                    laden: false, fout: null,
                    oordeel: { klopt: d.huidige_klopt ?? null, reden: d.huidige_reden ?? '' },
                    alternatieven: Array.isArray(d.alternatieven) ? d.alternatieven : [],
                    leverancier: d.kostprijs_leverancier ?? null,
                });
            })
            .catch((e) => {
                if (actief) setStaat((s) => ({ ...s, laden: false, fout: e instanceof Error ? e.message : 'Ophalen mislukt' }));
            });
        return () => { actief = false; };
        // huidige zit via huidigeSleutel in de deps; het object zelf wisselt van identiteit bij elke render van de ouder.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [naam, qtyPp, unit, huidigeSleutel]);

    return (
        <div style={{
            marginTop: 8, padding: 12, borderRadius: 10,
            background: 'rgba(255,191,0,.05)', border: '1px solid rgba(255,191,0,.2)',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <MREyebrow>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Sparkles size={10} /> Alternatieven voor “{naam}”{leverancier ? ` bij ${leverancier}` : ''}
                    </span>
                </MREyebrow>
                <button onClick={onSluit} aria-label="Sluit" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
                    <X size={14} />
                </button>
            </div>

            {laden && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                    <Loader2 size={14} style={{ animation: 'mr-spin 1s linear infinite' }} /> AI kijkt in de catalogus…
                </div>
            )}
            {fout && <div style={{ fontSize: 12, color: 'var(--red, #ef4444)', marginTop: 8 }}>{fout}</div>}

            {!laden && !fout && (
                <>
                    {huidige && (
                        <div style={{
                            marginTop: 8, fontSize: 12, padding: '6px 8px', borderRadius: 6,
                            background: oordeel.klopt === false ? 'rgba(239,68,68,.06)' : 'rgba(34,197,94,.06)',
                            color: oordeel.klopt === false ? 'var(--red, #ef4444)' : 'var(--green, #22c55e)',
                        }}>
                            {oordeel.klopt === false ? '✗ ' : oordeel.klopt === true ? '✓ ' : '· '}
                            Nu gekoppeld: <strong>{huidige.name}</strong>
                            {oordeel.reden ? ` — ${oordeel.reden}` : ''}
                        </div>
                    )}

                    {alternatieven.length === 0 ? (
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                            Niets gevonden dat in de buurt komt{leverancier ? ` bij ${leverancier}` : ''}. Laat de regel leeg en vul de kostprijs zelf in.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                            {alternatieven.map((a, i) => (
                                <button
                                    key={`${a.match.source}-${a.match.ref_id}-${i}`}
                                    type="button"
                                    /* De AI stelde voor, de kok zegt ja: dan is de koppeling zeker —
                                       en wordt onthouden (golf 4), zodat dit ingrediënt de volgende
                                       keer direct goed is. */
                                    onClick={() => {
                                        const gekozen = { ...a.match, confidence: 'hoog' as const };
                                        fetch('/api/recipe/aliases', {
                                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ alleen_als_nieuw: true, aliases: [{ naam, match: { source: gekozen.source, ref_id: gekozen.ref_id, name: gekozen.name, supplier: gekozen.supplier ?? null } }] }),
                                        }).catch(() => { /* volgende keer opnieuw */ });
                                        onKies(gekozen, { vervanging: false, nieuweNaam: korteProductnaam(gekozen.name) });
                                    }}
                                    style={{
                                        textAlign: 'left', padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                                        background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)',
                                        display: 'flex', gap: 10, alignItems: 'flex-start', fontFamily: 'var(--font-sans)',
                                    }}
                                >
                                    <Check size={14} style={{ marginTop: 2, color: 'var(--brand)', flexShrink: 0 }} />
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{ fontSize: 13, fontWeight: 600, display: 'block' }}>{a.match.name}</span>
                                        <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block' }}>
                                            {a.reden}{a.match.supplier ? ` · ${a.match.supplier}` : ''}
                                        </span>
                                        <span style={{ fontSize: 11, color: a.match.line_cost_cents == null ? 'var(--red, #ef4444)' : 'var(--green, #22c55e)', display: 'block', fontVariantNumeric: 'tabular-nums' }}>
                                            {prijsRegel(a.match, qtyPp, unit)}
                                        </span>
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* Zelf zoeken en zelf invullen staan er meteen — niet pas als de AI
                klaar is. De keuze geldt voor dít gerecht (saus bij Bidfood, rub bij
                Van Beekum); alleen de allereerste keuze voor een ingrediënt wordt
                de standaard. */}
            <>
                    {/* Zelf zoeken — alle leveranciers, ook de slager */}
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.06)' }}>
                        <MREyebrow style={{ marginBottom: 6 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Search size={10} /> Of zoek zelf — alle leveranciers</span>
                        </MREyebrow>
                        <input
                            value={zoek}
                            onChange={(e) => setZoek(e.target.value)}
                            placeholder={`Bijv. "${naam.split(' ')[0]}" — catalogi én je eigen bibliotheek`}
                            style={{ width: '100%', padding: '7px 10px', borderRadius: 8, background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-sans)', outline: 'none' }}
                        />
                        {zoekt && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>Zoeken…</div>}
                        {!zoekt && zoek.trim().length >= 2 && hits.length === 0 && (
                            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>Niets gevonden in je catalogi. Vul het hieronder zelf in.</div>
                        )}
                        {(eigenHits.length > 0 || hits.length > 0) && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6, maxHeight: 240, overflowY: 'auto' }}>
                                {eigenHits.map((h) => (
                                    <button
                                        key={`eigen-${h.component_id}`}
                                        type="button"
                                        disabled={bezigMetKiezen}
                                        onClick={() => void kiesEigenHit(h)}
                                        style={{
                                            textAlign: 'left', padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
                                            background: 'rgba(255,191,0,.06)', border: '1px solid rgba(255,191,0,.25)', color: 'var(--text)',
                                            display: 'flex', gap: 10, alignItems: 'center', fontFamily: 'var(--font-sans)',
                                        }}
                                    >
                                        <span style={{ flex: 1, minWidth: 0, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.naam}</span>
                                        <span style={{ fontSize: 11, color: 'var(--brand)', whiteSpace: 'nowrap' }}>{h.leverancier ?? 'eigen bibliotheek'}</span>
                                        <span style={{ fontSize: 11, color: 'var(--green, #22c55e)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fmtEuro(h.prijs)} per {h.per}</span>
                                    </button>
                                ))}
                                {hits.map((h, i) => (
                                    <button
                                        key={`${h.source}-${h.supplier_product_id ?? h.supplier_price_id}-${i}`}
                                        type="button"
                                        disabled={bezigMetKiezen}
                                        onClick={() => void kiesHit(h)}
                                        style={{
                                            textAlign: 'left', padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
                                            background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)',
                                            display: 'flex', gap: 10, alignItems: 'center', fontFamily: 'var(--font-sans)',
                                        }}
                                    >
                                        <span style={{ flex: 1, minWidth: 0, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.naam}</span>
                                        <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{h.leverancier ?? 'catalogus'}</span>
                                        <span style={{ fontSize: 11, color: 'var(--green, #22c55e)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{hitPrijs(h)}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Zelf invullen — wordt een bouwsteen in de bibliotheek */}
                    <div style={{ marginTop: 10 }}>
                        {!eigenOpen ? (
                            <button type="button" onClick={() => { setEigenOpen(true); setEigen((e) => ({ ...e, naam: e.naam || naam })); }}
                                style={{ background: 'none', border: 'none', color: 'var(--brand)', cursor: 'pointer', fontSize: 12, padding: 0, display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-sans)' }}>
                                <PenLine size={12} /> Zelf invullen (eigen product met prijs)
                            </button>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 0.8fr 0.7fr 1fr auto', gap: 6, alignItems: 'center' }}>
                                <input value={eigen.naam} onChange={(e) => setEigen({ ...eigen, naam: e.target.value })} placeholder="Productnaam"
                                    style={{ padding: '6px 8px', borderRadius: 8, background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--font-sans)' }} />
                                <input value={eigen.prijs} onChange={(e) => setEigen({ ...eigen, prijs: e.target.value })} placeholder="€ prijs" inputMode="decimal"
                                    style={{ padding: '6px 8px', borderRadius: 8, background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--font-sans)' }} />
                                <select value={eigen.per} onChange={(e) => setEigen({ ...eigen, per: e.target.value })}
                                    style={{ padding: '6px 6px', borderRadius: 8, background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12 }}>
                                    <option value="kg">per kg</option>
                                    <option value="l">per liter</option>
                                    <option value="stuk">per stuk</option>
                                </select>
                                <input value={eigen.leverancier} onChange={(e) => setEigen({ ...eigen, leverancier: e.target.value })} placeholder="Leverancier (bv. slager)"
                                    style={{ padding: '6px 8px', borderRadius: 8, background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--font-sans)' }} />
                                <MRButton variant="primary" sm onClick={() => void bewaarEigen()} disabled={bezigMetKiezen || !eigen.naam.trim() || !eigen.prijs.trim()}>Gebruik</MRButton>
                            </div>
                        )}
                    </div>
                    {kiesFout && <div style={{ fontSize: 12, color: 'var(--red, #ef4444)', marginTop: 6 }}>{kiesFout}</div>}

                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <MRButton variant="ghost" sm onClick={onLeeg}>Laat leeg — geen kostprijs</MRButton>
                    </div>
            </>
        </div>
    );
}
