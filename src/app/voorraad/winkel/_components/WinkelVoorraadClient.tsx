'use client';

/**
 * Assortiment: één lijst met alle winkelproducten, te zoeken en te filteren
 * op afdeling. Tik op een product voor alles erover in één lade: voorraad,
 * verkoop, datums, de afdeling en uit het assortiment. Voorraad volgt
 * docs/voorraad-bouwplan.md §3.
 *
 *   aanwezig      = de som van het logboek
 *   gereserveerd  = besteld en nog niet ingepakt
 *   beschikbaar   = aanwezig − gereserveerd (wat de webshop nog verkoopt)
 *
 * Elke verandering is een logboekregel: tellen, ontvangst, overboeken uit de
 * makerij of een afwijking met een reden. Het getal zelf is nergens in te
 * typen. "Niet bijgehouden" blijft zo tot de eerste telling.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeftRight, Beef, Beer, Carrot, ClipboardList, Cookie, EyeOff, Gift, Ham, LayoutGrid, Minus, MoreHorizontal, Nut, Package, PackageCheck, PackagePlus, Plus, RotateCcw, Salad, Search, Settings2, ShoppingCart, Soup, TriangleAlert, Wine } from 'lucide-react';
import '@/styles/menu-hub.css';
import '@/styles/winkel.css';
import Button from '@/components/Button';
import { useToast } from '@/components/Toast';
import Drawer from '@/app/verkoop/webshop/_components/Drawer';
import { formatEur } from '@/lib/format';
import type { Product, Slot } from '@/lib/winkel/rekenen';
import {
    AFWIJKINGSREDENEN, REDEN_LABEL, TYPE_LABEL, beperkendProduct, beschikbaar, geldendeDrempel, gereserveerd,
    hoeveelheidKort, pakkettenTeMaken, voorraadstatus, waardeCenten, type Afwijkingsreden, type Mutatietype, type Reden, type Voorraadstatus,
} from '@/lib/winkel/voorraad';
import { ALLES, assortimentKeuzes, assortimentLijst } from '@/lib/winkel/assortiment';
import { urgentie, type Afdeling, type ProductCijfers, type StukRij, type Urgentie } from '@/lib/winkel/afdelingen';
import type { PartijRij } from '@/lib/winkel/winkelOverzicht';
import { zetHandmatigeBestelling, zetInAssortiment, zetProductOpAfdeling, zetTht } from '@/app/winkel/actions';
import ToevoegenLade from './ToevoegenLade';
import { boekOver, laadLogboek, legAfwijkingVast, ontvangWinkelProduct, telWinkelProduct, zetBestelgegevens, type LogboekRegel } from '../actions';
import { bestelVoorstel } from '@/lib/winkel/bestellen';

export interface WinkelProductRij extends Omit<Product, 'voorraad_bezet'> {
    voorraad_bezet?: number;
    drempel: number | null;
    bestel_hoeveelheid: number | null;
    ean: string | null;
    tht: string | null;
    laatste_beweging_at: string | null;
    inventory_id: number | null;
    foto_url: string | null;
    par_niveau: number | null;
    bestel_eenheid_naam: string | null;
    bestel_prijs_cents: number | null;
    leverancier_id: number | null;
    winkelprijs_incl_cents: number | null;
    bestel_handmatig: number | null;
    foto: string | null;
    afdeling_id: string | null;
    cijfers: ProductCijfers;
    artikel: { prijs_cents: number | null; verkoop_per: 'stuk' | 'kg'; sticker_plu: number | null; opToonbank: boolean } | null;
    stuks: (StukRij & { urgentie: Urgentie })[];
    partijen: PartijRij[];
}

export interface WinkelData {
    afdelingen: Afdeling[];
    /** JJJJ-MM-DD in Nederlandse tijd. */
    vandaag: string;
    /** Regels op de winkelbestellijst. */
    opLijst: number;
    producten: WinkelProductRij[];
    slots: Slot[];
    artikelen: { id: string; naam: string; slug: string; actief: boolean; telt: string }[];
    keuken: { id: number; naam: string; unit: string | null; current_stock: number | null }[];
    leveranciers: { id: number; naam: string }[];
}

const STATUS_KLEUR: Record<Voorraadstatus, string> = {
    niet_bijgehouden: 'var(--muted)',
    tekort: 'var(--red, #dc2626)',
    op: 'var(--red, #dc2626)',
    laag: 'var(--brand-gold, #c4a35a)',
    ok: 'var(--green, #22c55e)',
};

