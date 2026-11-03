'use client';

/**
 * Eén afdeling: per product hoe vaak het verkocht is (7 en 28 dagen), de
 * omzet, wat er ligt en de stuks met hun THT. Eén primaire knop "Product
 * toevoegen" (rechter-lade: een bestaand product hierheen, of een nieuw
 * product per stuk of op gewicht). Per product: uit het assortiment of terug,
 * en verplaatsen naar een andere afdeling.
 */
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, CalendarClock, EyeOff, MapPin, MoreHorizontal, Package, Plus, RotateCcw, Scale, Search, Tag } from 'lucide-react';
import '@/styles/menu-hub.css';
import { useToast } from '@/components/Toast';
import Drawer from '@/app/verkoop/webshop/_components/Drawer';
import { formatEur, formatNumber } from '@/lib/format';
import type { Afdeling, ProductCijfers, StukRij, Urgentie, WinkelProductRij } from '@/lib/winkel/afdelingen';
import type { PartijRij } from '@/lib/winkel/winkelOverzicht';
import { nieuwProduct, zetInAssortiment, zetProductOpAfdeling } from '../actions';

export interface AfdelingProduct extends WinkelProductRij {
    cijfers: ProductCijfers;
    artikel: { naam: string; prijs_cents: number | null; verkoop_per: 'stuk' | 'kg'; kiloprijs_cents: number | null; sticker_plu: number | null; opToonbank: boolean } | null;
    stuks: (StukRij & { urgentie: Urgentie })[];
    partijen: PartijRij[];
}

const kaart: React.CSSProperties = { background: 'var(--color-bg-elevated)', border: '1px solid var(--border)', borderRadius: 14, color: 'var(--text)' };
const euro = (cents: number) => formatEur(cents / 100);
const datumKort = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Amsterdam' });
const KLEUR: Record<Urgentie, string> = { over: 'var(--red, #dc2626)', vandaag: 'var(--red, #dc2626)', morgen: '#D9A520', bijna: '#D9A520', later: 'var(--muted)' };

function voorraadTekst(p: WinkelProductRij): string {
    if (p.voorraad == null) return 'niet bijgehouden';
    if (p.eenheid === 'gram') return p.voorraad >= 1000 ? `${formatNumber(p.voorraad / 1000, 2)} kg` : `${formatNumber(p.voorraad)} g`;
    return `${formatNumber(p.voorraad)} st.`;
}

type Lade = { soort: 'toevoegen' } | { soort: 'product'; id: string };

