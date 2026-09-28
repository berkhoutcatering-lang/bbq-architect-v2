'use client';

/**
 * Winkelvoorraad (W2) — wat er in de winkel staat, wat besteld is, en hoeveel
 * pakketten er nog te maken zijn. Plan: docs/voorraad-bouwplan.md §3.
 *
 *   aanwezig      = de som van het logboek
 *   gereserveerd  = besteld en nog niet ingepakt
 *   beschikbaar   = aanwezig − gereserveerd (wat de webshop nog verkoopt)
 *
 * Elke verandering is een logboekregel: tellen, ontvangst, overboeken uit de
 * makerij of een afwijking met een reden. Het getal zelf is nergens in te
 * typen. "Niet bijgehouden" blijft zo tot de eerste telling.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeftRight, Beef, Beer, Carrot, ClipboardList, Cookie, Gift, Ham, Minus, Nut, Package, PackageCheck, PackagePlus, Salad, Settings2, Soup, Store, TriangleAlert, Wine } from 'lucide-react';
import '@/styles/menu-hub.css';
import Button from '@/components/Button';
import { useToast } from '@/components/Toast';
import VoorraadBel from '@/components/voorraad/VoorraadBel';
import Drawer from '@/app/verkoop/webshop/_components/Drawer';
import { formatEur } from '@/lib/format';
import type { Product, Slot } from '@/lib/winkel/rekenen';
import {
    AFWIJKINGSREDENEN, REDEN_LABEL, TYPE_LABEL, beperkendProduct, beschikbaar, geldendeDrempel, gereserveerd,
    hoeveelheidKort, pakkettenTeMaken, voorraadstatus, waardeCenten, type Afwijkingsreden, type Mutatietype, type Reden, type Voorraadstatus,
} from '@/lib/winkel/voorraad';
import { boekOver, laadLogboek, legAfwijkingVast, ontvangWinkelProduct, telWinkelProduct, zetDrempel, type LogboekRegel } from '../actions';

export interface WinkelProductRij extends Omit<Product, 'voorraad_bezet'> {
    voorraad_bezet?: number;
    drempel: number | null;
    bestel_hoeveelheid: number | null;
    ean: string | null;
    tht: string | null;
    laatste_beweging_at: string | null;
    inventory_id: number | null;
    foto_url: string | null;
}

export interface WinkelData {
    plekNaam: string;
    producten: WinkelProductRij[];
    slots: Slot[];
    artikelen: { id: string; naam: string; slug: string; actief: boolean; telt: string }[];
    keuken: { id: number; naam: string; unit: string | null; current_stock: number | null }[];
}

const STATUS_KLEUR: Record<Voorraadstatus, string> = {
    niet_bijgehouden: 'var(--muted)',
    tekort: 'var(--red, #dc2626)',
    op: 'var(--red, #dc2626)',
    laag: 'var(--brand-gold, #c4a35a)',
    ok: 'var(--green, #22c55e)',
};
const STATUS_LABEL: Record<Voorraadstatus, string> = {
    niet_bijgehouden: 'niet bijgehouden', tekort: 'tekort', op: 'op', laag: 'bijna op', ok: 'op voorraad',
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
const TYPE_LABEL_MV: Record<string, string> = {
    bier: 'Bier', wijn: 'Wijn', worst: 'Worst', vleeswaar: 'Vleeswaren', amandelen: 'Amandelen', crackers: 'Crackers', krokant: 'Krokant',
    marmelade: 'Marmelades', doos: 'Dozen', verpakking: 'Verpakking', kaas: 'Kaas', zuur: 'Zuur', overig: 'Overig',
};

type Filter = 'alles' | 'aandacht' | 'niet_geteld';

export default function WinkelVoorraadClient({ data, openProductId }: { data: WinkelData; openProductId: string | null }) {
    const router = useRouter();
    const stil = useReducedMotion();
    const [openId, setOpenId] = useState<string | null>(openProductId);
    const [filter, setFilter] = useState<Filter>('alles');
    useEffect(() => { setOpenId(openProductId); }, [openProductId]);

    const actief = useMemo(() => new Set(data.artikelen.filter((a) => a.actief).map((a) => a.id)), [data.artikelen]);
    const rijen = useMemo(() => data.producten.filter((p) => p.actief).map((p) => {
        const b = beschikbaar(p);
        const d = geldendeDrempel(p, data.slots, actief);
        return { p, b, drempel: d, status: voorraadstatus(b, d.waarde), waarde: p.voorraad == null ? null : waardeCenten(p, p.voorraad) };
    }), [data.producten, data.slots, actief]);

    const totaal = useMemo(() => {
        const bij = rijen.filter((r) => r.p.voorraad != null);
        return {
            waarde: bij.reduce((s, r) => s + (r.waarde ?? 0), 0),
            zonderPrijs: bij.filter((r) => r.waarde == null).length,
            geteld: bij.length,
            aandacht: rijen.filter((r) => r.status === 'laag' || r.status === 'op' || r.status === 'tekort').length,
        };
    }, [rijen]);
    const nietsGeteld = totaal.geteld === 0;

    const zichtbaar = rijen.filter((r) => filter === 'alles'
        || (filter === 'aandacht' && (r.status === 'laag' || r.status === 'op' || r.status === 'tekort'))
        || (filter === 'niet_geteld' && r.status === 'niet_bijgehouden'));
    const perType = useMemo(() => {
        const m = new Map<string, typeof zichtbaar>();
        for (const r of zichtbaar) m.set(r.p.type, [...(m.get(r.p.type) ?? []), r]);
        return [...m.entries()];
    }, [zichtbaar]);

    const pakketten = useMemo(() => data.artikelen
        .filter((a) => a.actief && data.slots.some((s) => s.artikel_id === a.id))
        .map((a) => ({ a, n: pakkettenTeMaken(a.id, data.slots, data.producten), door: beperkendProduct(a.id, data.slots, data.producten) }))
        .sort((x, y) => (x.n ?? 1e9) - (y.n ?? 1e9)),
    [data.artikelen, data.slots, data.producten]);
    const maxPakket = Math.max(1, ...pakketten.map((x) => x.n ?? 0));

    const open = openId ? data.producten.find((p) => p.id === openId) ?? null : null;
    const sluit = useCallback(() => { setOpenId(null); router.replace('/voorraad/winkel', { scroll: false }); }, [router]);

    return (
        <div className="mobile-safe-bottom" style={{ padding: '20px var(--space-mobile-edge, 16px) 48px', maxWidth: 1180, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                    <h1 className="chassis-titel" style={{ margin: 0 }}>{data.plekNaam}</h1>
                    <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0', lineHeight: 1.5 }}>
                        Wat er staat, wat besteld is en wat de webshop nog kan verkopen.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <VoorraadBel />
                    <Link href="/voorraad/ontvangst" className="btn btn-ghost"><PackagePlus size={14} /> Ontvangst</Link>
                    <Link href="/voorraad/afwijking" className="btn btn-ghost"><Minus size={14} /> Afwijking</Link>
                    {!nietsGeteld && <Link href="/voorraad/winkel/tellen" className="btn btn-brand"><ClipboardList size={14} /> Tellen</Link>}
                </div>
            </div>

            {nietsGeteld ? (
                <motion.div initial={stil ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    style={{ ...kaart, padding: '28px 26px', marginBottom: 26, display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap',
                        background: 'radial-gradient(120% 140% at 0% 0%, rgba(196,163,90,.16), transparent 60%), var(--color-bg-elevated)' }}>
                    <div style={{ width: 64, height: 64, borderRadius: 18, display: 'grid', placeItems: 'center', background: 'rgba(196,163,90,.16)', color: 'var(--brand-gold, #c4a35a)', flexShrink: 0 }}>
                        <Store size={30} />
                    </div>
                    <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--font-display, Outfit)', fontSize: 24, fontWeight: 300, lineHeight: 1.2 }}>Je winkel is nog niet geteld</div>
                        <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 6, lineHeight: 1.55 }}>
                            Loop met je telefoon langs de schappen: {data.producten.filter((p) => p.actief).length} producten, ongeveer een kwartier.
                            Daarna zie je hier per schap wat er staat, wat bijna op is en hoeveel pakketten je nog kunt maken.
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                        <Link href="/voorraad/winkel/tellen" className="btn btn-brand btn-touch" style={{ justifyContent: 'center', minWidth: 200 }}><ClipboardList size={16} /> Winkel tellen</Link>
                        <Link href="/voorraad/ontvangst" className="btn btn-ghost" style={{ justifyContent: 'center' }}><PackagePlus size={14} /> Of begin met een levering</Link>
                    </div>
                </motion.div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
                    <Stat label="Geteld" waarde={`${totaal.geteld} / ${rijen.length}`} balk={totaal.geteld / Math.max(1, rijen.length)}
                        onder={totaal.geteld < rijen.length ? 'Tik om de rest te tellen' : 'Alles wordt bijgehouden'} onClick={totaal.geteld < rijen.length ? () => setFilter('niet_geteld') : undefined} />
                    <Stat label="In de winkel (inkoop)" waarde={eur(totaal.waarde)} onder={totaal.zonderPrijs ? `${totaal.zonderPrijs} zonder inkoopprijs telt niet mee` : undefined} />
                    <Stat label="Bijna op of op" waarde={String(totaal.aandacht)} kleur={totaal.aandacht ? 'var(--brand-gold, #c4a35a)' : 'var(--green, #22c55e)'}
                        onder={totaal.aandacht ? 'Tik om ze te zien' : 'Niets om je zorgen over te maken'} onClick={totaal.aandacht ? () => setFilter('aandacht') : undefined} />
                </div>
            )}

            {pakketten.length > 0 && !nietsGeteld && (
                <section style={{ marginBottom: 28 }}>
                    <div className="kf-eyebrow" style={{ marginBottom: 10 }}>Nog te maken</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
                        {pakketten.map(({ a, n, door }, i) => {
                            const kleur = n == null ? 'var(--muted)' : n === 0 ? 'var(--red, #dc2626)' : n <= 5 ? 'var(--brand-gold, #c4a35a)' : 'var(--green, #22c55e)';
                            return (
                                <motion.div key={a.id} initial={stil ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.3) }}
                                    style={{ ...kaart, padding: 16, borderColor: n === 0 ? 'rgba(220,38,38,.45)' : 'var(--border)' }}>
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
                                </motion.div>
                            );
                        })}
                    </div>
                </section>
            )}

            {data.producten.length === 0 && (
                <div className="kf-empty"><p>Nog geen winkelproducten. Je maakt ze aan in <Link href="/verkoop/webshop#producten" style={{ color: 'var(--brand)' }}>Webshop → Producten</Link>; daarna tel je ze hier.</p></div>
            )}

            {!nietsGeteld && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                    {([['alles', `Alles · ${rijen.length}`], ['aandacht', `Bijna op · ${totaal.aandacht}`], ['niet_geteld', `Niet geteld · ${rijen.length - totaal.geteld}`]] as const).map(([f, label]) => (
                        <button key={f} type="button" className={`kf-chip${filter === f ? ' is-on' : ''}`} onClick={() => setFilter(f)}>{label}</button>
                    ))}
                </div>
            )}

            {/* Eén doorlopend raster, gesorteerd op schap; het schap staat op de tegel. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: 10 }}>
                {perType.flatMap(([type, lijst]) => lijst.map(({ p, b, drempel, status }, i) => (
                    <Tegel key={p.id} p={p} b={b} drempel={drempel.waarde} status={status} Icoon={TYPE_ICOON[type] ?? Package} schap={TYPE_LABEL_MV[type] ?? type}
                        stil={!!stil} vertraging={Math.min(i * 0.02, 0.3)} onClick={() => setOpenId(p.id)} />
                )))}
            </div>
            {!nietsGeteld && zichtbaar.length === 0 && <div className="kf-empty"><p>Niets in deze selectie.</p></div>}

            {open && <ProductDrawer key={open.id} p={open} data={data} actief={actief} onClose={sluit} />}
        </div>
    );
}

function Balk({ deel, kleur, stil, grens }: { deel: number; kleur: string; stil: boolean; grens?: number | null }) {
    const w = `${Math.max(0, Math.min(1, deel)) * 100}%`;
    return (
        <div style={{ position: 'relative', height: 6, borderRadius: 3, background: 'rgba(255,255,255,.07)', marginTop: 10, overflow: 'hidden' }}>
            <motion.div initial={stil ? false : { width: 0 }} animate={{ width: w }} transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
                style={{ position: 'absolute', inset: '0 auto 0 0', width: w, background: kleur, borderRadius: 3 }} />
            {grens != null && grens > 0 && grens < 1 && (
                <div title="bijna-op-grens" style={{ position: 'absolute', top: -2, bottom: -2, left: `${grens * 100}%`, width: 2, background: 'var(--text)', opacity: 0.35 }} />
            )}
        </div>
    );
}

function Tegel({ p, b, drempel, status, Icoon, schap, stil, vertraging, onClick }: {
    p: WinkelProductRij; b: number | null; drempel: number | null; status: Voorraadstatus; Icoon: typeof Beer; schap: string; stil: boolean; vertraging: number; onClick: () => void;
}) {
    const geteld = p.voorraad != null;
    /* Schaal: twee keer de grens, of wat er ligt als dat meer is. De streep is de grens. */
    const schaal = Math.max(1, (drempel ?? 0) * 2, p.voorraad ?? 0);
    const kleur = STATUS_KLEUR[status];
    return (
        <motion.button type="button" onClick={onClick}
            initial={stil ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: vertraging }}
            whileHover={stil ? undefined : { y: -2 }}
            style={{
                ...kaart, padding: 0, overflow: 'hidden', textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column',
                borderStyle: geteld ? 'solid' : 'dashed', borderColor: status === 'op' || status === 'tekort' ? 'rgba(220,38,38,.5)' : status === 'laag' ? 'rgba(196,163,90,.5)' : 'var(--border)',
            }}>
            <div style={{ height: 64, position: 'relative', display: 'grid', placeItems: 'center', background: geteld ? 'rgba(255,255,255,.03)' : 'transparent', borderBottom: '1px solid var(--border)' }}>
                {p.foto_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={p.foto_url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: geteld ? 1 : 0.45 }} />
                    : <Icoon size={28} style={{ color: geteld ? kleur : 'var(--muted)', opacity: geteld ? 0.9 : 0.5 }} />}
                <span style={{ position: 'absolute', top: 8, left: 9, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                    <Icoon size={10} />{schap}
                </span>
                {geteld && status !== 'ok' && (
                    <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', padding: '3px 7px', borderRadius: 999, background: 'rgba(0,0,0,.55)', color: kleur }}>
                        {STATUS_LABEL[status]}
                    </span>
                )}
            </div>
            <div style={{ padding: '10px 12px 12px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, minHeight: 34, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.naam}</div>
                {geteld ? (
                    <>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                            <span style={{ fontFamily: 'var(--font-display, Outfit)', fontSize: 22, fontWeight: 300, fontVariantNumeric: 'tabular-nums', color: status === 'ok' ? 'var(--text)' : kleur }}>{hoeveelheidKort(b ?? 0, p.eenheid)}</span>
                            <span style={{ fontSize: 11, color: 'var(--muted)' }}>vrij</span>
                        </div>
                        <Balk deel={Math.max(0, b ?? 0) / schaal} kleur={kleur} stil={stil} grens={drempel != null ? drempel / schaal : null} />
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 7 }}>
                            {hoeveelheidKort(p.voorraad ?? 0, p.eenheid)} staat{gereserveerd(p) ? ` · ${hoeveelheidKort(gereserveerd(p), p.eenheid)} besteld` : ''}{p.tht ? ` · THT ${thtTekst(p.tht)}` : ''}
                        </div>
                    </>
                ) : (
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>Nog niet geteld</div>
                )}
            </div>
        </motion.button>
    );
}

