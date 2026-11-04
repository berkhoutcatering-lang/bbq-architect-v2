'use client';

/**
 * Afdelingen indelen — de afdelingen als ingeklapte lijst. Klap er één open
 * om te zien wat er staat; tik op een product om het te verplaatsen of van de
 * plek te halen; "+ Product" zet er iets bij. Producten die nergens staan,
 * staan onderaan. Geen voorraadgetallen: dat is Assortiment.
 */
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Beer, Beef, ChevronDown, Cookie, Gift, Ham, LayoutGrid, Nut, Package, Pencil, Plus, Salad, Search, Wine } from 'lucide-react';
import '@/styles/menu-hub.css';
import { useToast } from '@/components/Toast';
import Drawer from '@/app/verkoop/webshop/_components/Drawer';
import { PLEK_SOORT_LABEL, type LivePlaatsing, type LivePlek, type PlekSoort } from '@/lib/winkel/plekken';
import { haalVanPlek, hernoemPlek, maakPlek, plaatsProduct, richtWinkelIn } from './actions';

export interface VloerProduct {
    id: string;
    naam: string;
    type: string;
    actief: boolean;
    foto: string | null;
}

export interface VloerData {
    ruimte: LivePlek | null;
    plekken: LivePlek[];
    plaatsingen: LivePlaatsing[];
    producten: VloerProduct[];
}

const TYPE_ICOON: Record<string, typeof Beer> = {
    bier: Beer, wijn: Wine, worst: Beef, vleeswaar: Ham, amandelen: Nut, crackers: Cookie, krokant: Cookie, doos: Gift, kaas: Salad,
};
const kaart: React.CSSProperties = { background: 'var(--color-bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)' };
const NIEUWE_SOORTEN: PlekSoort[] = ['afdeling', 'vitrine', 'stelling', 'kast', 'vrieskist', 'plank'];

type Lade =
    | { soort: 'product'; productId: string }
    | { soort: 'erbij'; plekId: string }
    | { soort: 'nieuwe-plek' }
    | { soort: 'hernoem'; plekId: string };

export default function VloerClient({ data }: { data: VloerData | null }) {
    const router = useRouter();
    const toast = useToast();
    const stil = useReducedMotion();
    const [lade, setLade] = useState<Lade | null>(null);
    const [bezig, start] = useTransition();

    const doe = (werk: () => Promise<{ error: string } | { data: unknown }>, gelukt: string, sluit = true) => start(async () => {
        const r = await werk();
        if ('error' in r) { toast(r.error, 'error'); return; }
        toast(gelukt, 'success');
        if (sluit) setLade(null);
        router.refresh();
    });

    const kop = (
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 22 }}>
            <div>
                <Link href="/voorraad/winkel" className="kf-eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none', color: 'var(--muted)' }}>
                    <ArrowLeft size={12} /> Assortiment
                </Link>
                <h1 className="chassis-titel" style={{ margin: '4px 0 0' }}>Afdelingen indelen</h1>
                <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 4 }}>Welke afdelingen de winkel heeft en wat waar staat.</div>
            </div>
            {data?.ruimte && (
                <button type="button" className="btn btn-ghost" onClick={() => setLade({ soort: 'nieuwe-plek' })}><Plus size={14} /> Afdeling of meubel</button>
            )}
        </div>
    );
    const omhulsel = (inhoud: React.ReactNode) => (
        <div className="mobile-safe-bottom" style={{ padding: '20px var(--space-mobile-edge, 16px) 48px', maxWidth: 1040, margin: '0 auto' }}>{kop}{inhoud}</div>
    );

    if (!data) {
        return omhulsel(
            <div className="kf-empty"><p>De winkelvloer is er nog niet in de database. Eerst moet de update voor plekken in de winkel draaien (migratie 20261102120000).</p></div>,
        );
    }
    if (!data.ruimte) {
        return omhulsel(
            <motion.div initial={stil ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                style={{ ...kaart, padding: '28px 26px', display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ width: 64, height: 64, borderRadius: 18, display: 'grid', placeItems: 'center', background: 'rgba(196,163,90,.16)', color: 'var(--brand-gold, #c4a35a)', flexShrink: 0 }}>
                    <LayoutGrid size={30} />
                </div>
                <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display, Outfit)', fontSize: 24, fontWeight: 300 }}>De winkel heeft nog geen afdelingen</div>
                    <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 6 }}>Maak Bier, Wijn, Nootjes, Kazen, Vlees (slager) en Broodbeleg aan. Daarna zet je per afdeling de producten erin.</div>
                </div>
                <button type="button" className="btn btn-brand btn-touch" disabled={bezig} onClick={() => doe(richtWinkelIn, 'De afdelingen staan er.', false)}>
                    <Plus size={16} /> Afdelingen aanmaken
                </button>
            </motion.div>,
        );
    }
    return omhulsel(<Vloer data={data} bezig={bezig} lade={lade} setLade={setLade} doe={doe} />);
}