const kaart: React.CSSProperties = { background: 'var(--color-bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)' };
const sleutel = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const eur = (c: number | null | undefined) => (c == null ? '—' : formatEur(c / 100));
const leesGetal = (s: string): number | null => {
    const t = s.trim().replace(/\./g, '').replace(',', '.');
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
};
function thtTekst(iso: string | null): string {
    if (!iso) return '—';
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

const TYPE_ICOON: Record<string, typeof Beer> = {
    bier: Beer, wijn: Wine, worst: Beef, vleeswaar: Ham, amandelen: Nut, crackers: Cookie, krokant: Cookie,
    marmelade: Soup, doos: Gift, verpakking: Package, kaas: Salad, zuur: Carrot, overig: Package,
};

type Filter = 'alles' | 'aandacht' | 'niet_geteld' | 'datum' | 'pakketten';

/** Bijna of al over de datum: de THT van het product, of een bakje. */
const opDatum = (p: WinkelProductRij, vandaag: string) => (p.tht != null && urgentie(p.tht, vandaag) !== 'later') || p.stuks.some((s) => s.urgentie !== 'later');

export default function WinkelVoorraadClient({ data, openProductId, openAfdelingId, beginFilter }: { data: WinkelData; openProductId: string | null; openAfdelingId: string | null; beginFilter: Filter }) {
    const router = useRouter();
    const stil = useReducedMotion();
    const [openId, setOpenId] = useState<string | null>(openProductId);
    const [keuze, setKeuze] = useState<string>(openAfdelingId ?? ALLES);
    const [zoek, setZoek] = useState('');
    const [filter, setFilter] = useState<Filter>(beginFilter);
    const [toevoegen, setToevoegen] = useState(false);
    useEffect(() => { setOpenId(openProductId); }, [openProductId]);
    useEffect(() => { if (openAfdelingId) setKeuze(openAfdelingId); }, [openAfdelingId]);

    const actief = useMemo(() => new Set(data.artikelen.filter((a) => a.actief).map((a) => a.id)), [data.artikelen]);
    const afdelingIds = useMemo(() => new Set(data.afdelingen.map((a) => a.id)), [data.afdelingen]);
    const rijen = useMemo(() => data.producten.map((p) => {
        const b = beschikbaar(p);
        const d = geldendeDrempel(p, data.slots, actief);
        return {
            p, b, status: voorraadstatus(b, d.waarde), waarde: p.voorraad == null ? null : waardeCenten(p, p.voorraad),
            naam: p.naam, actief: p.actief, afdeling_id: p.afdeling_id, verkocht28: p.cijfers.verkocht28,
        };
    }), [data.producten, data.slots, actief]);

    const totaal = useMemo(() => {
        const inAssortiment = rijen.filter((r) => r.actief);
        const bij = inAssortiment.filter((r) => r.p.voorraad != null);
        return {
            aantal: inAssortiment.length,
            waarde: bij.reduce((s, r) => s + (r.waarde ?? 0), 0),
            zonderPrijs: bij.filter((r) => r.waarde == null).length,
            geteld: bij.length,
            aandacht: inAssortiment.filter((r) => r.status === 'laag' || r.status === 'op' || r.status === 'tekort').length,
            datum: inAssortiment.filter((r) => opDatum(r.p, data.vandaag)).length,
        };
    }, [rijen, data.vandaag]);
    const nietsGeteld = totaal.geteld === 0;

    const keuzes = useMemo(() => assortimentKeuzes(data.afdelingen, rijen), [data.afdelingen, rijen]);
    const zichtbaar = useMemo(() => assortimentLijst(rijen, keuze, zoek, afdelingIds).filter((r) => filter === 'alles' || filter === 'pakketten'
        || (filter === 'aandacht' && (r.status === 'laag' || r.status === 'op' || r.status === 'tekort'))
        || (filter === 'niet_geteld' && r.status === 'niet_bijgehouden')
        || (filter === 'datum' && opDatum(r.p, data.vandaag))), [rijen, keuze, zoek, afdelingIds, filter, data.vandaag]);

    const pakketten = useMemo(() => data.artikelen
        .filter((a) => a.actief && data.slots.some((s) => s.artikel_id === a.id))
        .map((a) => ({ a, n: pakkettenTeMaken(a.id, data.slots, data.producten), door: beperkendProduct(a.id, data.slots, data.producten) }))
        .sort((x, y) => (x.n ?? 1e9) - (y.n ?? 1e9)),
    [data.artikelen, data.slots, data.producten]);
    const maxPakket = Math.max(1, ...pakketten.map((x) => x.n ?? 0));

    const open = openId ? data.producten.find((p) => p.id === openId) ?? null : null;
    const sluit = useCallback(() => {
        setOpenId(null);
        if (openProductId) router.replace('/voorraad/winkel', { scroll: false });
    }, [router, openProductId]);
    const afdelingNaam = (id: string | null) => data.afdelingen.find((a) => a.id === id)?.naam ?? null;

    return (
        <div className="wk-pagina mobile-safe-bottom">
            <div className="wk-kop">
                <div>
                    <h1 className="chassis-titel" style={{ margin: 0 }}>Assortiment</h1>
                    <div className="wk-onder">
                        {nietsGeteld
                            ? 'Nog niets geteld. Loop langs de schappen en tel wat er staat.'
                            : `${totaal.geteld} van ${totaal.aantal} geteld · ${eur(totaal.waarde)} aan inkoop in de winkel${totaal.zonderPrijs ? ` (${totaal.zonderPrijs} zonder inkoopprijs telt niet mee)` : ''}`}
                    </div>
                </div>
                <div className="wk-knoppen">
                    <MeerMenu />
                    {data.opLijst > 0 && <Link href="/winkel/bestellijst" className="btn btn-ghost" style={{ textDecoration: 'none' }}><ShoppingCart size={14} /> Bestellijst ({data.opLijst})</Link>}
                    <Link href="/voorraad/winkel/tellen" className={nietsGeteld ? 'btn btn-brand' : 'btn btn-ghost'} style={{ textDecoration: 'none' }}><ClipboardList size={14} /> Tellen</Link>
                    <button type="button" className={nietsGeteld ? 'btn btn-ghost' : 'btn btn-brand'} onClick={() => setToevoegen(true)}><Plus size={14} /> Product toevoegen</button>
                </div>
            </div>

            {data.producten.length === 0 ? (
                <div className="kf-empty"><p>Nog geen winkelproducten. Voeg je eerste product toe; daarna tel je het hier.</p></div>
            ) : (
                <>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <label className="wk-zoek">
                            <Search size={15} />
                            <input className="kf-input" type="search" aria-label="Zoek een product" value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek een product" />
                        </label>
                        {(!nietsGeteld || totaal.datum > 0) && (
                            <select className="kf-input" aria-label="Toon" style={{ width: 'auto', flex: '0 0 auto' }} value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
                                <option value="alles">Alle producten</option>
                                {totaal.datum > 0 && <option value="datum">Bijna over de datum ({totaal.datum})</option>}
                                {!nietsGeteld && <option value="aandacht">Bijna op ({totaal.aandacht})</option>}
                                {!nietsGeteld && <option value="niet_geteld">Niet geteld ({totaal.aantal - totaal.geteld})</option>}
                                {pakketten.length > 0 && !nietsGeteld && <option value="pakketten">Pakketten nog te maken</option>}
                            </select>
                        )}
                    </div>

                    {filter === 'pakketten' ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10, marginTop: 14 }}>
                            {pakketten.map(({ a, n, door }) => {
                                const kleur = n == null ? 'var(--muted)' : n === 0 ? 'var(--red, #dc2626)' : n <= 5 ? 'var(--brand-gold, #c4a35a)' : 'var(--green, #22c55e)';
                                return (
                                    <div key={a.id} style={{ ...kaart, padding: 16, borderColor: n === 0 ? 'rgba(220,38,38,.45)' : 'var(--border)' }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 7 }}><Gift size={14} style={{ color: 'var(--brand-gold, #c4a35a)' }} />{a.naam}</div>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                            <span style={{ fontFamily: 'var(--font-display, Outfit)', fontSize: 34, fontWeight: 300, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: kleur }}>{n == null ? '—' : n}</span>
                                            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{a.telt === 'personen' ? 'personen' : 'pakketten'}</span>
                                        </div>
                                        <Balk deel={n == null ? 0 : n / maxPakket} kleur={kleur} stil={!!stil} />
                                        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>
                                            {n == null ? 'Nog geen onderdeel geteld'
                                                : door ? <>Grens: <button type="button" onClick={() => setOpenId(door.id)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>{door.naam}</button>{n === 0 ? ' is op' : ''}</> : ''}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <>
                            <div className="wk-keuzes">
                                {keuzes.map((k) => (
                                    <button key={k.id} type="button" className={`kf-chip${keuze === k.id ? ' is-on' : ''}`} aria-pressed={keuze === k.id} onClick={() => setKeuze(k.id)}>{k.label} {k.aantal}</button>
                                ))}
                            </div>
                            {zichtbaar.length === 0 ? (
                                <div className="kf-empty"><p>{zoek.trim() ? 'Niets gevonden. Probeer een ander woord of kies Alles.' : 'Niets in deze selectie.'}</p></div>
                            ) : (
                                <div className="wk-lijst">
                                    <div className="wk-rij wk-rij-kop wk-product">
                                        <span>Product</span>
                                        <span className="wk-getal wk-alleen-breed" style={{ fontSize: 12 }}>Prijs</span>
                                        <span className="wk-getal" style={{ fontSize: 12 }}>Ligt er</span>
                                        <span className="wk-getal wk-alleen-breed" style={{ fontSize: 12 }} title="Verkocht in de laatste 4 weken">Verkocht</span>
                                    </div>
                                    {zichtbaar.map((r) => <ProductRegel key={r.p.id} p={r.p} b={r.b} status={r.status} afdeling={keuze === ALLES ? afdelingNaam(r.p.afdeling_id) : null} vandaag={data.vandaag} onClick={() => setOpenId(r.p.id)} />)}
                                </div>
                            )}
                        </>
                    )}
                </>
            )}

            {open && <ProductDrawer key={open.id} p={open} data={data} actief={actief} onClose={sluit} />}
            {toevoegen && <ToevoegenLade afdelingen={data.afdelingen} begin={afdelingIds.has(keuze) ? keuze : null} producten={data.producten} leveranciers={data.leveranciers} onClose={() => setToevoegen(false)} />}
        </div>
    );
}

/** Wat je zelden nodig hebt, staat achter één knop. */
function MeerMenu() {
    const [open, setOpen] = useState(false);
    const plek = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const buiten = (e: MouseEvent) => { if (!plek.current?.contains(e.target as Node)) setOpen(false); };
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', buiten);
        document.addEventListener('keydown', esc);
        return () => { document.removeEventListener('mousedown', buiten); document.removeEventListener('keydown', esc); };
    }, [open]);
    return (
        <div className="wk-menu" ref={plek}>
            <button type="button" className="btn btn-ghost" aria-haspopup="menu" aria-expanded={open} aria-label="Meer" onClick={() => setOpen((x) => !x)}><MoreHorizontal size={16} /></button>
            {open && (
                <div className="wk-menu-paneel" role="menu">
                    <Link href="/voorraad/winkel/bestellen" role="menuitem"><Settings2 size={14} /> Bestelinstellingen</Link>
                    <Link href="/voorraad/winkel/vloer" role="menuitem"><LayoutGrid size={14} /> Afdelingen indelen</Link>
                    <Link href="/voorraad/ontvangst" role="menuitem"><PackagePlus size={14} /> Ontvangst</Link>
                    <Link href="/voorraad/afwijking" role="menuitem"><Minus size={14} /> Afwijking</Link>
                </div>
            )}
        </div>
    );
}

