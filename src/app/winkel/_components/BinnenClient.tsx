'use client';

/**
 * Een levering binnenmelden, in de rechter-lade. Bovenaan leverancier,
 * leverdatum en (voor het gemak) één productiedatum en THT voor alles; per
 * product aanvinken en waar nodig een eigen datum. Bewaren maakt per product
 * een partij. De Toonbank laat die bij het stickeren kiezen: de THT op de
 * sticker komt hier vandaan.
 */
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Truck } from 'lucide-react';
import { useToast } from '@/components/Toast';
import Drawer from '@/app/verkoop/webshop/_components/Drawer';
import { datumNL } from '@/lib/winkel/afdelingen';
import { meldLeveringBinnen } from '../actions';

export interface BinnenProduct { id: string; naam: string; leverancier_id: number | null; voorverpakt: boolean; afdeling: string | null }
interface Regel { aan: boolean; productiedatum: string; tht: string }

export default function BinnenLade({ producten, leveranciers, onClose }: {
    producten: BinnenProduct[];
    leveranciers: { id: number; naam: string }[];
    onClose: () => void;
}) {
    const router = useRouter();
    const toast = useToast();
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
        onClose();
        router.refresh();
    });

    return (
        <Drawer title="Levering binnenmelden" subtitle="Neem van het A4 per product de productiedatum en de THT over." width={620} onClose={onClose}
            footer={<>
                <button type="button" className="btn btn-brand" disabled={bezig || gekozen.length === 0 || zonderTht.length > 0} onClick={bewaar}>
                    <Truck size={16} /> {gekozen.length ? `${gekozen.length} ${gekozen.length === 1 ? 'product' : 'producten'} binnen` : 'Kies wat er binnenkwam'}
                </button>
                {zonderTht.length > 0 && <span style={{ fontSize: 13, color: 'var(--red, #dc2626)' }}>{zonderTht.length} zonder THT</span>}
            </>}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
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

            <div className="wk-lijst">
                {zichtbaar.map((p) => {
                    const r = regel(p.id);
                    return (
                        <div key={p.id} className="wk-rij" style={{ gridTemplateColumns: 'auto minmax(0,1fr)', cursor: 'default' }}>
                            <button type="button" onClick={() => zet(p.id, { aan: !r.aan })} aria-pressed={r.aan} aria-label={`${p.naam} ${r.aan ? 'niet' : ''} binnen`}
                                style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', display: 'grid', placeItems: 'center', cursor: 'pointer',
                                    background: r.aan ? 'var(--brand-gold, #c4a35a)' : 'transparent', color: r.aan ? '#1a1a1a' : 'var(--muted)' }}>
                                {r.aan && <Check size={16} />}
                            </button>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minWidth: 0 }}>
                                <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                                    <div className="wk-naam">{p.naam}</div>
                                    <div className="wk-klein">{p.afdeling ?? 'zonder afdeling'}{p.voorverpakt ? ' · voorverpakt' : ''}</div>
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
                        </div>
                    );
                })}
            </div>
        </Drawer>
    );
}
