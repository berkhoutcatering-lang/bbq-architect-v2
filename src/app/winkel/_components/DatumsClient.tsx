'use client';

/**
 * Datums: alle gestickerde stuks die nog in de winkel liggen, vroegste THT
 * eerst, per product en datum gebundeld. Per bundel (of per stuk): naar de
 * keuken (afwijking keuken_verbruik) of weggooien (derving_tht). Wat verder
 * weg ligt, staat onder "Later" ingeklapt.
 */
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, CalendarCheck, ChefHat, ChevronDown, Trash2 } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { formatEur, formatNumber } from '@/lib/format';
import type { DatumGroep, Urgentie } from '@/lib/winkel/afdelingen';
import { boekStukAf } from '../actions';

const kaart: React.CSSProperties = { background: 'var(--color-bg-elevated)', border: '1px solid var(--border)', borderRadius: 14, color: 'var(--text)' };
const euro = (cents: number) => formatEur(cents / 100);
const datumKort = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Amsterdam' });
const LABEL: Record<Urgentie, string> = { over: 'Over de datum', vandaag: 'Vandaag de laatste dag', morgen: 'Morgen de laatste dag', bijna: 'Over twee dagen', later: 'Later' };
const KLEUR: Record<Urgentie, string> = { over: 'var(--red, #dc2626)', vandaag: 'var(--red, #dc2626)', morgen: '#D9A520', bijna: '#D9A520', later: 'var(--muted)' };

type Groep = DatumGroep & { naam: string; afdeling: string | null };

export default function DatumsClient({ groepen, ontbreekt }: { groepen: Groep[]; ontbreekt: boolean }) {
    const router = useRouter();
    const toast = useToast();
    const stil = useReducedMotion();
    const [bezig, start] = useTransition();
    const [toonLater, setToonLater] = useState(false);
    const [open, setOpen] = useState<string | null>(null);

    const urgent = groepen.filter((g) => g.urgentie !== 'later');
    const later = groepen.filter((g) => g.urgentie === 'later');

    const afboeken = (ids: string[], wat: 'afgeschreven' | 'naar_keuken', naam: string) => start(async () => {
        const r = await boekStukAf({ stukIds: ids, wat });
        if ('error' in r) { toast(r.error, 'error'); return; }
        toast(wat === 'naar_keuken' ? `${ids.length} × ${naam} naar de keuken.` : `${ids.length} × ${naam} weggegooid (derving).`, 'success');
        router.refresh();
    });

    const blok = (g: Groep, i: number) => {
        const sleutel = `${g.product_id}|${g.tht}`;
        const ids = g.stuks.map((s) => s.id);
        const gewicht = g.stuks.reduce((s, x) => s + x.gewicht_g, 0);
        const waarde = g.stuks.reduce((s, x) => s + x.prijs_cents, 0);
        return (
            <motion.div key={sleutel} layout={!stil} initial={stil ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}
                style={{ ...kaart, padding: '12px 14px', borderLeft: `4px solid ${KLEUR[g.urgentie]}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => setOpen(open === sleutel ? null : sleutel)} style={{ flex: '1 1 240px', minWidth: 0, textAlign: 'left', background: 'none', border: 0, color: 'inherit', cursor: 'pointer', padding: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14.5 }}>{g.stuks.length} × {g.naam}</div>
                        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                            <span style={{ color: KLEUR[g.urgentie], fontWeight: 600 }}>THT {datumKort(g.tht)}</span>
                            {' · '}{formatNumber(gewicht)} g · {euro(waarde)}{g.afdeling ? ` · ${g.afdeling}` : ''}
                        </div>
                    </button>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" className="btn btn-ghost" disabled={bezig} onClick={() => afboeken(ids, 'naar_keuken', g.naam)}><ChefHat size={14} /> Naar de keuken</button>
                        <button type="button" className="btn btn-ghost" style={{ color: 'var(--red, #dc2626)' }} disabled={bezig} onClick={() => afboeken(ids, 'afgeschreven', g.naam)}><Trash2 size={14} /> Weggooien</button>
                    </div>
                </div>
                {open === sleutel && g.stuks.length > 1 && (
                    <div style={{ display: 'grid', gap: 4, marginTop: 10 }}>
                        {g.stuks.map((s) => (
                            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--muted)' }}>
                                <span style={{ flex: 1 }}>{formatNumber(s.gewicht_g)} g · {euro(s.prijs_cents)}</span>
                                <button type="button" className="btn btn-ghost" style={{ padding: '2px 8px' }} disabled={bezig} onClick={() => afboeken([s.id], 'naar_keuken', g.naam)}>keuken</button>
                                <button type="button" className="btn btn-ghost" style={{ padding: '2px 8px', color: 'var(--red, #dc2626)' }} disabled={bezig} onClick={() => afboeken([s.id], 'afgeschreven', g.naam)}>weg</button>
                            </div>
                        ))}
                    </div>
                )}
            </motion.div>
        );
    };

    return (
        <div className="mobile-safe-bottom" style={{ padding: '20px var(--space-mobile-edge, 16px) 48px', maxWidth: 980, margin: '0 auto' }}>
            <div style={{ marginBottom: 20 }}>
                <Link href="/winkel" className="kf-eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none', color: 'var(--muted)' }}><ArrowLeft size={12} /> Afdelingen</Link>
                <h1 className="chassis-titel" style={{ margin: '4px 0 0' }}>Datums</h1>
                <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 4 }}>Alles wat gestickerd in de winkel ligt, vroegste THT eerst. Verkochte stuks gaan er vanzelf af.</div>
            </div>

            {ontbreekt ? (
                <div className="kf-empty"><p>Datums per stuk komen er zodra de update voor stickers draait (migratie 20261103120000).</p></div>
            ) : groepen.length === 0 ? (
                <div className="kf-empty"><p>Er ligt niets gestickerd in de winkel.</p></div>
            ) : (
                <>
                    {urgent.length === 0 ? (
                        <div style={{ ...kaart, padding: '18px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                            <CalendarCheck size={20} style={{ color: 'var(--green, #2E9E6B)' }} />
                            <span style={{ fontSize: 14 }}>Niets gaat de komende twee dagen over de datum.</span>
                        </div>
                    ) : (
                        (['over', 'vandaag', 'morgen', 'bijna'] as Urgentie[]).map((u) => {
                            const hier = urgent.filter((g) => g.urgentie === u);
                            if (!hier.length) return null;
                            return (
                                <section key={u} style={{ marginBottom: 18 }}>
                                    <div className="kf-eyebrow" style={{ marginBottom: 8, color: KLEUR[u] }}>{LABEL[u]}</div>
                                    <div style={{ display: 'grid', gap: 8 }}><AnimatePresence>{hier.map(blok)}</AnimatePresence></div>
                                </section>
                            );
                        })
                    )}
                    {later.length > 0 && (
                        <section style={{ marginTop: 12 }}>
                            <button type="button" className="btn btn-ghost" onClick={() => setToonLater((x) => !x)}>
                                <ChevronDown size={14} style={{ transform: toonLater ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} /> Later ({later.reduce((n, g) => n + g.stuks.length, 0)} stuks)
                            </button>
                            {toonLater && <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>{later.map(blok)}</div>}
                        </section>
                    )}
                </>
            )}
        </div>
    );
}