export default function AfdelingClient({ afdeling, afdelingen, producten, elders, leveranciers, stuksOntbreken }: {
    afdeling: Afdeling;
    afdelingen: Afdeling[];
    producten: AfdelingProduct[];
    elders: { id: string; naam: string; type: string; actief: boolean; afdeling: string | null }[];
    leveranciers: { id: number; naam: string }[];
    stuksOntbreken: boolean;
}) {
    const router = useRouter();
    const toast = useToast();
    const stil = useReducedMotion();
    const [lade, setLade] = useState<Lade | null>(null);
    const [bezig, start] = useTransition();
    const [toonUit, setToonUit] = useState(false);

    const doe = (werk: () => Promise<{ error: string } | { data: unknown }>, gelukt: string, sluit = true) => start(async () => {
        const r = await werk();
        if ('error' in r) { toast(r.error, 'error'); return; }
        toast(gelukt, 'success');
        if (sluit) setLade(null);
        router.refresh();
    });

    const actief = producten.filter((p) => p.actief);
    const uit = producten.filter((p) => !p.actief);
    const gesorteerd = useMemo(() => [...actief].sort((a, b) => b.cijfers.omzet28_cents - a.cijfers.omzet28_cents || a.naam.localeCompare(b.naam, 'nl')), [actief]);
    const open = lade?.soort === 'product' ? producten.find((p) => p.id === lade.id) ?? null : null;
    const omzet28 = actief.reduce((s, p) => s + p.cijfers.omzet28_cents, 0);

    return (
        <div className="mobile-safe-bottom" style={{ padding: '20px var(--space-mobile-edge, 16px) 48px', maxWidth: 1180, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                <div>
                    <Link href="/winkel" className="kf-eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none', color: 'var(--muted)' }}>
                        <ArrowLeft size={12} /> Afdelingen
                    </Link>
                    <h1 className="chassis-titel" style={{ margin: '4px 0 0' }}>{afdeling.naam}</h1>
                    <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 4 }}>
                        {actief.length} {actief.length === 1 ? 'product' : 'producten'} · laatste 4 weken {euro(omzet28)} aan de toonbank
                    </div>
                </div>
                <button type="button" className="btn btn-brand btn-touch" onClick={() => setLade({ soort: 'toevoegen' })}><Plus size={16} /> Product toevoegen</button>
            </div>

            {gesorteerd.length === 0 ? (
                <div className="kf-empty"><p>Nog niets op deze afdeling. Voeg een product toe.</p></div>
            ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                    {gesorteerd.map((p, i) => <ProductRij key={p.id} p={p} i={i} stil={!!stil} onOpen={() => setLade({ soort: 'product', id: p.id })} />)}
                </div>
            )}

            {uit.length > 0 && (
                <div style={{ marginTop: 22 }}>
                    <button type="button" className="btn btn-ghost" onClick={() => setToonUit((x) => !x)}>
                        <EyeOff size={14} /> {uit.length} uit het assortiment {toonUit ? 'verbergen' : 'tonen'}
                    </button>
                    {toonUit && (
                        <div style={{ display: 'grid', gap: 8, marginTop: 10, opacity: 0.75 }}>
                            {uit.map((p, i) => <ProductRij key={p.id} p={p} i={i} stil onOpen={() => setLade({ soort: 'product', id: p.id })} />)}
                        </div>
                    )}
                </div>
            )}

            {stuksOntbreken && (
                <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 18 }}>Datums per bakje verschijnen zodra de update voor stickers draait (migratie 20261103120000).</p>
            )}

            {open && (
                <Drawer eyebrow={afdeling.naam} title={open.naam} width={500} onClose={() => setLade(null)}
                    subtitle={open.actief ? (open.artikel?.opToonbank ? 'Te koop aan de toonbank' : 'Niet op de toonbank') : 'Uit het assortiment'}>
                    <ProductDetail p={open} afdelingen={afdelingen} huidige={afdeling.id} bezig={bezig}
                        onUit={() => doe(() => zetInAssortiment({ productId: open.id, actief: !open.actief, afdelingId: afdeling.id }),
                            open.actief ? `${open.naam} is uit het assortiment. De geschiedenis blijft.` : `${open.naam} is terug in het assortiment.`)}
                        onVerplaats={(afd) => doe(() => zetProductOpAfdeling({ productId: open.id, afdelingId: afd.id }), `${open.naam} staat nu bij ${afd.naam}.`)} />
                </Drawer>
            )}

            {lade?.soort === 'toevoegen' && (
                <ToevoegenLade afdeling={afdeling} elders={elders} leveranciers={leveranciers} bezig={bezig} onClose={() => setLade(null)}
                    onBestaand={(p) => doe(() => zetProductOpAfdeling({ productId: p.id, afdelingId: afdeling.id }), `${p.naam} staat nu bij ${afdeling.naam}.`)}
                    onNieuw={(v) => doe(async () => {
                        const r = await nieuwProduct({ ...v, afdelingId: afdeling.id });
                        return r;
                    }, `${v.naam} staat erbij${v.verkoop_per === 'kg' ? ' en kan gestickerd worden' : ''}.`)} />
            )}
        </div>
    );
}