function Vloer({ data, bezig, lade, setLade, doe }: {
    data: VloerData; bezig: boolean; lade: Lade | null; setLade: (l: Lade | null) => void;
    doe: (werk: () => Promise<{ error: string } | { data: unknown }>, gelukt: string, sluit?: boolean) => void;
}) {
    const productOp = useMemo(() => new Map(data.producten.map((p) => [p.id, p])), [data.producten]);
    const plekOp = useMemo(() => new Map(data.plekken.map((p) => [p.id, p])), [data.plekken]);
    const plekken = useMemo(() => [...data.plekken].sort((a, b) => a.volgorde - b.volgorde || a.naam.localeCompare(b.naam, 'nl')), [data.plekken]);
    /* Alleen plaatsingen op de plekken onder de Winkel; de makerij-lades tellen niet mee. */
    const verkoop = useMemo(() => data.plaatsingen.filter((p) => p.rol === 'verkoop' && plekOp.has(p.locatie_id)), [data.plaatsingen, plekOp]);
    const plekVan = useMemo(() => new Map(verkoop.map((p) => [p.product_id, p])), [verkoop]);
    const nergens = data.producten.filter((p) => p.actief && !plekVan.has(p.id));

    const [uitgeklapt, setUitgeklapt] = useState<string | null>(null);
    const klap = (id: string) => setUitgeklapt((x) => (x === id ? null : id));

    const open = lade?.soort === 'product' ? productOp.get(lade.productId) : null;
    const openPlaatsing = open ? plekVan.get(open.id) : null;

    return (
        <>
            <div style={{ display: 'grid', gap: 8 }}>
                {plekken.map((plek) => {
                    const hier = verkoop.filter((p) => p.locatie_id === plek.id).sort((a, b) => a.volgorde - b.volgorde);
                    const isOpen = uitgeklapt === plek.id;
                    return (
                        <section key={plek.id} style={{ ...kaart, padding: '6px 10px 6px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <button type="button" aria-expanded={isOpen} onClick={() => klap(plek.id)}
                                    style={{ flex: 1, minWidth: 0, minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 0, padding: 0, color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                                    <ChevronDown size={15} style={{ color: 'var(--muted)', flexShrink: 0, transform: isOpen ? undefined : 'rotate(-90deg)', transition: 'transform .15s' }} />
                                    <span style={{ fontSize: 15, fontWeight: 500 }}>{plek.naam}</span>
                                    <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                                        {plek.soort !== 'afdeling' ? `${PLEK_SOORT_LABEL[plek.soort as PlekSoort] ?? plek.soort} · ` : ''}{hier.length} {hier.length === 1 ? 'product' : 'producten'}
                                    </span>
                                </button>
                                <button type="button" className="btn btn-ghost" style={{ padding: '4px 8px' }} aria-label={`${plek.naam} hernoemen`} onClick={() => setLade({ soort: 'hernoem', plekId: plek.id })}><Pencil size={13} /></button>
                                <button type="button" className="btn btn-ghost" aria-label={`Product bij ${plek.naam} zetten`} onClick={() => setLade({ soort: 'erbij', plekId: plek.id })}><Plus size={14} /> Product</button>
                            </div>
                            {isOpen && (hier.length === 0
                                ? <div style={{ fontSize: 13, color: 'var(--muted)', padding: '4px 0 10px 25px' }}>Nog leeg.</div>
                                : (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: 10, padding: '8px 4px 10px 0' }}>
                                        {hier.map((pl) => {
                                            const p = productOp.get(pl.product_id);
                                            return p ? <Tegel key={pl.id} p={p} onClick={() => setLade({ soort: 'product', productId: p.id })} /> : null;
                                        })}
                                    </div>
                                ))}
                        </section>
                    );
                })}

                {nergens.length > 0 && (
                    <section style={{ ...kaart, padding: '6px 14px', borderStyle: 'dashed' }}>
                        <button type="button" aria-expanded={uitgeklapt === 'nergens'} onClick={() => klap('nergens')}
                            style={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 0, padding: 0, color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                            <ChevronDown size={15} style={{ color: 'var(--muted)', flexShrink: 0, transform: uitgeklapt === 'nergens' ? undefined : 'rotate(-90deg)', transition: 'transform .15s' }} />
                            <span style={{ fontSize: 15, fontWeight: 500 }}>Staat nergens</span>
                            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{nergens.length} {nergens.length === 1 ? 'product' : 'producten'} zonder plek</span>
                        </button>
                        {uitgeklapt === 'nergens' && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: 10, padding: '8px 0 10px' }}>
                                {nergens.map((p) => <Tegel key={p.id} p={p} onClick={() => setLade({ soort: 'product', productId: p.id })} />)}
                            </div>
                        )}
                    </section>
                )}
            </div>

            {open && (
                <Drawer eyebrow="Product" title={open.naam} width={460} onClose={() => setLade(null)}
                    subtitle={openPlaatsing ? `Staat bij ${plekOp.get(openPlaatsing.locatie_id)?.naam ?? '—'}` : 'Staat nog nergens'}>
                    <div className="kf-eyebrow" style={{ marginBottom: 10 }}>{openPlaatsing ? 'Verplaatsen naar' : 'Zet bij'}</div>
                    <div style={{ display: 'grid', gap: 8 }}>
                        {plekken.filter((pl) => pl.id !== openPlaatsing?.locatie_id).map((pl) => (
                            <button key={pl.id} type="button" className="btn btn-ghost" style={{ justifyContent: 'flex-start' }} disabled={bezig}
                                onClick={() => doe(() => plaatsProduct({ productId: open.id, locatieId: pl.id }), `${open.naam} staat nu bij ${pl.naam}.`)}>
                                {pl.naam}
                            </button>
                        ))}
                    </div>
                    {openPlaatsing && (
                        <button type="button" className="btn btn-ghost" style={{ marginTop: 20, color: 'var(--red, #dc2626)' }} disabled={bezig}
                            onClick={() => doe(() => haalVanPlek({ plaatsingId: openPlaatsing.id }), `${open.naam} staat nergens meer.`)}>
                            Van deze plek halen
                        </button>
                    )}
                </Drawer>
            )}

            {lade?.soort === 'erbij' && plekOp.get(lade.plekId) && (
                <ErbijLade plek={plekOp.get(lade.plekId)!} producten={data.producten} plekVan={plekVan} plekOp={plekOp} bezig={bezig}
                    onClose={() => setLade(null)} onKies={(p) => doe(() => plaatsProduct({ productId: p.id, locatieId: lade.plekId }), `${p.naam} staat nu bij ${plekOp.get(lade.plekId)!.naam}.`, false)} />
            )}

            {lade?.soort === 'nieuwe-plek' && (
                <NaamLade titel="Nieuwe plek in de winkel" knop="Aanmaken" begin="" soortKiezen bezig={bezig} onClose={() => setLade(null)}
                    onBewaar={(naam, soort) => doe(() => maakPlek({ naam, soort, ouderId: data.ruimte!.id }), `${naam} staat erbij.`)} />
            )}

            {lade?.soort === 'hernoem' && plekOp.get(lade.plekId) && (
                <NaamLade titel="Plek hernoemen" knop="Bewaren" begin={plekOp.get(lade.plekId)!.naam} bezig={bezig} onClose={() => setLade(null)}
                    onBewaar={(naam) => doe(() => hernoemPlek({ id: lade.plekId, naam }), 'Bewaard.')} />
            )}
        </>
    );
}

