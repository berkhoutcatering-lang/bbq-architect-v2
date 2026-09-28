'use client';

/**
 * Het controlescherm (W2b) — voor elke manier van invoeren hetzelfde.
 *
 * Per regel: wat er op het papier staat, en wat er geboekt wordt: plek
 * (winkel of makerij), product, omrekening ("1 krat = 24"), aantal, prijs,
 * THT. Pas na "Klopt, boeken" ontstaan de logboekregels, allemaal of geen.
 * Het voorstel (onthouden / EAN / naam) staat erbij, zodat je ziet waarom.
 */
import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Plus, ScanBarcode, Sparkles, Trash2, Undo2 } from 'lucide-react';
import '@/styles/menu-hub.css';
import Button from '@/components/Button';
import BarcodeScanner from '@/components/BarcodeScanner';
import { useToast } from '@/components/Toast';
import { formatEur } from '@/lib/format';
import { klaarOmTeBoeken, omrekeningVoor } from '@/lib/voorraad/invoer';
import { hoeveelheidKort } from '@/lib/winkel/voorraad';
import { boekOntvangst, maakProductVoorRegel, scanEan, verwerpOntvangst, verwijderRegel, voegRegelToe, werkKopBij, werkRegelBij } from '../actions';

type Plek = 'winkel' | 'makerij';

export interface ControleRegel {
    id: string;
    bron_naam: string;
    bron_aantal: number | null;
    bron_eenheid: string | null;
    bron_prijs_cents: number | null;
    btw_pct: number | null;
    ean: string | null;
    plek: Plek | null;
    winkel_product_id: string | null;
    inventory_id: number | null;
    omrekening: number | null;
    aantal: number | null;
    tht: string | null;
    overslaan: boolean;
    voorstel: string | null;
}

export interface ControleData {
    kop: {
        id: string; bron: string; status: 'concept' | 'geboekt' | 'verworpen';
        leverancier_id: number | null; leverancier_naam: string | null; factuurnummer: string | null; datum: string | null;
        totaal_cents: number | null; prijzen_incl_btw: boolean; bon_id: number | null; geboekt_at: string | null;
    };
    regels: ControleRegel[];
    winkel: { id: string; naam: string; type: string; eenheid: 'stuk' | 'gram'; prijs_per: number; voorraad: number | null }[];
    keuken: { id: number; naam: string; unit: string | null; current_stock: number | null }[];
    leveranciers: { id: number; naam: string }[];
    dubbel: { id: string; status: string; wanneer: string } | null;
    plekHint: Plek | null;
}

const kaart: React.CSSProperties = { background: 'var(--color-bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)' };
const VOORSTEL: Record<string, string> = { onthouden: 'onthouden van vorige keer', ean: 'herkend op barcode', naam: 'herkend op naam', inkooporder: 'uit de inkooporder' };
const getal = (s: string): number | null => { const t = s.trim().replace(',', '.'); if (t === '') return null; const n = Number(t); return Number.isFinite(n) ? n : null; };
const euroTekst = (c: number | null) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));

