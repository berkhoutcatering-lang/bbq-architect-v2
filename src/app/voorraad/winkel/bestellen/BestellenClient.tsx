'use client';

/**
 * Bestelinstellingen: per product de leverancier, het minimum, aanvullen tot,
 * de besteleenheid en de prijs daarvan. Elk veld bewaart zichzelf als je het
 * verlaat; met Tab loop je door de rij. Vink producten aan om ze in één keer
 * aan een leverancier te koppelen.
 */
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Search } from 'lucide-react';
import '@/styles/menu-hub.css';
import '@/styles/winkel.css';
import { useToast } from '@/components/Toast';
import type { Afdeling } from '@/lib/winkel/afdelingen';
import { ALLES, assortimentKeuzes, assortimentLijst, type AssortimentRij } from '@/lib/winkel/assortiment';
import { koppelAanLeverancier } from '@/app/winkel/actions';
import { zetBestelgegevens } from '../actions';

export interface BestelRij extends AssortimentRij {
    id: string;
    eenheid: 'stuk' | 'gram';
    drempel: number | null;
    par_niveau: number | null;
    bestel_hoeveelheid: number | null;
    bestel_eenheid_naam: string | null;
    bestel_prijs_cents: number | null;
    leverancier_id: number | null;
    ean: string | null;
}

const tekst = (n: number | null) => (n == null ? '' : String(n).replace('.', ','));
const prijsTekst = (c: number | null) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));
/** "12,5" → 12.5; leeg → null; onzin → NaN. */
function getal(s: string): number | null {
    const t = s.trim().replace(/\./g, '').replace(',', '.');
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
}

