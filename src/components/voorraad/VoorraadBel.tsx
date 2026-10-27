'use client';

/**
 * De voorraadbel (W4): een teller met de ongelezen voorraadmeldingen — bijna
 * op, op, pakket dicht, tekort vooruit — voor keuken én winkel. Staat op
 * Vandaag en op de winkelvoorraad. Plan: docs/voorraad-bouwplan.md §3 W4.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, Bell, CalendarClock, ClipboardList, PackageX, ScanBarcode, TrendingDown } from 'lucide-react';
import { laadBelMeldingen, markeerGelezen, type BelMelding } from '@/app/voorraad/winkel/actions';

const ICOON: Record<string, typeof Bell> = {
    voorraad_laag: TrendingDown,
    voorraad_op: PackageX,
    artikel_dicht: AlertTriangle,
    voorraad_tekort_vooruit: CalendarClock,
    /* "Tel {product}" na een tekort aan de Toonbank (contract §4.2 stap 8). */
    voorraad_tellen: ClipboardList,
    kassa_onbekend: ScanBarcode,
};
const KLEUR: Record<string, string> = {
    voorraad_laag: 'var(--brand-gold, #c4a35a)',
    voorraad_op: 'var(--red, #dc2626)',
    artikel_dicht: 'var(--red, #dc2626)',
    voorraad_tekort_vooruit: 'var(--brand-gold, #c4a35a)',
    voorraad_tellen: 'var(--brand-gold, #c4a35a)',
    kassa_onbekend: 'var(--red, #dc2626)',
};

function wanneer(iso: string): string {
    const d = new Date(iso);
    const min = Math.round((Date.now() - d.getTime()) / 60000);
    if (min < 1) return 'net';
    if (min < 60) return `${min} min geleden`;
    if (min < 60 * 24) return `${Math.round(min / 60)} uur geleden`;
    return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

export default function VoorraadBel() {
    const [open, setOpen] = useState(false);
    const [ongelezen, setOngelezen] = useState(0);
    const [meldingen, setMeldingen] = useState<BelMelding[]>([]);
    const ref = useRef<HTMLDivElement>(null);
    const stil = useReducedMotion();

    const laad = useCallback(async () => {
        const r = await laadBelMeldingen();
        if ('data' in r) { setOngelezen(r.data.ongelezen); setMeldingen(r.data.meldingen); }
    }, []);

    useEffect(() => {
        void laad();
        const t = setInterval(() => { if (document.visibilityState === 'visible') void laad(); }, 120_000);
        return () => clearInterval(t);
    }, [laad]);

    useEffect(() => {
        if (!open) return;
        const dicht = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', dicht);
        document.addEventListener('keydown', esc);
        return () => { document.removeEventListener('mousedown', dicht); document.removeEventListener('keydown', esc); };
    }, [open]);

    async function allesGelezen() {
        await markeerGelezen({ ids: null });
        await laad();
    }
    async function lees(m: BelMelding) {
        if (!m.read_at) await markeerGelezen({ ids: [m.id] });
        setOpen(false);
        void laad();
    }

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <button
                type="button"
                onClick={() => setOpen((x) => !x)}
                aria-label={ongelezen ? `${ongelezen} voorraadmeldingen` : 'Voorraadmeldingen'}
                aria-expanded={open}
                style={{
                    position: 'relative', width: 40, height: 40, borderRadius: 10, display: 'grid', placeItems: 'center',
                    background: 'var(--color-bg-elevated)', border: '1px solid var(--border)', color: ongelezen ? 'var(--text)' : 'var(--muted)', cursor: 'pointer',
                }}
            >
                <Bell size={17} />
                <AnimatePresence>
                    {ongelezen > 0 && (
                        <motion.span
                            key={ongelezen}
                            initial={stil ? false : { scale: 0.4, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.4, opacity: 0 }}
                            style={{
                                position: 'absolute', top: -5, right: -5, minWidth: 19, height: 19, padding: '0 5px', borderRadius: 10,
                                background: 'var(--red, #dc2626)', color: '#fff', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center',
                                fontVariantNumeric: 'tabular-nums',
                            }}
                        >{ongelezen > 99 ? '99+' : ongelezen}</motion.span>
                    )}
                </AnimatePresence>
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={stil ? false : { opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.15 }}
                        role="dialog"
                        aria-label="Voorraadmeldingen"
                        style={{
                            position: 'absolute', right: 0, top: 46, zIndex: 60, width: 'min(380px, calc(100vw - 32px))', maxHeight: 460, overflowY: 'auto',
                            background: 'var(--color-bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,.28)',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>Voorraad</span>
                            {ongelezen > 0 && (
                                <button type="button" onClick={allesGelezen} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
                                    Alles gelezen
                                </button>
                            )}
                        </div>
                        {meldingen.length === 0 && (
                            <div style={{ padding: 18, fontSize: 13, color: 'var(--muted)' }}>Niets bijna op. De bel gaat als iets onder de grens zakt.</div>
                        )}
                        {meldingen.map((m) => {
                            const I = ICOON[m.type] ?? Bell;
                            const inhoud = (
                                <div style={{ display: 'flex', gap: 10, padding: '11px 14px', borderBottom: '1px solid var(--border)', opacity: m.read_at ? 0.6 : 1 }}>
                                    <span style={{ color: KLEUR[m.type] ?? 'var(--muted)', paddingTop: 2, flexShrink: 0 }}><I size={15} /></span>
                                    <span style={{ minWidth: 0 }}>
                                        <span style={{ display: 'block', fontSize: 13, fontWeight: m.read_at ? 400 : 600, color: 'var(--text)' }}>{m.title}</span>
                                        {m.body && <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginTop: 2, lineHeight: 1.45 }}>{m.body}</span>}
                                        <span style={{ display: 'block', fontSize: 11, color: 'var(--muted-light, var(--muted))', marginTop: 4 }}>{wanneer(m.created_at)}</span>
                                    </span>
                                </div>
                            );
                            return m.link
                                ? <Link key={m.id} href={m.link} onClick={() => lees(m)} style={{ textDecoration: 'none', display: 'block' }}>{inhoud}</Link>
                                : <div key={m.id} onClick={() => lees(m)}>{inhoud}</div>;
                        })}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