function ProductRij({ p, i, stil, onOpen }: { p: AfdelingProduct; i: number; stil: boolean; onOpen: () => void }) {
    const urgent = p.stuks.filter((s) => s.urgentie !== 'later');
    const over = urgent.filter((s) => s.urgentie === 'over').length;
    const kg = p.artikel?.verkoop_per === 'kg';
    return (
        <motion.button type="button" onClick={onOpen} initial={stil ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}
            style={{ ...kaart, padding: '12px 14px', display: 'grid', gridTemplateColumns: '52px minmax(0,1fr) auto', gap: 14, alignItems: 'center', textAlign: 'left', cursor: 'pointer', width: '100%' }}>
            <div style={{ width: 52, height: 52, borderRadius: 12, background: 'rgba(255,255,255,.04)', display: 'grid', placeItems: 'center', overflow: 'hidden', position: 'relative' }}>
                {p.foto
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={p.foto} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }} />
                    : kg ? <Scale size={22} style={{ color: 'var(--muted)' }} /> : <Package size={22} style={{ color: 'var(--muted)' }} />}
            </div>
            <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.naam}</div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <span>{p.cijfers.verkocht7} verkocht deze week · {p.cijfers.verkocht28} in 4 weken</span>
                    <span>ligt er: {kg && p.stuks.length ? `${p.stuks.length} ${p.stuks.length === 1 ? 'bakje' : 'bakjes'}` : voorraadTekst(p)}</span>
                    {p.artikel?.prijs_cents != null && <span>{euro(p.artikel.prijs_cents)}{kg ? ' per kg' : ''}</span>}
                </div>
                {urgent.length > 0 && (
                    <div style={{ fontSize: 12.5, marginTop: 4, display: 'flex', alignItems: 'center', gap: 5, color: over ? KLEUR.over : KLEUR.bijna }}>
                        <CalendarClock size={13} /> {urgent.length} {urgent.length === 1 ? 'stuk' : 'stuks'} {over ? 'over de datum' : `THT ${datumKort(urgent[0]!.tht)}`}
                    </div>
                )}
            </div>
            <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-display, Outfit)', fontSize: 19, fontWeight: 300 }}>{euro(p.cijfers.omzet28_cents)}</div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>4 weken</div>
            </div>
        </motion.button>
    );
}