export default function BestellenClient({ afdelingen, producten, leveranciers }: { afdelingen: Afdeling[]; producten: BestelRij[]; leveranciers: { id: number; naam: string }[] }) {
    const router = useRouter();
    const toast = useToast();
    const [bezig, start] = useTransition();
    const [keuze, setKeuze] = useState<string>(ALLES);
    const [zoek, setZoek] = useState('');
    const [alleenZonder, setAlleenZonder] = useState(false);
    const [gekozen, setGekozen] = useState<Set<string>>(new Set());
    const [bulk, setBulk] = useState('');

    const ids = useMemo(() => new Set(afdelingen.map((a) => a.id)), [afdelingen]);
    const keuzes = useMemo(() => assortimentKeuzes(afdelingen, producten), [afdelingen, producten]);
    const zichtbaar = assortimentLijst(producten, keuze, zoek, ids).filter((p) => !alleenZonder || p.leverancier_id == null);
    const zonder = producten.filter((p) => p.leverancier_id == null).length;
    const allesAan = zichtbaar.length > 0 && zichtbaar.every((p) => gekozen.has(p.id));

    const wissel = (id: string) => setGekozen((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const koppel = () => start(async () => {
        const lev = leveranciers.find((l) => String(l.id) === bulk);
        if (!lev) { toast('Kies een leverancier.', 'error'); return; }
        const r = await koppelAanLeverancier({ productIds: [...gekozen], leverancierId: lev.id });
        if ('error' in r) { toast(r.error, 'error'); return; }
        toast(`${r.data.aantal} ${r.data.aantal === 1 ? 'product' : 'producten'} bij ${lev.naam}.`, 'success');
        setGekozen(new Set());
        router.refresh();
    });

    return (
        <div className="wk-pagina mobile-safe-bottom">
            <div className="wk-kop">
                <div>
                    <Link href="/voorraad/winkel" className="kf-eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none', color: 'var(--muted)' }}><ArrowLeft size={12} /> Assortiment</Link>
                    <h1 className="chassis-titel" style={{ margin: '4px 0 0' }}>Bestelinstellingen</h1>
                    <div className="wk-onder">Elk veld bewaart zichzelf. Met Tab spring je naar het volgende.</div>
                </div>
                <Link href="/winkel/bestellijst" className="btn btn-ghost" style={{ textDecoration: 'none' }}>Naar de bestellijst</Link>
            </div>

            <label className="wk-zoek" style={{ display: 'block' }}>
                <Search size={15} />
                <input className="kf-input" type="search" aria-label="Zoek een product" value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek een product" />
            </label>
            <div className="wk-keuzes">
                {keuzes.map((k) => <button key={k.id} type="button" className={`kf-chip${keuze === k.id ? ' is-on' : ''}`} aria-pressed={keuze === k.id} onClick={() => setKeuze(k.id)}>{k.label} {k.aantal}</button>)}
                {zonder > 0 && <button type="button" className={`kf-chip${alleenZonder ? ' is-on' : ''}`} aria-pressed={alleenZonder} onClick={() => setAlleenZonder((x) => !x)}>Geen leverancier {zonder}</button>}
            </div>

            {gekozen.size > 0 && (
                <div className="wk-bulk">
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{gekozen.size} gekozen</span>
                    <select className="kf-input" aria-label="Leverancier voor de gekozen producten" style={{ width: 'auto', flex: '1 1 200px', maxWidth: 280 }} value={bulk} onChange={(e) => setBulk(e.target.value)}>
                        <option value="">Kies een leverancier</option>
                        {leveranciers.map((l) => <option key={l.id} value={l.id}>{l.naam}</option>)}
                    </select>
                    <button type="button" className="btn btn-brand" disabled={bezig || !bulk} onClick={koppel}>Koppelen</button>
                    <button type="button" className="btn btn-ghost" onClick={() => setGekozen(new Set())}>Wissen</button>
                </div>
            )}

            {zichtbaar.length === 0 ? (
                <div className="kf-empty"><p>Niets in deze selectie.</p></div>
            ) : (
                <div className="wk-lijst" style={{ overflowX: 'auto' }}>
                    <div className="wk-rij wk-rij-kop wk-instel">
                        <input type="checkbox" aria-label="Alles kiezen" checked={allesAan} onChange={() => setGekozen(allesAan ? new Set() : new Set(zichtbaar.map((p) => p.id)))} />
                        <span>Product</span><span>Leverancier</span><span>Minimum</span><span>Aanvullen tot</span><span>Besteleenheid</span><span>Prijs eenheid</span>
                    </div>
                    {zichtbaar.map((p) => <Rij key={p.id} p={p} gekozen={gekozen.has(p.id)} wissel={() => wissel(p.id)} leveranciers={leveranciers} />)}
                </div>
            )}
        </div>
    );
}

function Rij({ p, gekozen, wissel, leveranciers }: { p: BestelRij; gekozen: boolean; wissel: () => void; leveranciers: { id: number; naam: string }[] }) {
    const toast = useToast();
    const router = useRouter();
    const [v, setV] = useState({
        leverancier: p.leverancier_id == null ? '' : String(p.leverancier_id),
        drempel: tekst(p.drempel), par: tekst(p.par_niveau), bestel: tekst(p.bestel_hoeveelheid), prijs: prijsTekst(p.bestel_prijs_cents),
    });
    const [bewaard, setBewaard] = useState(v);
    const [vinkje, setVinkje] = useState(false);

    async function bewaar(nieuw = v) {
        if (JSON.stringify(nieuw) === JSON.stringify(bewaard)) return;
        const [d, a, b, c] = [getal(nieuw.drempel), getal(nieuw.par), getal(nieuw.bestel), getal(nieuw.prijs)];
        if ([d, a, b, c].some((x) => Number.isNaN(x))) { toast(`${p.naam}: dat is geen geldig getal.`, 'error'); return; }
        const r = await zetBestelgegevens({
            productId: p.id, drempel: d, par_niveau: a, bestel_hoeveelheid: b, bestel_eenheid_naam: p.bestel_eenheid_naam,
            bestel_prijs_cents: c == null ? null : Math.round(c * 100), leverancier_id: nieuw.leverancier ? Number(nieuw.leverancier) : null, ean: p.ean,
        });
        if ('error' in r) { toast(`${p.naam}: ${r.error}`, 'error'); return; }
        setBewaard(nieuw);
        setVinkje(true);
        setTimeout(() => setVinkje(false), 1500);
        router.refresh();
    }
    const veld = (k: 'drempel' | 'par' | 'bestel' | 'prijs', label: string) => (
        <input className="kf-input" inputMode="decimal" aria-label={`${label} ${p.naam}`} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} onBlur={() => void bewaar()} />
    );
    return (
        <div className="wk-rij wk-instel" style={{ cursor: 'default' }}>
            <input type="checkbox" aria-label={`${p.naam} kiezen`} checked={gekozen} onChange={wissel} />
            <span style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="wk-naam" title={p.naam}>{p.naam}</span>
                {p.eenheid === 'gram' && <span className="wk-klein" style={{ marginTop: 0, flexShrink: 0 }}>gram</span>}
                {vinkje && <Check size={14} aria-label="Bewaard" style={{ color: 'var(--green, #22c55e)', flexShrink: 0 }} />}
            </span>
            <select className="kf-input" aria-label={`Leverancier ${p.naam}`} value={v.leverancier} onChange={(e) => { const n = { ...v, leverancier: e.target.value }; setV(n); void bewaar(n); }}>
                <option value="">Nog te kiezen</option>
                {leveranciers.map((l) => <option key={l.id} value={l.id}>{l.naam}</option>)}
            </select>
            {veld('drempel', 'Minimum')}{veld('par', 'Aanvullen tot')}{veld('bestel', 'Besteleenheid')}{veld('prijs', 'Prijs per besteleenheid')}
        </div>
    );
}
