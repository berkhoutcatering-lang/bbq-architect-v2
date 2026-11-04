'use client';

/**
 * De winkelproducten van één leverancier. Toevoegen gaat in de rechter-lade:
 * zoeken, aanvinken, in één keer koppelen. Staat een product al bij een andere
 * leverancier, dan verhuist het hierheen.
 */
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Package, Plus, Search, X } from 'lucide-react';
import '@/styles/menu-hub.css';
import '@/styles/winkel.css';
import { useToast } from '@/components/Toast';
import Drawer from '@/app/verkoop/webshop/_components/Drawer';
import type { Afdeling } from '@/lib/winkel/afdelingen';
import { ALLES, assortimentKeuzes, assortimentLijst, type AssortimentRij } from '@/lib/winkel/assortiment';
import { koppelAanLeverancier } from '@/app/winkel/actions';

interface Rij extends AssortimentRij {
    id: string;
    foto: string | null;
    leverancier_id: number | null;
    leverancier: string | null;
}

export default function WinkelProductenClient({ leverancier, afdelingen, producten }: { leverancier: { id: number; naam: string }; afdelingen: Afdeling[]; producten: Rij[] }) {
    const router = useRouter();
    const toast = useToast();
    const [bezig, start] = useTransition();
    const [lade, setLade] = useState(false);
    const hier = producten.filter((p) => p.leverancier_id === leverancier.id);
    const afdelingNaam = (id: string | null) => afdelingen.find((a) => a.id === id)?.naam ?? 'Zonder afdeling';

    const haalWeg = (p: Rij) => start(async () => {
        const r = await koppelAanLeverancier({ productIds: [p.id], leverancierId: null });
        if ('error' in r) { toast(r.error, 'error'); return; }
        toast(`${p.naam} staat niet meer bij ${leverancier.naam}.`, 'success');
        router.refresh();
    });

    return (
        <div className="wk-pagina mobile-safe-bottom">
            <div className="wk-kop">
                <div>
                    <Link href="/leveranciers" className="kf-eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none', color: 'var(--muted)' }}><ArrowLeft size={12} /> Leveranciers</Link>
                    <h1 className="chassis-titel" style={{ margin: '4px 0 0' }}>{leverancier.naam}</h1>
                    <div className="wk-onder">{hier.length} {hier.length === 1 ? 'winkelproduct' : 'winkelproducten'}</div>
                </div>
                <button type="button" className="btn btn-brand" onClick={() => setLade(true)}><Plus size={14} /> Producten toevoegen</button>
            </div>

            {hier.length === 0 ? (
                <div className="kf-empty"><p>Nog geen winkelproducten bij deze leverancier.</p></div>
            ) : (
                <div className="wk-lijst">
                    {hier.map((p) => (
                        <div key={p.id} className="wk-rij" style={{ gridTemplateColumns: '40px minmax(0,1fr) auto', cursor: 'default' }}>
                            <span className="wk-foto">
                                {p.foto
                                    // eslint-disable-next-line @next/next/no-img-element
                                    ? <img src={p.foto} alt="" loading="lazy" />
                                    : <Package size={18} />}
                            </span>
                            <span style={{ minWidth: 0 }}>
                                <span className="wk-naam" style={{ display: 'block' }}>{p.naam}</span>
                                <span className="wk-klein" style={{ display: 'block' }}>{afdelingNaam(p.afdeling_id)}</span>
                            </span>
                            <button type="button" className="btn btn-ghost" style={{ padding: '4px 8px' }} disabled={bezig} aria-label={`${p.naam} weghalen bij ${leverancier.naam}`} onClick={() => haalWeg(p)}><X size={14} /></button>
                        </div>
                    ))}
                </div>
            )}

            {lade && <ToevoegenLade leverancier={leverancier} afdelingen={afdelingen} producten={producten.filter((p) => p.leverancier_id !== leverancier.id)} onClose={() => setLade(false)} />}
        </div>
    );
}

function ToevoegenLade({ leverancier, afdelingen, producten, onClose }: { leverancier: { id: number; naam: string }; afdelingen: Afdeling[]; producten: Rij[]; onClose: () => void }) {
    const router = useRouter();
    const toast = useToast();
    const [bezig, start] = useTransition();
    const [zoek, setZoek] = useState('');
    const [keuze, setKeuze] = useState<string>(ALLES);
    const [gekozen, setGekozen] = useState<Set<string>>(new Set());
    const ids = useMemo(() => new Set(afdelingen.map((a) => a.id)), [afdelingen]);
    const keuzes = useMemo(() => assortimentKeuzes(afdelingen, producten), [afdelingen, producten]);
    const lijst = assortimentLijst(producten, keuze, zoek, ids);
    const wissel = (id: string) => setGekozen((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });

    const voegToe = () => start(async () => {
        const r = await koppelAanLeverancier({ productIds: [...gekozen], leverancierId: leverancier.id });
        if ('error' in r) { toast(r.error, 'error'); return; }
        toast(`${r.data.aantal} ${r.data.aantal === 1 ? 'product' : 'producten'} bij ${leverancier.naam}.`, 'success');
        onClose();
        router.refresh();
    });

    return (
        <Drawer eyebrow={leverancier.naam} title="Producten toevoegen" width={560} onClose={onClose}
            footer={<button type="button" className="btn btn-brand" disabled={bezig || gekozen.size === 0} onClick={voegToe}>{gekozen.size ? `${gekozen.size} toevoegen` : 'Kies producten'}</button>}>
            <label className="wk-zoek" style={{ display: 'block' }}>
                <Search size={15} />
                <input className="kf-input" type="search" autoFocus aria-label="Zoek een product" value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek een product" />
            </label>
            <div className="wk-keuzes">
                {keuzes.map((k) => <button key={k.id} type="button" className={`kf-chip${keuze === k.id ? ' is-on' : ''}`} aria-pressed={keuze === k.id} onClick={() => setKeuze(k.id)}>{k.label} {k.aantal}</button>)}
            </div>
            {lijst.length === 0 ? <div className="kf-empty"><p>Niets gevonden.</p></div> : (
                <div className="wk-lijst">
                    {lijst.map((p) => {
                        const aan = gekozen.has(p.id);
                        return (
                            <button key={p.id} type="button" className="wk-rij" aria-pressed={aan} style={{ gridTemplateColumns: '24px minmax(0,1fr)', minHeight: 48 }} onClick={() => wissel(p.id)}>
                                <span style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid var(--border)', display: 'grid', placeItems: 'center', background: aan ? 'var(--brand-gold, #c4a35a)' : 'transparent', color: '#1a1a1a' }}>{aan && <Check size={14} />}</span>
                                <span style={{ minWidth: 0 }}>
                                    <span className="wk-naam" style={{ display: 'block' }}>{p.naam}</span>
                                    {p.leverancier && <span className="wk-klein" style={{ display: 'block' }}>nu bij {p.leverancier}</span>}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </Drawer>
    );
}