function Tegel({ p, onClick }: { p: VloerProduct; onClick: () => void }) {
    const Icoon = TYPE_ICOON[p.type] ?? Package;
    return (
        <button type="button" onClick={onClick} style={{ ...kaart, padding: 0, overflow: 'hidden', textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', opacity: p.actief ? 1 : 0.55 }}>
            <div style={{ height: 96, position: 'relative', display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.03)', borderBottom: '1px solid var(--border)' }}>
                {p.foto
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={p.foto} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', padding: 6 }} />
                    : <Icoon size={26} style={{ color: 'var(--muted)' }} />}
            </div>
            <div style={{ padding: '8px 10px 10px', fontSize: 12.5, fontWeight: 600, lineHeight: 1.3, minHeight: 42, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {p.naam}{!p.actief && <span style={{ fontWeight: 400, color: 'var(--muted)' }}> · niet actief</span>}
            </div>
        </button>
    );
}

function ErbijLade({ plek, producten, plekVan, plekOp, bezig, onClose, onKies }: {
    plek: LivePlek; producten: VloerProduct[]; plekVan: Map<string, LivePlaatsing>; plekOp: Map<string, LivePlek>; bezig: boolean;
    onClose: () => void; onKies: (p: VloerProduct) => void;
}) {
    const [zoek, setZoek] = useState('');
    const z = zoek.trim().toLowerCase();
    const lijst = producten
        .filter((p) => plekVan.get(p.id)?.locatie_id !== plek.id)
        .filter((p) => !z || p.naam.toLowerCase().includes(z) || p.type.toLowerCase().includes(z))
        .sort((a, b) => Number(plekVan.has(a.id)) - Number(plekVan.has(b.id)) || Number(b.actief) - Number(a.actief) || a.naam.localeCompare(b.naam, 'nl'))
        .slice(0, 80);
    return (
        <Drawer eyebrow={plek.naam} title="Product erbij zetten" width={500} onClose={onClose}
            subtitle="Staat het al ergens anders, dan verhuist het hierheen.">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Search size={14} style={{ color: 'var(--muted)' }} />
                <input className="kf-input" autoFocus value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op naam of soort (bier, wijn, kaas)" style={{ flex: 1 }} />
            </label>
            <div style={{ display: 'grid', gap: 6 }}>
                {lijst.map((p) => {
                    const nu = plekVan.get(p.id);
                    return (
                        <button key={p.id} type="button" className="btn btn-ghost" disabled={bezig} onClick={() => onKies(p)}
                            style={{ justifyContent: 'space-between', textAlign: 'left', gap: 10 }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.naam}{!p.actief && <span style={{ color: 'var(--muted)' }}> · niet actief</span>}</span>
                            <span style={{ fontSize: 11.5, color: 'var(--muted)', flexShrink: 0 }}>{nu ? `nu bij ${plekOp.get(nu.locatie_id)?.naam ?? '—'}` : p.type}</span>
                        </button>
                    );
                })}
                {lijst.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)' }}>Niets gevonden.</div>}
            </div>
        </Drawer>
    );
}

function NaamLade({ titel, knop, begin, soortKiezen, bezig, onClose, onBewaar }: {
    titel: string; knop: string; begin: string; soortKiezen?: boolean; bezig: boolean; onClose: () => void; onBewaar: (naam: string, soort: PlekSoort) => void;
}) {
    const [naam, setNaam] = useState(begin);
    const [soort, setSoort] = useState<PlekSoort>('afdeling');
    const bewaar = () => { if (naam.trim()) onBewaar(naam.trim(), soort); };
    return (
        <Drawer title={titel} width={440} onClose={onClose}
            footer={<button type="button" className="btn btn-brand" disabled={bezig || !naam.trim()} onClick={bewaar}>{knop}</button>}>
            <label style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
                <span className="kf-eyebrow">Naam</span>
                <input className="kf-input" autoFocus value={naam} maxLength={60} onChange={(e) => setNaam(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') bewaar(); }} />
            </label>
            {soortKiezen && (
                <label style={{ display: 'grid', gap: 6 }}>
                    <span className="kf-eyebrow">Soort</span>
                    <select className="kf-input" value={soort} onChange={(e) => setSoort(e.target.value as PlekSoort)}>
                        {NIEUWE_SOORTEN.map((s) => <option key={s} value={s}>{PLEK_SOORT_LABEL[s]}</option>)}
                    </select>
                </label>
            )}
        </Drawer>
    );
}