function Stat({ label, waarde, onder, kleur, balk, onClick }: { label: string; waarde: string; onder?: string; kleur?: string; balk?: number; onClick?: () => void }) {
    const Tag = onClick ? 'button' : 'div';
    return (
        <Tag type={onClick ? 'button' : undefined} onClick={onClick}
            style={{ ...kaart, padding: '14px 16px', textAlign: 'left', cursor: onClick ? 'pointer' : 'default', font: 'inherit' }}>
            <div style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 600 }}>{label}</div>
            <div style={{ fontFamily: 'var(--font-display, Outfit)', fontSize: 26, fontWeight: 300, color: kleur ?? 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.25 }}>{waarde}</div>
            {balk != null && <Balk deel={balk} kleur="var(--brand-gold, #c4a35a)" stil={false} />}
            {onder && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>{onder}</div>}
        </Tag>
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
    const [notitie, setNotitie] = useState('');
    const keukenItem = data.keuken.find((k) => k.id === keukenId) ?? null;

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
            const dr = leesGetal(drempel); const be = leesGetal(bestel);
            if (Number.isNaN(dr) || Number.isNaN(be)) { toast('Dat is geen geldig getal.', 'error'); return; }
            await doe(() => zetDrempel({ productId: p.id, drempel: dr, bestel_hoeveelheid: be, ean: ean.trim() || null }), 'Opgeslagen');
        }
        setAantal(''); setNotitie(''); setReden(null);
    }

    const acties: { k: Actie; label: string; icon: typeof PackagePlus; kan: boolean }[] = [
        { k: 'ontvangst', label: 'Ontvangst', icon: PackagePlus, kan: p.voorraad != null },
        { k: 'overboeken', label: 'Makerij', icon: ArrowLeftRight, kan: p.voorraad != null },
        { k: 'tellen', label: 'Tellen', icon: ClipboardList, kan: true },
        { k: 'afwijking', label: 'Afwijking', icon: TriangleAlert, kan: p.voorraad != null },
        { k: 'instellen', label: 'Grens', icon: Settings2, kan: true },
    ];

    return (
        <Drawer eyebrow={`${p.type}${p.alcohol ? ' · 18+' : ''}`} title={p.naam} subtitle={p.voorraad == null ? 'Nog niet bijgehouden: tel het eerst' : `Laatste verkoop of verbruik: ${p.laatste_beweging_at ? new Date(p.laatste_beweging_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : 'nog niet'}`} onClose={onClose} width={580}
            footer={<><Button icon={<PackageCheck size={14} />} loading={bezig} onClick={verstuur}>{actie === 'instellen' ? 'Opslaan' : 'Vastleggen'}</Button><Button variant="ghost" onClick={onClose}>Sluiten</Button></>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    <Mini label="Aanwezig" waarde={p.voorraad == null ? '—' : hoeveelheidKort(p.voorraad, p.eenheid)} />
                    <Mini label="Besteld" waarde={p.voorraad == null ? '—' : hoeveelheidKort(gereserveerd(p), p.eenheid)} />
                    <Mini label="Beschikbaar" waarde={b == null ? '—' : hoeveelheidKort(b, p.eenheid)} />
                    <Mini label={d.bron === 'voorstel' ? 'Grens (voorstel)' : 'Grens'} waarde={d.waarde == null ? '—' : hoeveelheidKort(d.waarde, p.eenheid)} />
                </div>

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

                {actie === 'instellen' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div className="kf-field">
                            <label className="kf-label">Bijna-op-grens ({eenheid})</label>
                            <input className="kf-input" inputMode="decimal" value={drempel} onChange={(e) => setDrempel(e.target.value)} placeholder={d.bron === 'voorstel' && d.waarde != null ? `voorstel ${d.waarde}` : 'geen grens'} />
                            <div className="kf-help">Leeg = het voorstel: genoeg voor 5 pakketten.</div>
                        </div>
                        <div className="kf-field">
                            <label className="kf-label">Bestelhoeveelheid ({eenheid})</label>
                            <input className="kf-input" inputMode="decimal" value={bestel} onChange={(e) => setBestel(e.target.value)} placeholder="bijv. een doos van 24" />
                        </div>
                        <div className="kf-field" style={{ gridColumn: '1 / -1' }}>
                            <label className="kf-label">EAN (voor de kassa)</label>
                            <input className="kf-input" inputMode="numeric" value={ean} onChange={(e) => setEan(e.target.value)} placeholder="nog leeg" />
                        </div>
                    </div>
                )}

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