function Balk({ deel, kleur, stil }: { deel: number; kleur: string; stil: boolean }) {
    const w = `${Math.max(0, Math.min(1, deel)) * 100}%`;
    return (
        <div style={{ position: 'relative', height: 6, borderRadius: 3, background: 'rgba(255,255,255,.07)', marginTop: 10, overflow: 'hidden' }}>
            <motion.div initial={stil ? false : { width: 0 }} animate={{ width: w }} transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
                style={{ position: 'absolute', inset: '0 auto 0 0', width: w, background: kleur, borderRadius: 3 }} />
        </div>
    );
}

function ligtErTekst(p: WinkelProductRij, b: number | null): string {
    if (p.artikel?.verkoop_per === 'kg' && p.stuks.length) return `${p.stuks.length} ${p.stuks.length === 1 ? 'bakje' : 'bakjes'}`;
    return p.voorraad == null ? 'niet geteld' : hoeveelheidKort(b ?? 0, p.eenheid);
}

function prijsTekst(p: WinkelProductRij): string {
    const c = p.artikel?.prijs_cents ?? p.winkelprijs_incl_cents;
    return c == null ? '–' : `${eur(c)}${p.artikel?.verkoop_per === 'kg' ? ' /kg' : ''}`;
}

/** De ene regel onder de naam: alleen wat er nu toe doet. */
function ProductRegel({ p, b, status, afdeling, vandaag, onClick }: { p: WinkelProductRij; b: number | null; status: Voorraadstatus; afdeling: string | null; vandaag: string; onClick: () => void }) {
    const Icoon = TYPE_ICOON[p.type] ?? Package;
    const urgent = p.stuks.filter((s) => s.urgentie !== 'later');
    const thtUrgentie = p.tht ? urgentie(p.tht, vandaag) : 'later';
    const over = urgent.some((s) => s.urgentie === 'over') || thtUrgentie === 'over';
    const melding = urgent.length ? `${urgent.length} ${urgent.length === 1 ? 'stuk' : 'stuks'} ${over ? 'over de datum' : `THT ${thtTekst(urgent[0]!.tht.slice(0, 10))}`}`
        : thtUrgentie === 'over' ? `Over de datum (THT ${thtTekst(p.tht)})`
        : thtUrgentie !== 'later' ? `THT ${thtTekst(p.tht)}` : null;
    const kleur = p.voorraad != null && status !== 'ok' ? STATUS_KLEUR[status] : undefined;
    return (
        <button type="button" className="wk-rij wk-product" onClick={onClick}>
            <span className="wk-foto">
                {p.foto
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={p.foto} alt="" loading="lazy" />
                    : <Icoon size={18} />}
            </span>
            <span style={{ minWidth: 0 }}>
                <span className="wk-naam" style={{ display: 'block' }}>{p.naam}</span>
                {(melding || afdeling) && (
                    <span className="wk-klein" style={{ display: 'block', color: melding ? (over ? 'var(--red, #dc2626)' : '#D9A520') : undefined }}>{melding ?? afdeling}</span>
                )}
            </span>
            <span className="wk-getal wk-alleen-breed">{prijsTekst(p)}</span>
            <span className={`wk-getal${p.voorraad == null ? ' wk-stil' : ''}`} style={{ color: kleur }}>{ligtErTekst(p, b)}</span>
            <span className={`wk-getal wk-alleen-breed${p.cijfers.verkocht28 ? '' : ' wk-stil'}`}>{p.cijfers.verkocht28 || '–'}</span>
        </button>
    );
}

