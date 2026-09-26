'use client';

/**
 * "1 fles wijn eigen gebruik" in twee tikken (W5).
 *
 *   tik 1: het product (bovenaan wat je het laatst vastlegde)
 *   tik 2: de reden — dat is meteen vastleggen, met aantal 1
 *
 * Meer dan één? Eerst + of −, dan de reden. Manko staat er bewust niet bij:
 * dat blijft over na een telling (plan docs/voorraad-bouwplan.md §3 W5).
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Minus, Plus, Search, Store, UtensilsCrossed } from 'lucide-react';
import '@/styles/menu-hub.css';
import { useToast } from '@/components/Toast';
import { formatEur } from '@/lib/format';
import { AFWIJKINGSREDENEN, REDEN_LABEL, type Afwijkingsreden, type Reden } from '@/lib/winkel/voorraad';
import { legAfwijkingVast } from '../winkel/actions';

export interface AfwijkItem {
    bron: 'winkel' | 'keuken';
    id: string | number;
    naam: string;
    groep: string;
    eenheid: string;
    stap: number;
    voorraad: number | null;
}
export interface MaandRegel { plek: 'winkel' | 'makerij'; reden: string; regels: number; waarde_cents: number; zonder_prijs: number }

const kaart: React.CSSProperties = { background: 'var(--color-bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)' };
const terug: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid var(--border)', borderRadius: 9, padding: '9px 13px', minHeight: 42, color: 'var(--muted)', fontSize: 13, textDecoration: 'none' };
const knop: React.CSSProperties = { width: 52, height: 52, borderRadius: 11, background: 'var(--color-bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', display: 'grid', placeItems: 'center', touchAction: 'manipulation' };
const sleutelVan = (i: Pick<AfwijkItem, 'bron' | 'id'>) => `${i.bron}:${i.id}`;
const nieuweSleutel = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const getal = (n: number) => n.toLocaleString('nl-NL', { maximumFractionDigits: 2 });

export default function AfwijkingClient({ items, recent, maand }: { items: AfwijkItem[]; recent: string[]; maand: MaandRegel[] }) {
    const router = useRouter();
    const toast = useToast();
    const stil = useReducedMotion();
    const [q, setQ] = useState('');
    const [bron, setBron] = useState<'alles' | 'winkel' | 'keuken'>('alles');
    const [gekozen, setGekozen] = useState<AfwijkItem | null>(null);
    const [aantal, setAantal] = useState(1);
    const [bezig, setBezig] = useState<Afwijkingsreden | null>(null);

    const opSleutel = useMemo(() => new Map(items.map((i) => [sleutelVan(i), i])), [items]);
    const recentItems = recent.map((s) => opSleutel.get(s)).filter((x): x is AfwijkItem => !!x);
    const lijst = useMemo(() => {
        const t = q.trim().toLowerCase();
        return items.filter((i) => (bron === 'alles' || i.bron === bron) && (!t || i.naam.toLowerCase().includes(t))).slice(0, 60);
    }, [items, q, bron]);

    function kies(i: AfwijkItem) {
        setGekozen(i);
        setAantal(i.stap);
    }

    async function leg(reden: Afwijkingsreden) {
        if (!gekozen) return;
        setBezig(reden);
        try {
            const r = await legAfwijkingVast({ bron: gekozen.bron, id: gekozen.id, hoeveelheid: aantal, reden, notitie: null, sleutel: nieuweSleutel() });
            if ('error' in r) { toast(r.error, 'error'); return; }
            const waarde = r.data.waardeCents == null ? '' : ` · ${formatEur(Math.abs(r.data.waardeCents) / 100)}`;
            toast(`${getal(aantal)} ${gekozen.eenheid} ${gekozen.naam} — ${REDEN_LABEL[reden]}${waarde}`, 'success');
            setGekozen(null);
            router.refresh();
        } finally { setBezig(null); }
    }

    const perReden = useMemo(() => {
        const m = new Map<string, { waarde: number; regels: number; zonder: number }>();
        for (const r of maand) {
            const x = m.get(r.reden) ?? { waarde: 0, regels: 0, zonder: 0 };
            x.waarde += Number(r.waarde_cents); x.regels += Number(r.regels); x.zonder += Number(r.zonder_prijs);
            m.set(r.reden, x);
        }
        return [...m.entries()].sort((a, b) => b[1].waarde - a[1].waarde);
    }, [maand]);
    const maandTotaal = perReden.reduce((s, [, x]) => s + x.waarde, 0);

    return (
        <div className="mobile-safe-bottom" style={{ padding: '20px var(--space-mobile-edge, 16px) 40px', maxWidth: 720, margin: '0 auto' }}>
            <Link href="/voorraad/winkel" style={{ ...terug, marginBottom: 18 }}><ArrowLeft size={15} /> Winkel</Link>
            <h1 className="chassis-titel" style={{ margin: '0 0 6px' }}>Afwijking</h1>
            <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 18px' }}>
                Iets gaat weg zonder verkoop. Tik het product, tik de reden, klaar.
            </p>

            <AnimatePresence mode="wait">
                {gekozen ? (
                    <motion.div key="reden" initial={stil ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={stil ? undefined : { opacity: 0, x: -16 }}>
                        <div style={{ ...kaart, padding: 16, marginBottom: 14 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                                {gekozen.bron === 'winkel' ? <Store size={12} /> : <UtensilsCrossed size={12} />}{gekozen.bron === 'winkel' ? 'Winkel' : 'Makerij'} · {gekozen.groep}
                            </div>
                            <div style={{ fontSize: 19, fontWeight: 600, margin: '4px 0 2px' }}>{gekozen.naam}</div>
                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Er is {gekozen.voorraad == null ? '—' : `${getal(gekozen.voorraad)} ${gekozen.eenheid}`}</div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14 }}>
                                <button type="button" style={knop} aria-label="Minder" onClick={() => setAantal((a) => Math.max(gekozen.stap, Math.round((a - gekozen.stap) * 1000) / 1000))}><Minus size={18} /></button>
                                <div style={{ flex: 1, textAlign: 'center', fontSize: 26, fontVariantNumeric: 'tabular-nums' }}>{getal(aantal)} <span style={{ fontSize: 14, color: 'var(--muted)' }}>{gekozen.eenheid}</span></div>
                                <button type="button" style={knop} aria-label="Meer" onClick={() => setAantal((a) => Math.round((a + gekozen.stap) * 1000) / 1000)}><Plus size={18} /></button>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gap: 8 }}>
                            {AFWIJKINGSREDENEN.map((r) => (
                                <button key={r.reden} type="button" disabled={bezig != null} onClick={() => leg(r.reden)}
                                    style={{ ...kaart, padding: '14px 16px', minHeight: 60, textAlign: 'left', cursor: 'pointer', touchAction: 'manipulation', opacity: bezig && bezig !== r.reden ? 0.5 : 1 }}>
                                    <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>{bezig === r.reden ? 'Vastleggen…' : r.label}</span>
                                    <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>{r.voorbeeld}</span>
                                </button>
                            ))}
                        </div>
                        <button type="button" onClick={() => setGekozen(null)} style={{ ...terug, marginTop: 14 }}><ArrowLeft size={15} /> Ander product</button>
                    </motion.div>
                ) : (
                    <motion.div key="product" initial={stil ? false : { opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={stil ? undefined : { opacity: 0, x: 16 }}>
                        {recentItems.length > 0 && !q && (
                            <>
                                <div className="kf-eyebrow" style={{ margin: '0 0 8px' }}>Laatst vastgelegd</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginBottom: 18 }}>
                                    {recentItems.map((i) => (
                                        <button key={sleutelVan(i)} type="button" onClick={() => kies(i)} style={{ ...kaart, padding: 12, minHeight: 64, textAlign: 'left', cursor: 'pointer', touchAction: 'manipulation' }}>
                                            <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{i.naam}</span>
                                            <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>{i.bron === 'winkel' ? 'winkel' : 'makerij'}</span>
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                            {(['alles', 'winkel', 'keuken'] as const).map((b) => (
                                <button key={b} type="button" className={`kf-chip${bron === b ? ' is-on' : ''}`} onClick={() => setBron(b)}>{b === 'keuken' ? 'makerij' : b}</button>
                            ))}
                        </div>
                        <div style={{ ...kaart, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', height: 46, marginBottom: 12 }}>
                            <Search size={15} style={{ color: 'var(--muted)' }} />
                            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek product" style={{ flex: 1, background: 'none', border: 'none', color: 'var(--text)', fontSize: 15, outline: 'none' }} />
                        </div>
                        {lijst.map((i) => (
                            <button key={sleutelVan(i)} type="button" onClick={() => kies(i)}
                                style={{ ...kaart, width: '100%', marginBottom: 7, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10, minHeight: 56, textAlign: 'left', cursor: 'pointer', touchAction: 'manipulation' }}>
                                <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{i.bron === 'winkel' ? <Store size={15} /> : <UtensilsCrossed size={15} />}</span>
                                <span style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ display: 'block', fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.naam}</span>
                                    <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>{i.groep}</span>
                                </span>
                                <span style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{i.voorraad == null ? '' : `${getal(i.voorraad)} ${i.eenheid}`}</span>
                            </button>
                        ))}
                        {lijst.length === 0 && <div className="kf-empty"><p>Niets gevonden. Een winkelproduct staat hier pas als het geteld is.</p></div>}
                    </motion.div>
                )}
            </AnimatePresence>

            <section style={{ marginTop: 28 }}>
                <div className="kf-eyebrow" style={{ marginBottom: 8 }}>Deze maand · tegen inkoopprijs</div>
                <div style={{ ...kaart, padding: '6px 14px' }}>
                    {perReden.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)', padding: '10px 0' }}>Nog geen afwijkingen deze maand.</div>}
                    {perReden.map(([reden, x]) => (
                        <div key={reden} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border)', fontSize: 13.5 }}>
                            <span>{REDEN_LABEL[reden as Reden] ?? reden} <span style={{ color: 'var(--muted)', fontSize: 12 }}>· {x.regels}×{x.zonder ? `, ${x.zonder} zonder prijs` : ''}</span></span>
                            <span style={{ fontVariantNumeric: 'tabular-nums', color: reden === 'manko' ? 'var(--red, #dc2626)' : 'var(--text)' }}>{formatEur(x.waarde / 100)}</span>
                        </div>
                    ))}
                    {perReden.length > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 6px', fontSize: 14, fontWeight: 600 }}>
                            <span>Totaal</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatEur(maandTotaal / 100)}</span>
                        </div>
                    )}
                </div>
                <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
                    Hoe eigen gebruik geboekt wordt (privé-onttrekking, btw) bepaalt de boekhouder; hier wordt alleen vastgelegd.
                </p>
            </section>
        </div>
    );
}