export default function Controlescherm({ data, scanOpen }: { data: ControleData; scanOpen: boolean }) {
    const router = useRouter();
    const toast = useToast();
    const stil = useReducedMotion();
    const k = data.kop;
    const alleenLezen = k.status !== 'concept';
    const [bezig, setBezig] = useState<string | null>(null);
    const [scanner, setScanner] = useState(false);
    const [eanInvoer, setEanInvoer] = useState('');
    const [nieuw, setNieuw] = useState('');
    const eanRef = useRef<HTMLInputElement>(null);
    const status = useMemo(() => klaarOmTeBoeken(data.regels), [data.regels]);

    async function doe<T>(sleutel: string, fn: () => Promise<{ error: string } | { data: T }>, gelukt?: string | ((d: T) => string)): Promise<T | null> {
        setBezig(sleutel);
        try {
            const r = await fn();
            if ('error' in r) { toast(r.error, 'error'); return null; }
            if (gelukt) toast(typeof gelukt === 'function' ? gelukt(r.data) : gelukt, 'success');
            router.refresh();
            return r.data;
        } finally { setBezig(null); }
    }

    const kopBij = (velden: Record<string, unknown>) => doe('kop', () => werkKopBij({ id: k.id, ...velden }));

    async function scan(ean: string) {
        const code = ean.trim();
        if (!code) return;
        await doe('scan', () => scanEan({ invoerId: k.id, ean: code }), (d) => (d.bekend ? `+1 ${d.naam}` : `Nieuwe barcode: kies of maak het product`));
        setEanInvoer('');
        eanRef.current?.focus();
    }

    const totaalBoeken = data.regels.filter((r) => !r.overslaan).length;

    return (
        <div className="mobile-safe-bottom" style={{ padding: '20px var(--space-mobile-edge, 16px) 120px', maxWidth: 980, margin: '0 auto' }}>
            <Link href="/voorraad/ontvangst" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: 13, textDecoration: 'none', marginBottom: 14 }}><ArrowLeft size={15} /> Ontvangst</Link>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                    <h1 className="chassis-titel" style={{ margin: 0 }}>{alleenLezen ? (k.status === 'geboekt' ? 'Geboekt' : 'Weggegooid') : 'Controleren'}</h1>
                    <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>
                        {alleenLezen
                            ? k.status === 'geboekt' ? `Geboekt ${k.geboekt_at ? new Date(k.geboekt_at).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}. Wijzigen kan niet meer; een fout herstel je met een telling of afwijking.` : 'Dit concept is niet geboekt.'
                            : 'Klopt alles? Dan boek je het in één keer. Niets staat in de voorraad voordat je op "Klopt, boeken" drukt.'}
                    </p>
                </div>
                {k.bon_id && <Link href={`/archief?bon=${k.bon_id}`} className="btn btn-ghost" style={{ fontSize: 13 }}>Bon bekijken</Link>}
            </div>

            {data.dubbel && (
                <div className="kf-banner" style={{ marginBottom: 14, borderColor: 'rgba(245,158,11,.45)' }}>
                    <AlertTriangle size={15} />
                    <span><strong>Deze factuur lijkt al eens ingelezen</strong> ({new Date(data.dubbel.wanneer).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}, {data.dubbel.status}). <Link href={`/voorraad/ontvangst/${data.dubbel.id}`} style={{ color: 'var(--brand)' }}>Bekijk die</Link> voordat je dit boekt.</span>
                </div>
            )}

            {/* Kop: leverancier, factuurnummer, datum, totaal, btw */}
            <div style={{ ...kaart, padding: 14, marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
                <div className="kf-field">
                    <label className="kf-label">Leverancier</label>
                    <select className="kf-input" disabled={alleenLezen} value={k.leverancier_id ?? ''} onChange={(e) => {
                        const id = e.target.value ? Number(e.target.value) : null;
                        void kopBij({ leverancier_id: id, leverancier_naam: data.leveranciers.find((l) => l.id === id)?.naam ?? k.leverancier_naam });
                    }}>
                        <option value="">{k.leverancier_naam ? `${k.leverancier_naam} (niet gekoppeld)` : 'Geen / onbekend'}</option>
                        {data.leveranciers.map((l) => <option key={l.id} value={l.id}>{l.naam}</option>)}
                    </select>
                </div>
                <div className="kf-field">
                    <label className="kf-label">Factuurnummer</label>
                    <input className="kf-input" disabled={alleenLezen} defaultValue={k.factuurnummer ?? ''} placeholder="optioneel" onBlur={(e) => { if ((e.target.value.trim() || null) !== k.factuurnummer) void kopBij({ factuurnummer: e.target.value.trim() || null }); }} />
                </div>
                <div className="kf-field">
                    <label className="kf-label">Datum</label>
                    <input className="kf-input" type="date" disabled={alleenLezen} defaultValue={k.datum ?? ''} onBlur={(e) => { if ((e.target.value || null) !== k.datum) void kopBij({ datum: e.target.value || null }); }} />
                </div>
                <div className="kf-field">
                    <label className="kf-label">Prijzen op het papier</label>
                    <div className="kf-seg">
                        <button type="button" disabled={alleenLezen} className={`kf-seg-btn${!k.prijzen_incl_btw ? ' is-on' : ''}`} onClick={() => kopBij({ prijzen_incl_btw: false })}>excl. btw</button>
                        <button type="button" disabled={alleenLezen} className={`kf-seg-btn${k.prijzen_incl_btw ? ' is-on' : ''}`} onClick={() => kopBij({ prijzen_incl_btw: true })}>incl. btw</button>
                    </div>
                    {k.totaal_cents != null && <div className="kf-help">Totaal op de bon: {formatEur(k.totaal_cents / 100)}</div>}
                </div>
            </div>

            {/* Toevoegen: scannen of een regel */}
            {!alleenLezen && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                    <form onSubmit={(e) => { e.preventDefault(); void scan(eanInvoer); }} style={{ ...kaart, display: 'flex', alignItems: 'center', gap: 8, padding: '0 6px 0 12px', height: 44, flex: '1 1 260px' }}>
                        <ScanBarcode size={16} style={{ color: 'var(--muted)' }} />
                        <input ref={eanRef} value={eanInvoer} onChange={(e) => setEanInvoer(e.target.value)} inputMode="numeric" placeholder="Scan of typ een barcode" autoFocus={scanOpen}
                            style={{ flex: 1, background: 'none', border: 'none', color: 'var(--text)', fontSize: 15, outline: 'none', minWidth: 0 }} />
                        <button type="button" onClick={() => setScanner(true)} className="btn btn-ghost btn-sm">Camera</button>
                    </form>
                    <form onSubmit={(e) => { e.preventDefault(); if (!nieuw.trim()) return; void doe('regel', () => voegRegelToe({ invoerId: k.id, naam: nieuw.trim(), plek: data.plekHint })).then(() => setNieuw('')); }}
                        style={{ ...kaart, display: 'flex', alignItems: 'center', gap: 8, padding: '0 6px 0 12px', height: 44, flex: '1 1 260px' }}>
                        <Plus size={16} style={{ color: 'var(--muted)' }} />
                        <input value={nieuw} onChange={(e) => setNieuw(e.target.value)} placeholder="Regel toevoegen: productnaam" style={{ flex: 1, background: 'none', border: 'none', color: 'var(--text)', fontSize: 15, outline: 'none', minWidth: 0 }} />
                        <Button size="sm" type="submit" loading={bezig === 'regel'}>Toevoegen</Button>
                    </form>
                </div>
            )}

            {data.regels.length === 0 && <div className="kf-empty"><p>Nog geen regels. Scan een barcode of voeg een product toe.</p></div>}

            <AnimatePresence initial={false}>
                {data.regels.map((r) => (
                    <motion.div key={r.id} layout={!stil} initial={stil ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                        <RegelKaart r={r} data={data} alleenLezen={alleenLezen} onDoe={doe} />
                    </motion.div>
                ))}
            </AnimatePresence>

            {!alleenLezen && (
                <div style={{ position: 'sticky', bottom: 12, marginTop: 18, ...kaart, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', boxShadow: '0 10px 30px rgba(0,0,0,.25)' }}>
                    <div style={{ flex: 1, minWidth: 200, fontSize: 13 }}>
                        {status.ok
                            ? <span><CheckCircle2 size={14} style={{ verticalAlign: -2, color: 'var(--green)' }} /> {totaalBoeken} {totaalBoeken === 1 ? 'regel' : 'regels'} klaar om te boeken</span>
                            : status.open > 0 ? <span style={{ color: 'var(--brand-gold, #c4a35a)' }}>Nog {status.open} {status.open === 1 ? 'regel' : 'regels'} zonder product of aantal (of sla ze over)</span>
                            : <span style={{ color: 'var(--muted)' }}>Niets te boeken</span>}
                    </div>
                    <Button variant="ghost" size="sm" loading={bezig === 'weg'} onClick={() => { if (confirm('Dit concept weggooien? Er wordt niets geboekt.')) void doe('weg', () => verwerpOntvangst({ id: k.id }), 'Weggegooid').then((d) => { if (d) router.push('/voorraad/ontvangst'); }); }}>Weggooien</Button>
                    <Button icon={<Check size={15} />} disabled={!status.ok} loading={bezig === 'boek'} onClick={() => void doe('boek', () => boekOntvangst({ id: k.id }), (d) => `Geboekt: ${d.winkel ? `${d.winkel} in de winkel` : ''}${d.winkel && d.makerij ? ', ' : ''}${d.makerij ? `${d.makerij} in de makerij` : ''}`)}>Klopt, boeken</Button>
                </div>
            )}

            <BarcodeScanner isOpen={scanner} onClose={() => setScanner(false)} onScan={(code) => { setScanner(false); void scan(code); }} />
        </div>
    );
}

/* ── Eén regel ─────────────────────────────────────────────────────────────── */

type Doe = <T>(sleutel: string, fn: () => Promise<{ error: string } | { data: T }>, gelukt?: string | ((d: T) => string)) => Promise<T | null>;

function RegelKaart({ r, data, alleenLezen, onDoe }: { r: ControleRegel; data: ControleData; alleenLezen: boolean; onDoe: Doe }) {
    const [maak, setMaak] = useState(false);
    const [maakNaam, setMaakNaam] = useState(r.bron_naam);
    const [maakEenheid, setMaakEenheid] = useState<'stuk' | 'gram'>('stuk');
    const [maakUnit, setMaakUnit] = useState(r.bron_eenheid ?? 'stuks');
    const invoerId = data.kop.id;
    const bij = (velden: Record<string, unknown>) => onDoe(`r:${r.id}`, () => werkRegelBij({ id: r.id, invoerId, ...velden }));

    const w = r.plek === 'winkel' ? data.winkel.find((x) => x.id === r.winkel_product_id) ?? null : null;
    const kk = r.plek === 'makerij' ? data.keuken.find((x) => x.id === r.inventory_id) ?? null : null;
    const doelEenheid = w ? (w.eenheid === 'gram' ? 'g' : 'st.') : kk ? kk.unit ?? '' : '';
    const compleet = r.overslaan || (r.plek && (r.plek === 'winkel' ? r.winkel_product_id : r.inventory_id) && r.aantal && r.aantal > 0);

    /* Product gekozen: omrekening voorstellen als die er nog niet is, en het aantal meerekenen. */
    function kiesProduct(plek: Plek, id: string) {
        if (!id) { void bij(plek === 'winkel' ? { winkel_product_id: null } : { inventory_id: null }); return; }
        const doel = plek === 'winkel'
            ? (() => { const p = data.winkel.find((x) => x.id === id)!; return { plek: 'winkel' as const, eenheid: p.eenheid }; })()
            : (() => { const p = data.keuken.find((x) => x.id === Number(id))!; return { plek: 'makerij' as const, unit: p.unit }; })();
        const om = r.omrekening ?? omrekeningVoor({ naam: r.bron_naam, eenheid: r.bron_eenheid }, doel);
        void bij({
            plek, winkel_product_id: plek === 'winkel' ? id : null, inventory_id: plek === 'makerij' ? Number(id) : null,
            omrekening: om, aantal: om != null && r.bron_aantal != null ? Math.round(r.bron_aantal * om * 1000) / 1000 : r.aantal,
        });
    }

    const prijsPerEenheid = r.bron_prijs_cents != null && r.omrekening ? r.bron_prijs_cents / r.omrekening : null;

    return (
        <div style={{ ...kaart, padding: 14, marginBottom: 10, opacity: r.overslaan ? 0.5 : 1, borderColor: compleet ? 'var(--border)' : 'rgba(245,158,11,.5)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 600 }}>{r.bron_naam}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        Op het papier: {r.bron_aantal ?? '?'} {r.bron_eenheid ?? ''}{r.bron_prijs_cents != null ? ` à ${formatEur(r.bron_prijs_cents / 100)}` : ''}{r.btw_pct != null ? ` · btw ${r.btw_pct}%` : ''}{r.ean ? ` · EAN ${r.ean}` : ''}
                        {r.voorstel && VOORSTEL[r.voorstel] && <span style={{ color: 'var(--brand)', marginLeft: 6 }}><Sparkles size={11} style={{ verticalAlign: -1 }} /> {VOORSTEL[r.voorstel]}</span>}
                    </div>
                </div>
                {!alleenLezen && (
                    <div style={{ display: 'flex', gap: 4 }}>
                        <button type="button" className="btn btn-ghost btn-sm" title={r.overslaan ? 'Toch boeken' : 'Niet boeken (bijv. statiegeld, bezorgkosten)'} onClick={() => bij({ overslaan: !r.overslaan })}>{r.overslaan ? <Undo2 size={14} /> : 'Overslaan'}</button>
                        <button type="button" className="btn btn-ghost btn-sm" aria-label="Regel verwijderen" onClick={() => onDoe(`d:${r.id}`, () => verwijderRegel({ id: r.id, invoerId }))}><Trash2 size={14} /></button>
                    </div>
                )}
            </div>

            {!r.overslaan && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                    <div className="kf-field">
                        <label className="kf-label">Plek</label>
                        <div className="kf-seg">
                            {(['winkel', 'makerij'] as const).map((p) => (
                                <button key={p} type="button" disabled={alleenLezen} className={`kf-seg-btn${r.plek === p ? ' is-on' : ''}`} onClick={() => { if (r.plek !== p) void bij({ plek: p, winkel_product_id: null, inventory_id: null }); }}>{p}</button>
                            ))}
                        </div>
                    </div>
                    <div className="kf-field" style={{ gridColumn: 'span 2' }}>
                        <label className="kf-label">Product</label>
                        {r.plek === 'winkel' && (
                            <select className="kf-input" disabled={alleenLezen} value={r.winkel_product_id ?? ''} onChange={(e) => e.target.value === '__nieuw' ? setMaak(true) : kiesProduct('winkel', e.target.value)}>
                                <option value="">Kies een winkelproduct…</option>
                                {data.winkel.map((p) => <option key={p.id} value={p.id}>{p.naam} ({p.type})</option>)}
                                <option value="__nieuw">+ Nieuw winkelproduct…</option>
                            </select>
                        )}
                        {r.plek === 'makerij' && (
                            <select className="kf-input" disabled={alleenLezen} value={r.inventory_id ?? ''} onChange={(e) => e.target.value === '__nieuw' ? setMaak(true) : kiesProduct('makerij', e.target.value)}>
                                <option value="">Kies een keukenproduct…</option>
                                {data.keuken.map((p) => <option key={p.id} value={p.id}>{p.naam}{p.unit ? ` (${p.unit})` : ''}</option>)}
                                <option value="__nieuw">+ Nieuw keukenproduct…</option>
                            </select>
                        )}
                        {!r.plek && <div className="kf-help" style={{ paddingTop: 8 }}>Kies eerst de plek.</div>}
                        {w && w.voorraad == null && <div className="kf-help">Nog nooit geteld: de telling start bij deze ontvangst vanaf 0. Tel het daarna om het te bevestigen.</div>}
                    </div>
                    <div className="kf-field">
                        <label className="kf-label">Omrekening</label>
                        <input className="kf-input" inputMode="decimal" disabled={alleenLezen} defaultValue={r.omrekening == null ? '' : String(r.omrekening).replace('.', ',')} key={`om-${r.omrekening}`}
                            placeholder="?" onBlur={(e) => {
                                const om = getal(e.target.value);
                                if (om === r.omrekening) return;
                                void bij({ omrekening: om, aantal: om != null && r.bron_aantal != null ? Math.round(r.bron_aantal * om * 1000) / 1000 : r.aantal });
                            }} />
                        <div className="kf-help">1 {r.bron_eenheid || 'eenheid'} = {r.omrekening ?? '?'} {doelEenheid}</div>
                    </div>
                    <div className="kf-field">
                        <label className="kf-label">Erbij ({doelEenheid || 'aantal'})</label>
                        <input className="kf-input" inputMode="decimal" disabled={alleenLezen} defaultValue={r.aantal == null ? '' : String(r.aantal).replace('.', ',')} key={`a-${r.aantal}`}
                            style={{ fontWeight: 600 }} onBlur={(e) => { const a = getal(e.target.value); if (a !== r.aantal) void bij({ aantal: a }); }} />
                        {w && r.aantal != null && <div className="kf-help">{hoeveelheidKort(r.aantal, w.eenheid)} in de winkel</div>}
                    </div>
                    <div className="kf-field">
                        <label className="kf-label">Prijs per {r.bron_eenheid || 'eenheid'}</label>
                        <input className="kf-input" inputMode="decimal" disabled={alleenLezen} defaultValue={euroTekst(r.bron_prijs_cents)} key={`p-${r.bron_prijs_cents}`} placeholder="onbekend"
                            onBlur={(e) => { const p = getal(e.target.value); const c = p == null ? null : Math.round(p * 100); if (c !== r.bron_prijs_cents) void bij({ bron_prijs_cents: c }); }} />
                        {prijsPerEenheid != null && doelEenheid && <div className="kf-help">= {formatEur(prijsPerEenheid / 100)} per {doelEenheid}{data.kop.prijzen_incl_btw ? ' incl. btw' : ''}</div>}
                    </div>
                    <div className="kf-field">
                        <label className="kf-label">Btw</label>
                        <select className="kf-input" disabled={alleenLezen} value={r.btw_pct ?? ''} onChange={(e) => bij({ btw_pct: e.target.value === '' ? null : Number(e.target.value) })}>
                            <option value="">?</option><option value="9">9%</option><option value="21">21%</option><option value="0">0%</option>
                        </select>
                    </div>
                    <div className="kf-field">
                        <label className="kf-label">THT</label>
                        <input className="kf-input" type="date" disabled={alleenLezen} defaultValue={r.tht ?? ''} onBlur={(e) => { if ((e.target.value || null) !== r.tht) void bij({ tht: e.target.value || null }); }} />
                    </div>
                </div>
            )}

            {maak && !alleenLezen && r.plek && (
                <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: '1px dashed var(--border)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, alignItems: 'end' }}>
                    <div className="kf-field" style={{ gridColumn: 'span 2' }}>
                        <label className="kf-label">Nieuw {r.plek === 'winkel' ? 'winkelproduct' : 'keukenproduct'}</label>
                        <input className="kf-input" value={maakNaam} onChange={(e) => setMaakNaam(e.target.value)} />
                    </div>
                    {r.plek === 'winkel'
                        ? <div className="kf-field"><label className="kf-label">Eenheid</label><div className="kf-seg">{(['stuk', 'gram'] as const).map((e) => <button key={e} type="button" className={`kf-seg-btn${maakEenheid === e ? ' is-on' : ''}`} onClick={() => setMaakEenheid(e)}>{e}</button>)}</div></div>
                        : <div className="kf-field"><label className="kf-label">Eenheid</label><input className="kf-input" value={maakUnit} onChange={(e) => setMaakUnit(e.target.value)} placeholder="kg, stuks" /></div>}
                    <div style={{ display: 'flex', gap: 6 }}>
                        <Button size="sm" onClick={() => void onDoe(`m:${r.id}`, () => maakProductVoorRegel({
                            invoerId, regelId: r.id, plek: r.plek!, naam: maakNaam, eenheid: maakEenheid, unit: maakUnit, ean: r.ean,
                            btw_pct: (r.btw_pct === 21 || r.btw_pct === 0 ? r.btw_pct : 9) as 0 | 9 | 21,
                        }), 'Product aangemaakt').then((d) => { if (d) setMaak(false); })}>Aanmaken</Button>
                        <Button size="sm" variant="ghost" onClick={() => setMaak(false)}>Annuleren</Button>
                    </div>
                    {r.plek === 'winkel' && <div className="kf-help" style={{ gridColumn: '1 / -1' }}>Type, prijzen en foto vul je later aan in Webshop → Producten.</div>}
                </div>
            )}
        </div>
    );
}