/* ── De lade per product ───────────────────────────────────────────────────── */

type Actie = 'ontvangst' | 'overboeken' | 'tellen' | 'afwijking' | 'instellen';

function ProductDrawer({ p, data, actief, onClose }: { p: WinkelProductRij; data: WinkelData; actief: Set<string>; onClose: () => void }) {
    const router = useRouter();
    const toast = useToast();
    const [actie, setActie] = useState<Actie>(p.voorraad == null ? 'tellen' : 'ontvangst');
    const [logboek, setLogboek] = useState<LogboekRegel[] | null>(null);
    const [bezig, setBezig] = useState(false);
    const [key, setKey] = useState(sleutel);
    const b = beschikbaar(p);
    const d = geldendeDrempel(p, data.slots, actief);
    const eenheid = p.eenheid === 'gram' ? 'gram' : 'stuks';

    const laadLog = useCallback(async () => {
        const r = await laadLogboek({ plek: 'winkel', itemId: p.id });
        setLogboek('data' in r ? r.data : []);
    }, [p.id]);
    useEffect(() => { void laadLog(); }, [laadLog]);

    async function doe(fn: () => Promise<{ error: string } | { data: unknown }>, gelukt: string) {
        setBezig(true);
        try {
            const r = await fn();
            if ('error' in r) { toast(r.error, 'error'); return; }
            toast(gelukt, 'success');
            setKey(sleutel());
            router.refresh();
            await laadLog();
        } finally { setBezig(false); }
    }

    /* Formulieren */
    const [aantal, setAantal] = useState('');
    const [prijs, setPrijs] = useState(p.inkoop_excl_cents == null ? '' : (p.inkoop_excl_cents / 100).toFixed(2).replace('.', ','));
    const [tht, setTht] = useState('');
    const [keukenId, setKeukenId] = useState<number | null>(p.inventory_id);
    const [richting, setRichting] = useState<'naar_winkel' | 'naar_keuken'>('naar_winkel');
    const [reden, setReden] = useState<Afwijkingsreden | null>(null);
    const [drempel, setDrempel] = useState(p.drempel == null ? '' : String(p.drempel).replace('.', ','));
    const [bestel, setBestel] = useState(p.bestel_hoeveelheid == null ? '' : String(p.bestel_hoeveelheid).replace('.', ','));
    const [ean, setEan] = useState(p.ean ?? '');
    const [par, setPar] = useState(p.par_niveau == null ? '' : String(p.par_niveau).replace('.', ','));
    const [eenheidNaam, setEenheidNaam] = useState(p.bestel_eenheid_naam ?? '');
    const [bestelPrijs, setBestelPrijs] = useState(p.bestel_prijs_cents == null ? '' : (p.bestel_prijs_cents / 100).toFixed(2).replace('.', ','));
    const [leverancier, setLeverancier] = useState<number | null>(p.leverancier_id);
    const [notitie, setNotitie] = useState('');
    const keukenItem = data.keuken.find((k) => k.id === keukenId) ?? null;
    const afdeling = data.afdelingen.find((a) => a.id === p.afdeling_id) ?? null;
    const kg = p.artikel?.verkoop_per === 'kg';
    const [thtDatum, setThtDatum] = useState(p.tht ?? '');
    const [bestelAantal, setBestelAantal] = useState(() => {
        if (p.bestel_handmatig != null) return String(p.bestel_handmatig).replace('.', ',');
        const tekort = p.par_niveau != null ? p.par_niveau - (p.voorraad ?? 0) : null;
        return tekort != null && tekort > 0 ? String(tekort).replace('.', ',') : '';
    });
    async function zetOpLijst() {
        const n = leesGetal(bestelAantal);
        if (n == null || Number.isNaN(n) || n <= 0) { toast(`Vul in hoeveel (${eenheid}).`, 'error'); return; }
        await doe(() => zetHandmatigeBestelling({ productId: p.id, aantal: n }), `${p.naam} staat op de bestellijst.`);
    }

    function geldigAantal(): number | null {
        const n = leesGetal(aantal);
        if (n == null || Number.isNaN(n) || n <= 0) { toast(`Vul in hoeveel (${eenheid}).`, 'error'); return null; }
        return n;
    }

    async function verstuur() {
        if (actie === 'tellen') {
            const n = leesGetal(aantal);
            if (n == null || Number.isNaN(n) || n < 0) { toast(`Vul het getelde aantal in (${eenheid}).`, 'error'); return; }
            await doe(async () => {
                const r = await telWinkelProduct({ productId: p.id, geteld: n, notitie: notitie || null, sleutel: key });
                if ('data' in r && r.data.reden === 'manko') toast(`Manko: ${hoeveelheidKort(-r.data.hoeveelheid, p.eenheid)}`, 'info');
                return r;
            }, 'Geteld');
        } else if (actie === 'ontvangst') {
            const n = geldigAantal(); if (n == null) return;
            const c = leesGetal(prijs);
            if (Number.isNaN(c)) { toast('Dat is geen geldige prijs.', 'error'); return; }
            await doe(() => ontvangWinkelProduct({ productId: p.id, hoeveelheid: n, inkoop_excl_cents: c == null ? null : Math.round(c * 100), tht: tht || null, notitie: notitie || null, sleutel: key }), `${hoeveelheidKort(n, p.eenheid)} ontvangen`);
        } else if (actie === 'overboeken') {
            const n = geldigAantal(); if (n == null) return;
            if (!keukenId) { toast('Kies het keukenproduct.', 'error'); return; }
            await doe(() => boekOver({ productId: p.id, inventoryId: keukenId, hoeveelheid: n, richting, notitie: notitie || null, sleutel: key }),
                richting === 'naar_winkel' ? `${hoeveelheidKort(n, p.eenheid)} uit de makerij naar de winkel` : `${hoeveelheidKort(n, p.eenheid)} terug naar de makerij`);
        } else if (actie === 'afwijking') {
            const n = geldigAantal(); if (n == null) return;
            if (!reden) { toast('Kies een reden.', 'error'); return; }
            await doe(() => legAfwijkingVast({ bron: 'winkel', id: p.id, hoeveelheid: n, reden, notitie: notitie || null, sleutel: key }), `Vastgelegd: ${hoeveelheidKort(n, p.eenheid)} ${REDEN_LABEL[reden]}`);
        } else {
            const dr = leesGetal(drempel); const be = leesGetal(bestel); const pa = leesGetal(par); const pr = leesGetal(bestelPrijs);
            if ([dr, be, pa, pr].some((x) => Number.isNaN(x))) { toast('Dat is geen geldig getal.', 'error'); return; }
            await doe(() => zetBestelgegevens({
                productId: p.id, drempel: dr, par_niveau: pa, bestel_hoeveelheid: be, bestel_eenheid_naam: eenheidNaam.trim() || null,
                bestel_prijs_cents: pr == null ? null : Math.round(pr * 100), leverancier_id: leverancier, ean: ean.trim() || null,
            }), 'Opgeslagen');
        }
        setAantal(''); setNotitie(''); setReden(null);
    }

    const acties: { k: Actie; label: string; icon: typeof PackagePlus; kan: boolean }[] = [
        { k: 'ontvangst', label: 'Ontvangst', icon: PackagePlus, kan: p.voorraad != null },
        { k: 'overboeken', label: 'Makerij', icon: ArrowLeftRight, kan: p.voorraad != null },
        { k: 'tellen', label: 'Tellen', icon: ClipboardList, kan: true },
        { k: 'afwijking', label: 'Afwijking', icon: TriangleAlert, kan: p.voorraad != null },
        { k: 'instellen', label: 'Bestelgegevens', icon: Settings2, kan: true },
    ];

    return (
        <Drawer eyebrow={`${afdeling?.naam ?? p.type}${p.alcohol ? ' · 18+' : ''}`} title={p.naam} subtitle={p.voorraad == null ? 'Nog niet bijgehouden: tel het eerst' : `Laatste verkoop of verbruik: ${p.laatste_beweging_at ? new Date(p.laatste_beweging_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : 'nog niet'}`} onClose={onClose} width={580}
            footer={<><Button icon={<PackageCheck size={14} />} loading={bezig} onClick={verstuur}>{actie === 'instellen' ? 'Opslaan' : 'Vastleggen'}</Button><Button variant="ghost" onClick={onClose}>Sluiten</Button></>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    <Mini label="Aanwezig" waarde={p.voorraad == null ? '—' : hoeveelheidKort(p.voorraad, p.eenheid)} />
                    <Mini label="Besteld" waarde={p.voorraad == null ? '—' : hoeveelheidKort(gereserveerd(p), p.eenheid)} />
                    <Mini label="Beschikbaar" waarde={b == null ? '—' : hoeveelheidKort(b, p.eenheid)} />
                    <Mini label={d.bron === 'voorstel' ? 'Minimum (voorstel)' : 'Minimum'} waarde={d.waarde == null ? '—' : hoeveelheidKort(d.waarde, p.eenheid)} />
                </div>

                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                    {prijsTekst(p) !== '–' && `${prijsTekst(p)} · `}
                    {p.cijfers.verkocht28 || p.cijfers.verkocht7
                        ? `${p.cijfers.verkocht7} verkocht deze week · ${p.cijfers.verkocht28} in 4 weken · ${eur(p.cijfers.omzet28_cents)} omzet`
                        : 'nog niet verkocht in de laatste 4 weken'}
                    {p.cijfers.laatsteVerkoop && ` · laatst ${thtTekst(p.cijfers.laatsteVerkoop.slice(0, 10))}`}
                    {kg && p.artikel?.sticker_plu != null && ` · stickernummer ${p.artikel.sticker_plu}`}
                    {p.artikel && !p.artikel.opToonbank && ' · niet op de toonbank'}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '150px minmax(0,1fr)', gap: 12 }}>
                    <div className="kf-field">
                        <label className="kf-label" htmlFor="winkel-tht">THT</label>
                        <input id="winkel-tht" className="kf-input" type="date" value={thtDatum} disabled={bezig} onChange={(e) => setThtDatum(e.target.value)}
                            onBlur={() => { if (thtDatum !== (p.tht ?? '')) void doe(() => zetTht({ productId: p.id, tht: thtDatum || null }), thtDatum ? 'THT bewaard' : 'THT gewist'); }} />
                    </div>
                    <div className="kf-field">
                        <label className="kf-label" htmlFor="winkel-bestel">Bestellen ({eenheid})</label>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <input id="winkel-bestel" className="kf-input" inputMode="decimal" value={bestelAantal} onChange={(e) => setBestelAantal(e.target.value)} placeholder="Hoeveel" />
                            <button type="button" className="btn btn-brand" disabled={bezig} onClick={() => void zetOpLijst()}><ShoppingCart size={14} /> {p.bestel_handmatig != null ? 'Wijzig' : 'Bestellen'}</button>
                        </div>
                        {p.bestel_handmatig != null ? (
                            <div className="kf-help">Op de bestellijst: {hoeveelheidKort(p.bestel_handmatig, p.eenheid)}. <button type="button" disabled={bezig} onClick={() => { setBestelAantal(''); void doe(() => zetHandmatigeBestelling({ productId: p.id, aantal: null }), 'Van de bestellijst gehaald'); }} style={{ background: 'none', border: 0, padding: 0, color: 'inherit', font: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>Van de lijst halen</button></div>
                        ) : p.leverancier_id == null && <div className="kf-help">Nog geen leverancier: kies die onder Bestelgegevens.</div>}
                    </div>
                </div>

                {p.stuks.length > 0 && (
                    <div>
                        <div className="kf-eyebrow" style={{ marginBottom: 8 }}>Gestickerd in de winkel</div>
                        {p.stuks.map((s) => (
                            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                                <span>{s.gewicht_g.toLocaleString('nl-NL')} g · {eur(s.prijs_cents)}</span>
                                <span style={{ color: s.urgentie === 'later' ? 'var(--muted)' : s.urgentie === 'over' || s.urgentie === 'vandaag' ? 'var(--red, #dc2626)' : '#D9A520' }}>THT {thtTekst(s.tht.slice(0, 10))}</span>
                            </div>
                        ))}
                        <Link href="/winkel/leveringen" style={{ fontSize: 12.5, color: 'var(--brand-gold, #c4a35a)', display: 'inline-block', marginTop: 8 }}>Naar de keuken of weggooien</Link>
                    </div>
                )}

                {p.partijen.length > 0 && (
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                        <div className="kf-eyebrow" style={{ marginBottom: 6 }}>Open leveringen</div>
                        {p.partijen.map((x) => (
                            <div key={x.id}>{x.leverancier ?? 'Levering'} van {thtTekst(x.geleverd_op.slice(0, 10))} · THT {thtTekst(x.tht.slice(0, 10))}</div>
                        ))}
                    </div>
                )}

                <div className="kf-seg" role="tablist" style={{ flexWrap: 'wrap' }}>
                    {acties.filter((a) => a.kan).map((a) => (
                        <button key={a.k} type="button" role="tab" aria-selected={actie === a.k} className={`kf-seg-btn${actie === a.k ? ' is-on' : ''}`} onClick={() => setActie(a.k)} style={{ gap: 6 }}>
                            <a.icon size={13} />{a.label}
                        </button>
                    ))}
                </div>

                {actie !== 'instellen' && (
                    <div className="kf-field">
                        <label className="kf-label" htmlFor="winkel-aantal">
                            {actie === 'tellen' ? `Geteld (${eenheid})` : actie === 'ontvangst' ? `Binnengekomen (${eenheid})` : actie === 'overboeken' ? `Hoeveel (${eenheid})` : `Hoeveel weg (${eenheid})`}
                        </label>
                        <input id="winkel-aantal" className="kf-input" inputMode="decimal" value={aantal} onChange={(e) => setAantal(e.target.value)} placeholder={actie === 'tellen' && p.voorraad != null ? String(p.voorraad) : ''} style={{ fontSize: 18, height: 48 }} autoFocus />
                        {actie === 'tellen' && <div className="kf-help">Wat er echt staat. Is het minder dan het logboek zegt, dan is het verschil manko; weet je waar het is, leg het dan eerst vast als afwijking.</div>}
                    </div>
                )}

                {actie === 'ontvangst' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div className="kf-field">
                            <label className="kf-label">Inkoop excl. btw per {p.prijs_per === 1 ? (p.eenheid === 'gram' ? 'gram' : 'stuk') : `${p.prijs_per} ${eenheid}`}</label>
                            <input className="kf-input" inputMode="decimal" value={prijs} onChange={(e) => setPrijs(e.target.value)} placeholder="onbekend" />
                            <div className="kf-help">Leeg = de oude prijs blijft staan.</div>
                        </div>
                        <div className="kf-field">
                            <label className="kf-label">THT</label>
                            <input className="kf-input" type="date" value={tht} onChange={(e) => setTht(e.target.value)} />
                        </div>
                    </div>
                )}

                {actie === 'overboeken' && (
                    <>
                        <div className="kf-seg">
                            <button type="button" className={`kf-seg-btn${richting === 'naar_winkel' ? ' is-on' : ''}`} onClick={() => setRichting('naar_winkel')}>Makerij → winkel</button>
                            <button type="button" className={`kf-seg-btn${richting === 'naar_keuken' ? ' is-on' : ''}`} onClick={() => setRichting('naar_keuken')}>Winkel → makerij</button>
                        </div>
                        <div className="kf-field">
                            <label className="kf-label">Keukenproduct</label>
                            <select className="kf-input" value={keukenId ?? ''} onChange={(e) => setKeukenId(e.target.value ? Number(e.target.value) : null)}>
                                <option value="">Kies…</option>
                                {data.keuken.map((k) => <option key={k.id} value={k.id}>{k.naam}{k.current_stock != null ? ` — ${k.current_stock.toLocaleString('nl-NL')} ${k.unit ?? ''}` : ''}</option>)}
                            </select>
                            <div className="kf-help">
                                {keukenItem ? `In de makerij: ${keukenItem.current_stock?.toLocaleString('nl-NL') ?? 0} ${keukenItem.unit ?? ''}. ` : ''}
                                Eraf in de ene plek, erbij in de andere; het wordt geen verkoop. De koppeling blijft bewaard.
                            </div>
                        </div>
                    </>
                )}

                {actie === 'afwijking' && (
                    <div className="kf-field">
                        <label className="kf-label">Reden</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {AFWIJKINGSREDENEN.map((r) => (
                                <button key={r.reden} type="button" className={`kf-chip${reden === r.reden ? ' is-on' : ''}`} onClick={() => setReden(r.reden)} title={r.voorbeeld}>{r.label}</button>
                            ))}
                        </div>
                        <div className="kf-help">Manko kies je niet: dat blijft over na een telling.</div>
                    </div>
                )}

                {actie === 'instellen' && (() => {
                    /* Live: wat er nu op de bestellijst zou komen met deze getallen. */
                    const n = (x: string) => { const v = leesGetal(x); return v == null || Number.isNaN(v) ? null : v; };
                    const minimum = n(drempel) ?? d.waarde;
                    const voorbeeld = bestelVoorstel({
                        id: p.id, naam: p.naam, eenheid: p.eenheid, voorraad: p.voorraad, voorraad_bezet: p.voorraad_bezet,
                        minimum, par_niveau: n(par), bestel_hoeveelheid: n(bestel), bestel_eenheid_naam: eenheidNaam.trim() || null, bestel_prijs_cents: null,
                    });
                    return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div className="kf-field">
                                    <label className="kf-label">Minimum ({eenheid})</label>
                                    <input className="kf-input" inputMode="decimal" value={drempel} onChange={(e) => setDrempel(e.target.value)} placeholder={d.bron === 'voorstel' && d.waarde != null ? `voorstel ${d.waarde}` : p.eenheid === 'gram' ? 'bijv. 1000' : 'bijv. 10'} />
                                    <div className="kf-help">Eronder: "tijd om bij te bestellen". Leeg = genoeg voor 5 pakketten.</div>
                                </div>
                                <div className="kf-field">
                                    <label className="kf-label">Aanvullen tot ({eenheid})</label>
                                    <input className="kf-input" inputMode="decimal" value={par} onChange={(e) => setPar(e.target.value)} placeholder={p.eenheid === 'gram' ? 'bijv. 3000' : 'bijv. 30'} />
                                    <div className="kf-help">Zoveel wil je er hebben na een levering.</div>
                                </div>
                                <div className="kf-field">
                                    <label className="kf-label">Besteleenheid ({eenheid})</label>
                                    <input className="kf-input" inputMode="decimal" value={bestel} onChange={(e) => setBestel(e.target.value)} placeholder={p.eenheid === 'gram' ? 'bijv. 4000 (wiel)' : 'bijv. 24 (krat)'} />
                                    <div className="kf-help">Je bestelt altijd hele besteleenheden: 8 nodig = 1 krat van 24.</div>
                                </div>
                                <div className="kf-field">
                                    <label className="kf-label">Heet</label>
                                    <input className="kf-input" value={eenheidNaam} onChange={(e) => setEenheidNaam(e.target.value)} placeholder="krat, doos, wiel" />
                                </div>
                                <div className="kf-field">
                                    <label className="kf-label">Prijs per besteleenheid (excl. btw)</label>
                                    <input className="kf-input" inputMode="decimal" value={bestelPrijs} onChange={(e) => setBestelPrijs(e.target.value)} placeholder="bijv. 21,60" />
                                    {n(bestelPrijs) != null && n(bestel) ? <div className="kf-help">= {formatEur(n(bestelPrijs)! / n(bestel)!)} per {p.eenheid === 'gram' ? 'gram' : 'stuk'}{p.eenheid === 'gram' ? ` (${formatEur((n(bestelPrijs)! / n(bestel)!) * 1000)} per kg)` : ''}</div> : null}
                                </div>
                                <div className="kf-field">
                                    <label className="kf-label">Leverancier</label>
                                    <select className="kf-input" value={leverancier ?? ''} onChange={(e) => setLeverancier(e.target.value ? Number(e.target.value) : null)}>
                                        <option value="">Nog te kiezen</option>
                                        {data.leveranciers.map((l) => <option key={l.id} value={l.id}>{l.naam}</option>)}
                                    </select>
                                </div>
                                <div className="kf-field" style={{ gridColumn: '1 / -1' }}>
                                    <label className="kf-label">EAN (voor de kassa)</label>
                                    <input className="kf-input" inputMode="numeric" value={ean} onChange={(e) => setEan(e.target.value)} placeholder="nog leeg" />
                                </div>
                            </div>
                            <div className="kf-banner">
                                <PackageCheck size={15} />
                                <span>
                                    {p.voorraad == null ? 'Nog niet geteld: zodra je telt, rekent de bestellijst mee.'
                                        : voorbeeld ? <><strong>Nu op de bestellijst: {voorbeeld.eenheid_label ?? hoeveelheidKort(voorbeeld.besteld, p.eenheid)}.</strong> {voorbeeld.uitleg}</>
                                        : minimum == null ? 'Zonder minimum komt dit product nooit op de bestellijst.'
                                        : <>Niets te bestellen: {hoeveelheidKort(beschikbaar(p) ?? 0, p.eenheid)} vrij, boven het minimum van {hoeveelheidKort(minimum, p.eenheid)}.</>}
                                </span>
                            </div>
                        </div>
                    );
                })()}

                {actie !== 'instellen' && (
                    <div className="kf-field">
                        <label className="kf-label">Notitie</label>
                        <input className="kf-input" value={notitie} onChange={(e) => setNotitie(e.target.value)} placeholder={actie === 'afwijking' ? 'bijv. proeverij klant Jansen' : 'optioneel'} />
                    </div>
                )}

                <div>
                    <div className="kf-eyebrow" style={{ marginBottom: 8 }}>Logboek</div>
                    {logboek == null && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Laden…</div>}
                    {logboek?.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Nog niets. De eerste regel is een telling.</div>}
                    {logboek?.map((r, i) => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}>
                            <span style={{ minWidth: 0 }}>
                                <span style={{ fontWeight: 500 }}>{TYPE_LABEL[r.type as Mutatietype] ?? r.type}</span>
                                {r.reden && <span style={{ color: r.reden === 'manko' ? 'var(--red, #dc2626)' : 'var(--muted)' }}> · {REDEN_LABEL[r.reden as Reden] ?? r.reden}</span>}
                                {r.order_id && <span style={{ color: 'var(--muted)' }}> · order</span>}
                                <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>
                                    {new Date(r.created_at).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{r.notitie ? ` · ${r.notitie}` : ''}
                                </span>
                            </span>
                            <span style={{ fontVariantNumeric: 'tabular-nums', color: r.hoeveelheid < 0 ? 'var(--red, #dc2626)' : 'var(--green, #22c55e)', textAlign: 'right' }}>
                                {r.hoeveelheid > 0 ? '+' : ''}{hoeveelheidKort(r.hoeveelheid, p.eenheid)}
                                {r.waarde_cents != null && <span style={{ display: 'block', fontSize: 10.5, color: 'var(--muted)' }}>{eur(r.waarde_cents)}</span>}
                            </span>
                            <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--muted)', textAlign: 'right', minWidth: 58 }}>= {hoeveelheidKort(r.resultaat, p.eenheid)}</span>
                        </div>
                    ))}
                </div>

                <div style={{ display: 'grid', gap: 10 }}>
                    <div className="kf-eyebrow">Plek in de winkel</div>
                    {data.afdelingen.length > 0 && (
                        <select className="kf-input" aria-label="Afdeling" value={afdeling?.id ?? ''} disabled={bezig} onChange={(e) => {
                            const nieuw = data.afdelingen.find((a) => a.id === e.target.value);
                            if (nieuw) void doe(() => zetProductOpAfdeling({ productId: p.id, afdelingId: nieuw.id }), `${p.naam} staat nu bij ${nieuw.naam}.`);
                        }}>
                            {!afdeling && <option value="">Zonder afdeling</option>}
                            {data.afdelingen.map((a) => <option key={a.id} value={a.id}>{a.naam}</option>)}
                        </select>
                    )}
                    <button type="button" className="btn btn-ghost" style={{ justifyContent: 'flex-start', color: p.actief ? 'var(--red, #dc2626)' : undefined }} disabled={bezig}
                        onClick={() => void doe(() => zetInAssortiment({ productId: p.id, actief: !p.actief, afdelingId: afdeling?.id }),
                            p.actief ? `${p.naam} is uit het assortiment. De geschiedenis blijft.` : `${p.naam} is terug in het assortiment.`)}>
                        {p.actief ? <><EyeOff size={14} /> Uit het assortiment</> : <><RotateCcw size={14} /> Terug in het assortiment</>}
                    </button>
                    {p.actief && <div className="kf-help">Niet meer te koop op de toonbank en de webshop. De verkoopgeschiedenis blijft, terugzetten kan altijd.</div>}
                </div>
            </div>
        </Drawer>
    );
}

function Mini({ label, waarde }: { label: string; waarde: string }) {
    return (
        <div style={{ ...kaart, padding: '10px 10px' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
            <div style={{ fontSize: 15, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{waarde}</div>
        </div>
    );
}
