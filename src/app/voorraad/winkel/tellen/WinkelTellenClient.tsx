'use client';

/**
 * Winkel tellen op de telefoon (W2). Kies een schap, tik een product, tel.
 * Wat je invult is wat er staat; het verschil met het logboek wordt manko
 * (minder) of "meer geteld". Bij grammen kun je zakjes × inhoud laten
 * uitrekenen. Grote knoppen, één hand.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Check, ChevronRight, Minus, Plus, Search } from 'lucide-react';
import '@/styles/menu-hub.css';
import { useToast } from '@/components/Toast';
import { hoeveelheidKort } from '@/lib/winkel/voorraad';
import { telWinkelProduct } from '../actions';

export interface TelProduct {
    id: string;
    naam: string;
    type: string;
    eenheid: 'stuk' | 'gram';
    voorraad: number | null;
    vandaagGeteld: boolean;
}

const kaart: React.CSSProperties = { background: 'var(--color-bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)' };
const veld: React.CSSProperties = { height: 52, borderRadius: 10, padding: '0 12px', background: 'var(--color-bg-deep)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 22, textAlign: 'center', width: '100%' };
const knop: React.CSSProperties = { width: 56, height: 52, borderRadius: 11, flexShrink: 0, background: 'var(--color-bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', display: 'grid', placeItems: 'center', touchAction: 'manipulation' };
const terug: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid var(--border)', borderRadius: 9, padding: '9px 13px', minHeight: 42, color: 'var(--muted)', fontSize: 13, cursor: 'pointer', textDecoration: 'none' };
const nieuweSleutel = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const lees = (s: string) => { const t = s.trim().replace(',', '.'); return t === '' ? null : Number(t); };

export default function WinkelTellenClient({ producten }: { producten: TelProduct[] }) {
    const router = useRouter();
    const [schap, setSchap] = useState<string | null>(null);
    const [q, setQ] = useState('');
    const [open, setOpen] = useState<TelProduct | null>(null);
    const [geteld, setGeteld] = useState<Set<string>>(() => new Set(producten.filter((p) => p.vandaagGeteld).map((p) => p.id)));

    const schappen = useMemo(() => {
        const m = new Map<string, number>();
        for (const p of producten) m.set(p.type, (m.get(p.type) ?? 0) + 1);
        return [...m.entries()];
    }, [producten]);
    const lijst = producten.filter((p) => (!schap || p.type === schap) && (!q.trim() || p.naam.toLowerCase().includes(q.trim().toLowerCase())));

    if (open) {
        return <TelKaart p={open} onKlaar={(id) => { setGeteld((s) => new Set(s).add(id)); setOpen(null); router.refresh(); }} onTerug={() => setOpen(null)} />;
    }

    return (
        <div className="mobile-safe-bottom" style={{ padding: '20px var(--space-mobile-edge, 16px) 40px', maxWidth: 720, margin: '0 auto' }}>
            <Link href="/voorraad/winkel" style={{ ...terug, marginBottom: 18 }}><ArrowLeft size={15} /> Winkel</Link>
            <h1 className="chassis-titel" style={{ margin: '0 0 6px' }}>Winkel tellen</h1>
            <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 18px' }}>
                Loop langs de schappen. Tik een product en vul in wat er staat. {geteld.size} van {producten.length} vandaag geteld.
            </p>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                <button type="button" className={`kf-chip${schap == null ? ' is-on' : ''}`} onClick={() => setSchap(null)}>Alles · {producten.length}</button>
                {schappen.map(([t, n]) => (
                    <button key={t} type="button" className={`kf-chip${schap === t ? ' is-on' : ''}`} onClick={() => setSchap(schap === t ? null : t)}>{t} · {n}</button>
                ))}
            </div>
            <div style={{ ...kaart, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', height: 46, marginBottom: 14 }}>
                <Search size={15} style={{ color: 'var(--muted)' }} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek product" style={{ flex: 1, background: 'none', border: 'none', color: 'var(--text)', fontSize: 15, outline: 'none' }} />
            </div>

            {lijst.map((p) => {
                const af = geteld.has(p.id);
                return (
                    <button key={p.id} type="button" onClick={() => setOpen(p)}
                        style={{ ...kaart, width: '100%', marginBottom: 8, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', minHeight: 62, textAlign: 'left', touchAction: 'manipulation' }}>
                        <span style={{ width: 34, height: 34, borderRadius: 8, flexShrink: 0, display: 'grid', placeItems: 'center', background: af ? 'rgba(34,197,94,.12)' : 'transparent', color: 'var(--green, #22c55e)', border: af ? 'none' : '1px dashed var(--border)' }}>
                            {af && <Check size={16} />}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.naam}</span>
                            <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>{p.type} · logboek: {p.voorraad == null ? 'nog niet geteld' : hoeveelheidKort(p.voorraad, p.eenheid)}</span>
                        </span>
                        <ChevronRight size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                    </button>
                );
            })}
            {lijst.length === 0 && <div className="kf-empty"><p>Niets gevonden.</p></div>}
        </div>
    );
}

function TelKaart({ p, onKlaar, onTerug }: { p: TelProduct; onKlaar: (id: string) => void; onTerug: () => void }) {
    const toast = useToast();
    const stil = useReducedMotion();
    const [waarde, setWaarde] = useState('');
    /* Grammen: zakjes × inhoud. Leeg = je typt het totaal zelf. */
    const [zakjes, setZakjes] = useState('');
    const [perZak, setPerZak] = useState('');
    const [bezig, setBezig] = useState(false);
    const [sleutel] = useState(nieuweSleutel);
    const [uitkomst, setUitkomst] = useState<string | null>(null);

    const rekenTotaal = p.eenheid === 'gram' && lees(zakjes) != null && lees(perZak) != null ? (lees(zakjes)! * lees(perZak)!) : null;
    const totaal = rekenTotaal ?? lees(waarde);
    const stap = (d: number) => setWaarde((w) => String(Math.max(0, (lees(w) ?? 0) + d)));

    async function bewaar() {
        if (totaal == null || Number.isNaN(totaal) || totaal < 0) { toast('Vul in hoeveel er staat.', 'error'); return; }
        setBezig(true);
        try {
            const r = await telWinkelProduct({ productId: p.id, geteld: totaal, notitie: null, sleutel });
            if ('error' in r) { toast(r.error, 'error'); return; }
            const d = r.data;
            setUitkomst(d.reden === 'manko' ? `Manko: ${hoeveelheidKort(-d.hoeveelheid, p.eenheid)} minder dan het logboek`
                : d.reden === 'telling_meer' ? `${hoeveelheidKort(d.hoeveelheid, p.eenheid)} meer dan het logboek`
                : p.voorraad == null ? 'Eerste telling vastgelegd' : 'Klopt met het logboek');
            setTimeout(() => onKlaar(p.id), 1100);
        } finally { setBezig(false); }
    }

    return (
        <div className="mobile-safe-bottom" style={{ padding: '20px var(--space-mobile-edge, 16px) 40px', maxWidth: 560, margin: '0 auto' }}>
            <button type="button" onClick={onTerug} style={{ ...terug, marginBottom: 18 }}><ArrowLeft size={15} /> Terug</button>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>{p.type}</div>
            <h2 style={{ fontFamily: 'var(--font-display, Outfit)', fontWeight: 300, fontSize: 26, margin: '4px 0 6px' }}>{p.naam}</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 20px' }}>Logboek: {p.voorraad == null ? 'nog niet geteld' : hoeveelheidKort(p.voorraad, p.eenheid)}. Vul in wat er echt staat.</p>

            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '.06em' }}>{p.eenheid === 'gram' ? 'Totaal in gram' : 'Aantal'}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
                <button type="button" onClick={() => stap(p.eenheid === 'gram' ? -50 : -1)} aria-label="Minder" style={knop}><Minus size={18} /></button>
                <input inputMode="decimal" value={rekenTotaal != null ? String(rekenTotaal) : waarde} onChange={(e) => { setWaarde(e.target.value); setZakjes(''); setPerZak(''); }} style={veld} autoFocus />
                <button type="button" onClick={() => stap(p.eenheid === 'gram' ? 50 : 1)} aria-label="Meer" style={knop}><Plus size={18} /></button>
            </div>

            {p.eenheid === 'gram' && (
                <div style={{ ...kaart, padding: 12, marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Of reken het uit: zakjes × gram per zakje</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input inputMode="numeric" value={zakjes} onChange={(e) => setZakjes(e.target.value)} placeholder="zakjes" style={{ ...veld, fontSize: 17, height: 46 }} />
                        <span style={{ color: 'var(--muted)' }}>×</span>
                        <input inputMode="decimal" value={perZak} onChange={(e) => setPerZak(e.target.value)} placeholder="gram" style={{ ...veld, fontSize: 17, height: 46 }} />
                    </div>
                </div>
            )}

            <button type="button" onClick={bewaar} disabled={bezig || uitkomst != null} className="btn btn-brand btn-touch" style={{ width: '100%', justifyContent: 'center', minHeight: 54, fontSize: 16 }}>
                <Check size={17} /> {bezig ? 'Bezig…' : 'Geteld'}
            </button>

            <AnimatePresence>
                {uitkomst && (
                    <motion.div initial={stil ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        style={{ ...kaart, marginTop: 14, padding: 14, fontSize: 14, textAlign: 'center', borderColor: uitkomst.startsWith('Manko') ? 'rgba(220,38,38,.5)' : 'rgba(34,197,94,.45)' }}>
                        {uitkomst}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
