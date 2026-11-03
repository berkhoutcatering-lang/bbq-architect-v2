'use client';

/**
 * Een levering binnenmelden. Bovenaan leverancier, leverdatum en (voor het
 * gemak) één productiedatum en THT voor alles; per product aanvinken en waar
 * nodig een eigen datum. Bewaren maakt per product een partij. De Toonbank
 * laat die bij het stickeren kiezen: de THT op de sticker komt hier vandaan.
 */
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Check, PackageCheck, Truck } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { datumNL } from '@/lib/winkel/afdelingen';
import type { PartijRij } from '@/lib/winkel/winkelOverzicht';
import { meldLeveringBinnen, sluitPartij } from '../actions';

const kaart: React.CSSProperties = { background: 'var(--color-bg-elevated)', border: '1px solid var(--border)', borderRadius: 14, color: 'var(--text)' };
const datumKort = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Amsterdam' });

interface BinnenProduct { id: string; naam: string; leverancier_id: number | null; voorverpakt: boolean; afdeling: string | null }
interface Regel { aan: boolean; productiedatum: string; tht: string }

export default function BinnenClient({ producten, leveranciers, partijen, ontbreekt }: {
    producten: BinnenProduct[];
    leveranciers: { id: number; naam: string }[];
    partijen: (PartijRij & { product: string; gestickerd: number })[];
    ontbreekt: boolean;
}) {
    const router = useRouter();
    const toast = useToast();
    const stil = useReducedMotion();
    const [bezig, start] = useTransition();
    const vandaag = datumNL(new Date());

    /* De leverancier die het vaakst bij deze producten hoort (Veerbeek), anders leeg. */
    const standaardLev = useMemo(() => {
        const tel = new Map<number, number>();
        for (const p of producten) if (p.leverancier_id) tel.set(p.leverancier_id, (tel.get(p.leverancier_id) ?? 0) + 1);
        return [...tel].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    }, [producten]);

    const [lev, setLev] = useState<string>(standaardLev ? String(standaardLev) : '');
    const [geleverd, setGeleverd] = useState(vandaag);
    const [alleProd, setAlleProd] = useState('');
    const [alleTht, setAlleTht] = useState('');
    const [regels, setRegels] = useState<Record<string, Regel>>({});

    const zichtbaar = producten.filter((p) => !lev || !p.leverancier_id || String(p.leverancier_id) === lev);
    const regel = (id: string): Regel => regels[id] ?? { aan: false, productiedatum: '', tht: '' };
    const zet = (id: string, r: Partial<Regel>) => setRegels((x) => ({ ...x, [id]: { ...regel(id), ...r } }));
    const gekozen = zichtbaar.filter((p) => regel(p.id).aan);
    const thtVan = (p: BinnenProduct) => regel(p.id).tht || alleTht;
    const prodVan = (p: BinnenProduct) => regel(p.id).productiedatum || alleProd;
    const zonderTht = gekozen.filter((p) => !thtVan(p));

    const bewaar = () => start(async () => {
        const r = await meldLeveringBinnen({
            leverancier_id: lev ? Number(lev) : null,
            geleverd_op: geleverd,
            bron: 'a4',
            regels: gekozen.map((p) => ({ productId: p.id, productiedatum: prodVan(p) || null, tht: thtVan(p) })),
        });
        if ('error' in r) { toast(r.error, 'error'); return; }
        toast(`${r.data.partijen} ${r.data.partijen === 1 ? 'product' : 'producten'} binnen. Je kunt ze nu stickeren op de Toonbank.`, 'success');
        setRegels({});
        router.refresh();
    });

    return (
        <div className="mobile-safe-bottom" style={{ padding: '20px var(--space-mobile-edge, 16px) 48px', maxWidth: 980, margin: '0 auto' }}>
            <div style={{ marginBottom: 20 }}>
                <Link href="/winkel" className="kf-eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none', color: 'var(--muted)' }}><ArrowLeft size={12} /> Afdelingen</Link>
                <h1 className="chassis-titel" style={{ margin: '4px 0 0' }}>Levering binnen</h1>
                <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 4 }}>Neem van het A4 per product de productiedatum en de THT over. Bij het stickeren kies je daarna de levering; de THT komt dan vanzelf op de sticker.</div>
            </div>

            {ontbreekt ? (
                <div className="kf-empty"><p>Leveringen kunnen nog niet bewaard worden: eerst moet de update voor stickers draaien (migratie 20261103120000).</p></div>
            ) : producten.length === 0 ? (
                <div className="kf-empty"><p>Er zijn nog geen producten op gewicht. Voeg ze toe bij een afdeling (bijvoorbeeld Vlees) met "Op gewicht".</p></div>
            ) : (
                <>
                    <div style={{ ...kaart, padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 14 }}>
                        <label style={{ display: 'grid', gap: 6 }}>
                            <span className="kf-eyebrow">Leverancier</span>
                            <select className="kf-input" value={lev} onChange={(e) => setLev(e.target.value)}>
                                <option value="">Alle</option>
                                {leveranciers.map((l) => <option key={l.id} value={l.id}>{l.naam}</option>)}
                            </select>
                        </label>
                        <label style={{ display: 'grid', gap: 6 }}>
                            <span className="kf-eyebrow">Geleverd op</span>
                            <input type="date" className="kf-input" value={geleverd} onChange={(e) => setGeleverd(e.target.value)} />
                        </label>
                        <label style={{ display: 'grid', gap: 6 }}>
                            <span className="kf-eyebrow">Productiedatum (voor alles)</span>
                            <input type="date" className="kf-input" value={alleProd} onChange={(e) => setAlleProd(e.target.value)} />
                        </label>
                        <label style={{ display: 'grid', gap: 6 }}>
                            <span className="kf-eyebrow">THT (voor alles)</span>
                            <input type="date" className="kf-input" value={alleTht} min={vandaag} onChange={(e) => setAlleTht(e.target.value)} />
                        </label>
                    </div>

                    <div style={{ display: 'grid', gap: 8 }}>
                        {zichtbaar.map((p, i) => {
                            const r = regel(p.id);
                            return (
                                <motion.div key={p.id} initial={stil ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.025, 0.25) }}
                                    style={{ ...kaart, padding: '10px 14px', display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', gap: 12, alignItems: 'center', borderColor: r.aan ? 'var(--brand-gold, #c4a35a)' : 'var(--border)' }}>
                                    <button type="button" onClick={() => zet(p.id, { aan: !r.aan })} aria-pressed={r.aan} aria-label={`${p.naam} ${r.aan ? 'niet' : ''} binnen`}
                                        style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', display: 'grid', placeItems: 'center', cursor: 'pointer',
                                            background: r.aan ? 'var(--brand-gold, #c4a35a)' : 'transparent', color: r.aan ? '#1a1a1a' : 'var(--muted)' }}>
                                        {r.aan && <Check size={16} />}
                                    </button>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, fontSize: 14 }}>{p.naam}</div>
                                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.afdeling ?? 'zonder afdeling'}{p.voorverpakt ? ' · voorverpakt' : ''}</div>
                                        </div>
                                        {r.aan && (
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                <label style={{ display: 'grid', gap: 2, fontSize: 11, color: 'var(--muted)' }}>gemaakt
                                                    <input type="date" className="kf-input" value={r.productiedatum || alleProd} onChange={(e) => zet(p.id, { productiedatum: e.target.value })} />
                                                </label>
                                                <label style={{ display: 'grid', gap: 2, fontSize: 11, color: thtVan(p) ? 'var(--muted)' : 'var(--red, #dc2626)' }}>THT
                                                    <input type="date" className="kf-input" value={r.tht || alleTht} min={vandaag} onChange={(e) => zet(p.id, { tht: e.target.value })} />
                                                </label>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>

                    <div style={{ position: 'sticky', bottom: 12, marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'center' }}>
                        {zonderTht.length > 0 && <span style={{ fontSize: 13, color: 'var(--red, #dc2626)' }}>{zonderTht.length} zonder THT</span>}
                        <button type="button" className="btn btn-brand btn-touch" disabled={bezig || gekozen.length === 0 || zonderTht.length > 0} onClick={bewaar}>
                            <Truck size={16} /> {gekozen.length ? `${gekozen.length} ${gekozen.length === 1 ? 'product' : 'producten'} binnen` : 'Kies wat er binnenkwam'}
                        </button>
                    </div>
                </>
            )}

            {partijen.length > 0 && (
                <div style={{ marginTop: 30 }}>
                    <div className="kf-eyebrow" style={{ marginBottom: 10 }}>Open leveringen (te kiezen bij het stickeren)</div>
                    <div style={{ display: 'grid', gap: 6 }}>
                        {partijen.map((x) => (
                            <div key={x.id} style={{ ...kaart, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                <PackageCheck size={16} style={{ color: 'var(--muted)' }} />
                                <span style={{ flex: '1 1 220px', fontSize: 13.5 }}>
                                    <strong>{x.product}</strong> · {x.leverancier ?? 'levering'} van {datumKort(x.geleverd_op)} · THT {datumKort(x.tht)} · {x.gestickerd} gestickerd
                                </span>
                                <button type="button" className="btn btn-ghost" disabled={bezig} onClick={() => start(async () => {
                                    const r = await sluitPartij({ id: x.id });
                                    if ('error' in r) { toast(r.error, 'error'); return; }
                                    toast('Levering afgesloten: hij staat niet meer in de keuze bij het stickeren.', 'success');
                                    router.refresh();
                                })}>Afsluiten</button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