function ProductDetail({ p, afdelingen, huidige, bezig, onUit, onVerplaats }: {
    p: AfdelingProduct; afdelingen: Afdeling[]; huidige: string; bezig: boolean; onUit: () => void; onVerplaats: (a: Afdeling) => void;
}) {
    const [verplaatsen, setVerplaatsen] = useState(false);
    const kg = p.artikel?.verkoop_per === 'kg';
    const vak = (label: string, waarde: string) => (
        <div style={{ ...kaart, padding: '10px 12px' }}>
            <div className="kf-eyebrow" style={{ fontSize: 10.5 }}>{label}</div>
            <div style={{ fontFamily: 'var(--font-display, Outfit)', fontSize: 20, fontWeight: 300, marginTop: 2 }}>{waarde}</div>
        </div>
    );
    return (
        <div style={{ display: 'grid', gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                {vak('Verkocht deze week', formatNumber(p.cijfers.verkocht7))}
                {vak('Verkocht 4 weken', formatNumber(p.cijfers.verkocht28))}
                {vak('Omzet deze week', euro(p.cijfers.omzet7_cents))}
                {vak('Omzet 4 weken', euro(p.cijfers.omzet28_cents))}
                {vak('Ligt er', kg && p.stuks.length ? `${p.stuks.length} bakjes` : voorraadTekst(p))}
                {vak('Laatst verkocht', p.cijfers.laatsteVerkoop ? datumKort(p.cijfers.laatsteVerkoop) : '—')}
            </div>

            {p.artikel && (
                <div style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Tag size={13} /> {p.artikel.prijs_cents != null ? `${euro(p.artikel.prijs_cents)}${kg ? ' per kg' : ' per stuk'}` : 'geen prijs'}
                    {kg && p.artikel.sticker_plu != null && <> · stickernummer {p.artikel.sticker_plu}</>}
                </div>
            )}

            {p.stuks.length > 0 && (
                <div>
                    <div className="kf-eyebrow" style={{ marginBottom: 8 }}>Gestickerd en in de winkel</div>
                    <div style={{ display: 'grid', gap: 6 }}>
                        {p.stuks.map((s) => (
                            <div key={s.id} style={{ ...kaart, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
                                <span>{formatNumber(s.gewicht_g)} g · {euro(s.prijs_cents)}</span>
                                <span style={{ color: KLEUR[s.urgentie], fontWeight: s.urgentie === 'later' ? 400 : 600 }}>THT {datumKort(s.tht)}</span>
                            </div>
                        ))}
                    </div>
                    <Link href="/winkel/datums" style={{ fontSize: 12.5, color: 'var(--brand-gold, #c4a35a)', display: 'inline-block', marginTop: 8 }}>Naar de keuken of weggooien → Datums</Link>
                </div>
            )}

            {p.partijen.length > 0 && (
                <div>
                    <div className="kf-eyebrow" style={{ marginBottom: 8 }}>Open leveringen</div>
                    <div style={{ display: 'grid', gap: 6 }}>
                        {p.partijen.map((x) => (
                            <div key={x.id} style={{ fontSize: 13, color: 'var(--muted)' }}>
                                {x.leverancier ?? 'Levering'} van {datumKort(x.geleverd_op)}{x.productiedatum ? ` · gemaakt ${datumKort(x.productiedatum)}` : ''} · THT {datumKort(x.tht)}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div style={{ display: 'grid', gap: 8 }}>
                <button type="button" className="btn btn-ghost" style={{ justifyContent: 'flex-start' }} onClick={() => setVerplaatsen((x) => !x)}>
                    <MapPin size={14} /> Naar een andere afdeling
                </button>
                {verplaatsen && (
                    <div style={{ display: 'grid', gap: 6, paddingLeft: 12 }}>
                        {afdelingen.filter((a) => a.id !== huidige).map((a) => (
                            <button key={a.id} type="button" className="btn btn-ghost" style={{ justifyContent: 'flex-start' }} disabled={bezig} onClick={() => onVerplaats(a)}>{a.naam}</button>
                        ))}
                    </div>
                )}
                <Link href={`/voorraad/winkel?product=${p.id}`} className="btn btn-ghost" style={{ justifyContent: 'flex-start', textDecoration: 'none' }}>
                    <MoreHorizontal size={14} /> Voorraad tellen of bijbestellen
                </Link>
                <button type="button" className="btn btn-ghost" style={{ justifyContent: 'flex-start', color: p.actief ? 'var(--red, #dc2626)' : undefined }} disabled={bezig} onClick={onUit}>
                    {p.actief ? <><EyeOff size={14} /> Uit het assortiment</> : <><RotateCcw size={14} /> Terug in het assortiment</>}
                </button>
                {p.actief && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Uit het assortiment = niet meer te koop op de toonbank en de webshop. De verkoopgeschiedenis blijft, terugzetten kan altijd.</div>}
            </div>
        </div>
    );
}

interface NieuwInvoer {
    naam: string;
    type: string;
    verkoop_per: 'stuk' | 'kg';
    prijs_cents: number;
    btw_pct: 0 | 9 | 21;
    ean: string | null;
    leverancier_id: number | null;
    binnen_per_sticker: boolean;
    bewaren: string | null;
    beschermende_atmosfeer: boolean;
    houdbaar_dagen: number | null;
}

/** "12,95" of "12.95" → 1295; leeg of onzin → null. */
function centen(tekst: string): number | null {
    const t = tekst.trim().replace(/\s|€/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

function ToevoegenLade({ afdeling, elders, leveranciers, bezig, onClose, onBestaand, onNieuw }: {
    afdeling: Afdeling;
    elders: { id: string; naam: string; type: string; actief: boolean; afdeling: string | null }[];
    leveranciers: { id: number; naam: string }[];
    bezig: boolean;
    onClose: () => void;
    onBestaand: (p: { id: string; naam: string }) => void;
    onNieuw: (v: NieuwInvoer) => void;
}) {
    const [modus, setModus] = useState<'zoek' | 'nieuw'>('zoek');
    const [zoek, setZoek] = useState('');
    const vlees = /vlees|slager/i.test(afdeling.naam);
    const kaas = /kaas|kazen/i.test(afdeling.naam);
    const [v, setV] = useState({
        naam: '', type: vlees ? 'vleeswaar' : kaas ? 'kaas' : 'overig', verkoop_per: (vlees || kaas ? 'kg' : 'stuk') as 'stuk' | 'kg',
        prijs: '', btw_pct: 9 as 0 | 9 | 21, ean: '', leverancier_id: '' as string, binnen_per_sticker: vlees,
        bewaren: vlees || kaas ? 'Gekoeld bewaren (max. 7 °C)' : '', beschermende_atmosfeer: vlees, houdbaar_dagen: kaas ? '14' : '',
    });
    const z = zoek.trim().toLowerCase();
    const lijst = elders.filter((p) => !z || p.naam.toLowerCase().includes(z) || p.type.includes(z))
        .sort((a, b) => Number(b.actief) - Number(a.actief) || a.naam.localeCompare(b.naam, 'nl')).slice(0, 60);
    const prijs = centen(v.prijs);
    const kg = v.verkoop_per === 'kg';
    const klaar = v.naam.trim().length > 0 && prijs != null && (kg || !v.ean || /^\d{8,14}$/.test(v.ean.trim()));

    const bewaar = () => {
        if (!klaar || prijs == null) return;
        onNieuw({
            naam: v.naam.trim(), type: v.type, verkoop_per: v.verkoop_per, prijs_cents: prijs, btw_pct: v.btw_pct,
            ean: !kg && v.ean.trim() ? v.ean.trim() : null, leverancier_id: v.leverancier_id ? Number(v.leverancier_id) : null,
            binnen_per_sticker: kg && v.binnen_per_sticker, bewaren: kg && v.bewaren.trim() ? v.bewaren.trim() : null,
            beschermende_atmosfeer: kg && v.beschermende_atmosfeer, houdbaar_dagen: kg && v.houdbaar_dagen ? Number(v.houdbaar_dagen) : null,
        });
    };

    return (
        <Drawer eyebrow={afdeling.naam} title="Product toevoegen" width={520} onClose={onClose}
            footer={modus === 'nieuw' ? <button type="button" className="btn btn-brand" disabled={bezig || !klaar} onClick={bewaar}>Toevoegen</button> : undefined}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                <button type="button" className={modus === 'zoek' ? 'btn btn-brand' : 'btn btn-ghost'} onClick={() => setModus('zoek')}><Search size={14} /> Bestaand product</button>
                <button type="button" className={modus === 'nieuw' ? 'btn btn-brand' : 'btn btn-ghost'} onClick={() => setModus('nieuw')}><Plus size={14} /> Nieuw product</button>
            </div>

            {modus === 'zoek' ? (
                <>
                    <input className="kf-input" autoFocus value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op naam of soort" style={{ width: '100%', marginBottom: 12 }} />
                    <div style={{ display: 'grid', gap: 6 }}>
                        {lijst.map((p) => (
                            <button key={p.id} type="button" className="btn btn-ghost" disabled={bezig} onClick={() => onBestaand(p)} style={{ justifyContent: 'space-between', textAlign: 'left', gap: 10 }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.naam}{!p.actief && <span style={{ color: 'var(--muted)' }}> · uit</span>}</span>
                                <span style={{ fontSize: 11.5, color: 'var(--muted)', flexShrink: 0 }}>{p.afdeling ? `nu bij ${p.afdeling}` : p.type}</span>
                            </button>
                        ))}
                        {lijst.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)' }}>Niets gevonden. Maak het als nieuw product aan.</div>}
                    </div>
                </>
            ) : (
                <div style={{ display: 'grid', gap: 14 }}>
                    <label style={{ display: 'grid', gap: 6 }}>
                        <span className="kf-eyebrow">Naam (zoals op de sticker en de kassa)</span>
                        <input className="kf-input" autoFocus value={v.naam} maxLength={120} onChange={(e) => setV({ ...v, naam: e.target.value })} placeholder={vlees ? 'Nagelhout (gesneden)' : ''} />
                    </label>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" className={!kg ? 'btn btn-brand' : 'btn btn-ghost'} onClick={() => setV({ ...v, verkoop_per: 'stuk' })}><Package size={14} /> Per stuk</button>
                        <button type="button" className={kg ? 'btn btn-brand' : 'btn btn-ghost'} onClick={() => setV({ ...v, verkoop_per: 'kg' })}><Scale size={14} /> Op gewicht</button>
                    </div>
                    <label style={{ display: 'grid', gap: 6 }}>
                        <span className="kf-eyebrow">{kg ? 'Prijs per kilo (incl. btw)' : 'Prijs per stuk (incl. btw)'}</span>
                        <input className="kf-input" inputMode="decimal" value={v.prijs} onChange={(e) => setV({ ...v, prijs: e.target.value })} placeholder={kg ? '59,90' : '4,95'} />
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                        <span className="kf-eyebrow">Btw</span>
                        <select className="kf-input" value={v.btw_pct} onChange={(e) => setV({ ...v, btw_pct: Number(e.target.value) as 0 | 9 | 21 })}>
                            <option value={9}>9 % (eten)</option><option value={21}>21 % (alcohol, non-food)</option><option value={0}>0 %</option>
                        </select>
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                        <span className="kf-eyebrow">Leverancier</span>
                        <select className="kf-input" value={v.leverancier_id} onChange={(e) => setV({ ...v, leverancier_id: e.target.value })}>
                            <option value="">—</option>
                            {leveranciers.map((l) => <option key={l.id} value={l.id}>{l.naam}</option>)}
                        </select>
                    </label>
                    {!kg && (
                        <label style={{ display: 'grid', gap: 6 }}>
                            <span className="kf-eyebrow">Streepjescode (EAN), als het er een heeft</span>
                            <input className="kf-input" inputMode="numeric" value={v.ean} onChange={(e) => setV({ ...v, ean: e.target.value })} />
                        </label>
                    )}
                    {kg && (
                        <>
                            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5 }}>
                                <input type="checkbox" checked={v.binnen_per_sticker} onChange={(e) => setV({ ...v, binnen_per_sticker: e.target.checked })} style={{ marginTop: 3 }} />
                                <span>Komt voorverpakt binnen (bakjes van de slager): elke sticker is een bakje erbij, de THT komt van de levering.</span>
                            </label>
                            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5 }}>
                                <input type="checkbox" checked={v.beschermende_atmosfeer} onChange={(e) => setV({ ...v, beschermende_atmosfeer: e.target.checked })} style={{ marginTop: 3 }} />
                                <span>"Verpakt onder beschermende atmosfeer" op de sticker</span>
                            </label>
                            <label style={{ display: 'grid', gap: 6 }}>
                                <span className="kf-eyebrow">Bewaren (op de sticker)</span>
                                <input className="kf-input" value={v.bewaren} maxLength={80} onChange={(e) => setV({ ...v, bewaren: e.target.value })} />
                            </label>
                            {!v.binnen_per_sticker && (
                                <label style={{ display: 'grid', gap: 6 }}>
                                    <span className="kf-eyebrow">Houdbaar na snijden (dagen)</span>
                                    <input className="kf-input" inputMode="numeric" value={v.houdbaar_dagen} onChange={(e) => setV({ ...v, houdbaar_dagen: e.target.value.replace(/\D/g, '') })} />
                                </label>
                            )}
                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Het krijgt automatisch een stickernummer. Wegen en stickeren doe je op de Toonbank.</div>
                        </>
                    )}
                </div>
            )}
        </Drawer>
    );
}
