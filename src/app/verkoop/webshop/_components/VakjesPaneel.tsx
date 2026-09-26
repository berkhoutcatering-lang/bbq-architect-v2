'use client';

/**
 * Vakjes — het hoofdscherm van /verkoop/webshop.
 * Ontwerp: artboards 01–03 en 09. Plan §3.1.
 *
 * Elke kaart is één dag. Eén primaire knop (Kookbord); Inkoop is secundair;
 * Bestel is een menu met twee keuzes. Tellingen zijn de som van de orders
 * eronder. Wat de AI las staat altijd naast de originele opmerking.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { CalendarDays, Check, ChevronDown, ChevronUp, CircleAlert, ClipboardList, Flame, Loader2, MailWarning, MapPin, RotateCcw, Search, Send, ShoppingCart, Sparkles, TriangleAlert, Truck, AlertTriangle, Mail, Wallet } from 'lucide-react';
import Button from '@/components/Button';
import { formatEur } from '@/lib/format';
import { wensenSamenvatting } from '@/lib/winkel/plaatsing';
import Drawer from './Drawer';
import ProductiePaneel, { EtiketKnop, useEtiketPrinter } from './ProductiePaneel';
import {
    afstandLabel, bouwVakjes, dagenTot, datumKort, datumLang, opmerkingNietGelezen, tijdvak, vakjeNaam,
    type ArtikelRij, type ComponentRij, type MomentRij, type OrderRij, type Vakje, type VakjeRegel, type Wensen,
} from '../_lib/vakjes';
import { boekRestBetaling, plaatsOpnieuw, zetKlaargezet, zetWensenHandmatig } from '../actions';

type Melding = (tekst: string, soort?: 'success' | 'error' | 'info') => void;

interface Props {
    orders: OrderRij[];
    artikelen: ArtikelRij[];
    momenten: MomentRij[];
    /** De inhoud van elke regel (S7), voor productie, inpakken en etiket. */
    componenten: ComponentRij[];
    vandaag: string;
    herlaad: () => Promise<void>;
    melding: Melding;
}

type Filter = 'alles' | 'nietGeplaatst' | 'nietGelezen';

const eur = (c: number) => formatEur(c / 100);
const refundOpen = (o: OrderRij) => o.refund_status === 'mislukt' || o.refund_status === 'nodig';
const mailOpen = (o: OrderRij) => o.status === 'betaald' && o.mail_status !== 'verstuurd';

export default function VakjesPaneel({ orders, artikelen, momenten, componenten, vandaag, herlaad, melding }: Props) {
    const [filter, setFilter] = useState<Filter>('alles');
    const [openSleutel, setOpenSleutel] = useState<string | null>(null);
    const [bezig, setBezig] = useState<string | null>(null);
    const [zoek, setZoek] = useState('');
    const [productieSleutel, setProductieSleutel] = useState<string | null>(null);

    const vakjes = useMemo(() => bouwVakjes(orders, artikelen, momenten, vandaag), [orders, artikelen, momenten, vandaag]);
    const betaald = useMemo(() => orders.filter((o) => o.status === 'betaald'), [orders]);
    const mislukt = useMemo(() => betaald.filter((o) => o.plaatsing_status === 'mislukt'), [betaald]);
    const tel = {
        nietGeplaatst: vakjes.reduce((s, v) => s + v.nietGeplaatst, 0),
        nietGelezen: betaald.filter(opmerkingNietGelezen).length,
        refund: orders.filter(refundOpen).length,
        mail: orders.filter(mailOpen).length,
    };

    const zichtbaar = vakjes.filter((v) => {
        if (filter === 'nietGeplaatst') return v.nietGeplaatst > 0;
        if (filter === 'nietGelezen') return v.nietGelezen > 0;
        return true;
    });
    const open = openSleutel ? vakjes.find((v) => v.sleutel === openSleutel) ?? null : null;
    const productie = productieSleutel ? vakjes.find((v) => v.sleutel === productieSleutel) ?? null : null;

    /* De balie: zoek op ordernummer of naam (S5). Toont de treffers boven de vakjes. */
    const treffers = useMemo(() => {
        const q = zoek.trim().toLowerCase();
        if (q.length < 2) return [];
        return orders.filter((o) => o.nummer.toLowerCase().includes(q) || o.contact_naam.toLowerCase().includes(q)).slice(0, 8);
    }, [zoek, orders]);
    const vakjeVanOrder = (o: OrderRij) => vakjes.find((v) => v.orders.some((x) => x.id === o.id)) ?? null;

    async function opnieuw(o: OrderRij) {
        setBezig(`plaats:${o.id}`);
        try {
            const r = await plaatsOpnieuw({ orderId: o.id });
            if ('error' in r) { melding(r.error, 'error'); return; }
            if (r.data.status === 'mislukt') melding(`Nog niet gelukt: ${r.data.fout ?? 'onbekend'}`, 'error');
            else melding(r.data.status === 'geplaatst' ? 'Order ligt in zijn vakje' : 'Order ligt in de vaste bak', 'success');
            await herlaad();
        } finally { setBezig(null); }
    }

    return (
        <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <div className="ws-zoek" style={{ height: 36, minWidth: 260 }}><Search size={14} style={{ color: 'var(--muted)' }} /><input placeholder="Zoek order: HB-2026-0042 of naam" value={zoek} onChange={(e) => setZoek(e.target.value)} /></div>
                {tel.nietGeplaatst > 0 && (
                    <button type="button" className="ws-teller ws-teller-vuur" aria-pressed={filter === 'nietGeplaatst'} onClick={() => setFilter(filter === 'nietGeplaatst' ? 'alles' : 'nietGeplaatst')}>
                        <b>{tel.nietGeplaatst}</b> niet geplaatst
                    </button>
                )}
                {tel.nietGelezen > 0 && (
                    <button type="button" className="ws-teller ws-teller-warn" aria-pressed={filter === 'nietGelezen'} onClick={() => setFilter(filter === 'nietGelezen' ? 'alles' : 'nietGelezen')}>
                        <b>{tel.nietGelezen}</b> {tel.nietGelezen === 1 ? 'opmerking' : 'opmerkingen'} niet gelezen
                    </button>
                )}
            </div>

            {zoek.trim().length >= 2 && (
                <div className="panel" style={{ padding: 0 }}>
                    {treffers.length === 0 && <div className="ws-leeg" style={{ padding: 16 }}>Geen order gevonden voor “{zoek.trim()}”.</div>}
                    {treffers.map((o) => {
                        const v = vakjeVanOrder(o);
                        return (
                            <div key={o.id} className="ws-tabel-rij" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,2fr) auto', cursor: v ? 'pointer' : 'default' }} onClick={() => { if (v) { setOpenSleutel(v.sleutel); setZoek(''); } }}>
                                <div><div style={{ fontSize: 14, fontWeight: 600 }}>{o.contact_naam}</div><div className="ws-mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{o.nummer} · {o.status}{v ? ` · ${datumKort(v.datum)}` : ''}</div></div>
                                <div style={{ fontSize: 13, color: 'var(--muted)' }}>{regelsKort(o)}</div>
                                <div onClick={(e) => e.stopPropagation()}><RestBetaling order={o} herlaad={herlaad} melding={melding} /></div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Wat buiten de vakjes aandacht vraagt: plaatsing mislukt, terugbetaling, mail. */}
            {mislukt.map((o) => (
                <Banner key={`p${o.id}`} soort="vuur" icon={<CircleAlert size={18} />}
                    titel={`Ligt in geen vakje · ${o.nummer} · ${o.contact_naam}`}
                    tekst={`${regelsKort(o)} · ${eur(o.totaal_cents)} · betaald ${o.betaald_at ? tijdstip(o.betaald_at) : ''}. ${o.plaatsing_fout ?? 'De plaatsing is niet gelukt.'}`}
                    actie={<Button variant="ghost" icon={<RotateCcw size={14} />} loading={bezig === `plaats:${o.id}`} onClick={() => opnieuw(o)}>Plaats opnieuw</Button>} />
            ))}
            {orders.filter(refundOpen).map((o) => (
                <Banner key={`r${o.id}`} soort="vuur" icon={<AlertTriangle size={18} />}
                    titel={`Terugbetaling zelf regelen · ${o.nummer} · ${o.contact_naam}`}
                    tekst={`${eur(o.totaal_cents)} betaald na het verlopen van de reservering en de plek was weg. Terugstorten via myPOS ${o.refund_status === 'mislukt' ? `is mislukt — ${o.refund_fout ?? 'onbekend'}` : 'is nog niet gedaan'}.`} />
            ))}
            {orders.filter(mailOpen).map((o) => (
                <Banner key={`m${o.id}`} soort="warn" icon={<Mail size={18} />}
                    titel={`Bevestiging niet aangekomen · ${o.nummer} · ${o.contact_naam}`}
                    tekst={`${o.mail_fout ?? 'De mail is niet verstuurd.'} Mail de klant zelf op ${o.contact_email}.`}
                    actie={<a className="btn btn-ghost" href={`mailto:${o.contact_email}?subject=${encodeURIComponent(`Je bestelling ${o.nummer}`)}`}>Mail de klant</a>} />
            ))}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {zichtbaar.length === 0 && <div className="ws-leeg" style={{ padding: 24, textAlign: 'center' }}>Niets in deze selectie.</div>}
                {zichtbaar.map((v) => (
                    <VakjeKaart key={v.sleutel} v={v} artikelen={artikelen} vandaag={vandaag} bezig={bezig} onOpen={() => setOpenSleutel(v.sleutel)} onOpnieuw={opnieuw} />
                ))}
            </div>

            {open && !productie && (
                open.soort === 'vaste_bak'
                    ? <VandaagDrawer v={open} vandaag={vandaag} onClose={() => setOpenSleutel(null)} herlaad={herlaad} melding={melding} />
                    : <VakjeDrawer v={open} artikelen={artikelen} vandaag={vandaag} onClose={() => setOpenSleutel(null)} herlaad={herlaad} melding={melding} onOpnieuw={opnieuw} bezig={bezig} onProductie={() => setProductieSleutel(open.sleutel)} />
            )}
            {productie && <ProductiePaneel v={productie} artikelen={artikelen} componenten={componenten} onClose={() => setProductieSleutel(null)} melding={melding} />}
        </>
    );
}

/* ── Hulpjes ───────────────────────────────────────────────────────────────── */

function regelsKort(o: OrderRij): string {
    return o.winkel_order_regels.map((r) => `${r.aantal}× ${r.naam}`).join(', ');
}
function tijdstip(iso: string): string {
    return new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function soortLabel(v: Vakje): string {
    if (v.soort === 'vaste_bak') return 'vaste bak';
    return v.soort === 'dag' ? 'afhaaldag' : 'afhaalmoment';
}
function eenheidWoord(n: number, eenheid: string): string {
    if (eenheid === 'planken') return n === 1 ? 'plank' : 'planken';
    if (eenheid === 'dozen') return n === 1 ? 'doos' : 'dozen';
    return n === 1 ? 'stuk' : 'stuks';
}

function Banner({ soort, icon, titel, tekst, actie }: { soort: 'vuur' | 'warn'; icon: ReactNode; titel: string; tekst: string; actie?: ReactNode }) {
    const kleur = soort === 'vuur' ? 'var(--ws-vuur)' : 'var(--ws-warn)';
    return (
        <div className="ws-banner" style={soort === 'warn' ? { borderColor: 'rgba(245,158,11,.3)', background: 'rgba(245,158,11,.05)' } : undefined}>
            <span style={{ color: kleur, display: 'flex' }}>{icon}</span>
            <div style={{ minWidth: 0 }}>
                <div className="ws-banner-titel" style={{ color: kleur }}>{titel}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3, textWrap: 'pretty' }}>{tekst}</div>
            </div>
            {actie ?? <span />}
        </div>
    );
}

function Merktekens({ v }: { v: Vakje }) {
    const items: ReactNode[] = [];
    if (v.soort === 'vaste_bak') {
        if (v.verzenden > 0) items.push(<span key="verz" className="ws-merk"><Truck size={13} />{v.verzenden} verzenden</span>);
        if (v.regels.length > 0) items.push(<span key="klaar" className="ws-merk"><Check size={13} />{v.klaargezet.klaar} van {v.klaargezet.totaal} klaargezet</span>);
    }
    for (const a of v.allergenen) items.push(<span key={`a${a.naam}`} className="ws-merk ws-merk-warn"><TriangleAlert size={13} />allergie: {a.naam} ({a.aantal})</span>);
    if (v.nietGelezen > 0) items.push(<span key="lees" className="ws-merk ws-merk-warn"><MailWarning size={13} />{v.nietGelezen} {v.nietGelezen === 1 ? 'opmerking' : 'opmerkingen'} niet gelezen</span>);
    for (const naam of v.ongekoppeld) items.push(<span key={`o${naam}`} className="ws-merk ws-merk-warn"><Sparkles size={13} />nog geen gerecht of product: {naam}</span>);
    if (v.nietGeplaatst > 0) {
        const fout = v.orders.find((o) => o.plaatsing_fout)?.plaatsing_fout;
        items.push(<span key="np" className="ws-merk ws-merk-vuur"><CircleAlert size={13} />niet geplaatst{fout ? ` — ${fout}` : ''}</span>);
    }
    if (items.length === 0) return null;
    return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{items}</div>;
}

function Capaciteit({ v }: { v: Vakje }) {
    if (!v.capaciteit) return null;
    const { bezet, totaal, eenheid } = v.capaciteit;
    const vol = totaal > 0 && bezet >= totaal;
    const pct = totaal > 0 ? Math.min(100, Math.round((bezet / totaal) * 100)) : 0;
    return (
        <div className={`ws-balk${vol ? ' ws-balk-vol' : ''}`}>
            <div className="ws-balk-spoor"><div className="ws-balk-vul" style={{ width: `${pct}%` }} /></div>
            <span className="ws-balk-tekst">{bezet} / {totaal} {eenheid}{vol ? ' · vol' : ''}</span>
        </div>
    );
}

/** Menu met twee keuzes onder één knop. Nooit twee knoppen naast Kookbord en Inkoop. */
function BestelMenu({ v, vandaag, vol = false }: { v: Vakje; vandaag: string; vol?: boolean }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const f = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        window.addEventListener('mousedown', f);
        return () => window.removeEventListener('mousedown', f);
    }, [open]);
    const dagen = dagenTot(v.datum, vandaag);
    const inVenster = dagen <= 14;
    const vanaf = (() => { const d = new Date(v.datum + 'T00:00:00'); d.setDate(d.getDate() - 14); return datumKort(d.toLocaleDateString('en-CA')); })();
    const leeg = v.regels.length === 0;
    return (
        <div className="ws-menu-anker" ref={ref}>
            <button type="button" className="btn btn-ghost" disabled={leeg} onClick={() => setOpen((x) => !x)} style={open ? { color: 'var(--text)', borderColor: 'var(--border-strong)' } : undefined}>
                Bestel {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {open && (
                <div className="ws-menu">
                    <Link className="ws-menu-item" href={`/inkoop?let=${encodeURIComponent(v.sleutel)}`}>
                        <span style={{ color: 'var(--brand-gold)', display: 'flex', paddingTop: 2 }}><CalendarDays size={15} /></span>
                        <div><b>Mee met de volgende bestelling</b><span>{inVenster ? 'Staat op de lijst van vandaag, bij de vaste leveranciers — de regels zijn gemarkeerd.' : `Staat vanaf ${vanaf} vanzelf op de lijst.`}</span></div>
                    </Link>
                    <Link className="ws-menu-item" href={`/inkoop?vakje=${encodeURIComponent(v.sleutel)}`}>
                        <span style={{ color: 'var(--brand-gold)', display: 'flex', paddingTop: 2 }}><Send size={15} /></span>
                        <div><b>Bestel alleen dit</b><span>Een losse bestelling voor alleen dit vakje, per leverancier. De vaste ronde blijft zoals hij is.</span></div>
                    </Link>
                    {v.nietGeplaatst > 0 && <div className="ws-menu-voet" style={{ color: 'var(--ws-vuur)' }}><CircleAlert size={12} />{v.nietGeplaatst} niet geplaatste {v.nietGeplaatst === 1 ? 'order zit' : 'orders zitten'} hier niet in</div>}
                    {vol && <div className="ws-menu-voet" style={{ color: 'var(--ws-warn)' }}><TriangleAlert size={12} />dit vak is vol</div>}
                </div>
            )}
        </div>
    );
}

function Acties({ v, vandaag, bezig, onOpnieuw, primairKlas }: { v: Vakje; vandaag: string; bezig: string | null; onOpnieuw: (o: OrderRij) => void; primairKlas?: string }) {
    const mislukt = v.orders.find((o) => o.plaatsing_status === 'mislukt' || v.regels.some((x) => x.order.id === o.id && x.regel.event_id == null && x.regel.moment_id));
    return (
        <div className="ws-vakje-acties" onClick={(e) => e.stopPropagation()}>
            {v.soort !== 'vaste_bak' && v.eventId != null && (
                <Link className={`btn btn-brand ${primairKlas ?? 'ws-primair'}`} href={`/keuken/kookbord?event=${v.eventId}`}><Flame size={14} /> Kookbord</Link>
            )}
            {v.soort !== 'vaste_bak' && v.eventId == null && mislukt && (
                <Button className={primairKlas ?? 'ws-primair'} icon={<RotateCcw size={14} />} loading={bezig === `plaats:${mislukt.id}`} onClick={() => onOpnieuw(mislukt)}>Plaats opnieuw</Button>
            )}
            <Link className="btn btn-ghost" href={`/inkoop?vakje=${encodeURIComponent(v.sleutel)}`}><ShoppingCart size={14} /> Inkoop</Link>
            <BestelMenu v={v} vandaag={vandaag} vol={Boolean(v.capaciteit && v.capaciteit.bezet >= v.capaciteit.totaal)} />
        </div>
    );
}

/* ── Kaart ─────────────────────────────────────────────────────────────────── */

function VakjeKaart({ v, artikelen, vandaag, bezig, onOpen, onOpnieuw }: { v: Vakje; artikelen: ArtikelRij[]; vandaag: string; bezig: string | null; onOpen: () => void; onOpnieuw: (o: OrderRij) => void }) {
    const dagen = dagenTot(v.datum, vandaag);
    const sub = v.soort === 'vaste_bak' ? 'Klaarzetten & verzenden'
        : v.soort === 'moment' ? `${tijdvak(v.moment!) ?? ''} · ${v.capaciteit?.eenheid ?? 'planken'}`
            : vakjeNaam(v, artikelen);
    const leeg = v.regels.length === 0;
    return (
        <div className={`smoke-card ws-vakje${v.nietGeplaatst > 0 ? ' ws-vakje-vuur' : ''}`} onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}>
            <div>
                <div className="ws-eyebrow">{afstandLabel(dagen)} · {soortLabel(v)}</div>
                <div className="ws-vakje-datum">{datumLang(v.datum)}</div>
                <div className="ws-vakje-sub">{sub}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
                {leeg ? (
                    <div className="ws-leeg">Nog geen orders. Zodra iemand op de website afrekent, staat hij hier.</div>
                ) : (
                    <>
                        <div className="ws-vakje-tel">
                            {v.orders.length} {v.orders.length === 1 ? 'order' : 'orders'}
                            {v.soort === 'moment' && v.capaciteit && <> · {v.regels.length} {eenheidWoord(v.regels.length, v.capaciteit.eenheid)}</>}
                            {v.personen > 0 && <> · {v.personen} {v.personen === 1 ? 'persoon' : 'personen'}</>}
                        </div>
                        <div className="ws-vakje-wat">
                            {v.perArtikel.map((p) => <span key={p.artikel_id}><b>{p.aantal}{v.soort === 'vaste_bak' ? '×' : ''}</b> {p.dieet === 'vegetarisch' && v.soort !== 'vaste_bak' ? 'vegetarisch' : p.naam}</span>)}
                            {v.dozen && <span><b>{v.dozen.totaal}</b> {v.dozen.totaal === 1 ? 'doos' : 'dozen'} · {v.dozen.groot} groot, {v.dozen.klein} klein</span>}
                            {v.capaciteit && v.soort === 'moment' && <span>capaciteit {v.capaciteit.bezet} / {v.capaciteit.totaal} {v.capaciteit.eenheid}</span>}
                        </div>
                        {v.soort === 'dag' && <Capaciteit v={v} />}
                    </>
                )}
                <Merktekens v={v} />
            </div>
            {leeg ? <div /> : <Acties v={v} vandaag={vandaag} bezig={bezig} onOpnieuw={onOpnieuw} />}
        </div>
    );
}

/* ── Vakje open (moment / dag) ─────────────────────────────────────────────── */

function VakjeDrawer({ v, artikelen, vandaag, onClose, herlaad, melding, onOpnieuw, bezig, onProductie }: { v: Vakje; artikelen: ArtikelRij[]; vandaag: string; onClose: () => void; herlaad: () => Promise<void>; melding: Melding; onOpnieuw: (o: OrderRij) => void; bezig: string | null; onProductie: () => void }) {
    const dagen = dagenTot(v.datum, vandaag);
    const top = v.perArtikel.slice(0, 2);
    const { printerId } = useEtiketPrinter();
    const artikelOpId = new Map(artikelen.map((a) => [a.id, a]));
    const restOpen = v.orders.filter((o) => o.status === 'betaald' && o.betaalwijze === 'reservering' && o.rest_cents > 0 && !o.rest_betaald_at).length;
    return (
        <Drawer title={datumLang(v.datum)} subtitle={`${vakjeNaam(v, artikelen)} · ${soortLabel(v)}${v.moment && tijdvak(v.moment) ? ` · ${tijdvak(v.moment)}` : ''} · ${afstandLabel(dagen).toLowerCase()}`} onClose={onClose} width={600}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div className="ws-tegels">
                    {top.map((p) => <div key={p.artikel_id} className="ws-tegel"><b>{p.aantal}</b><span>{p.dieet === 'vegetarisch' ? 'vegetarisch' : p.naam}</span></div>)}
                    <div className="ws-tegel"><b>{v.personen || v.stuks}</b><span>{v.personen ? 'personen' : 'stuks'} · {v.orders.length} {v.orders.length === 1 ? 'order' : 'orders'}</span></div>
                    {v.capaciteit && <div className="ws-tegel"><b>{v.capaciteit.bezet} / {v.capaciteit.totaal}</b><span>{v.capaciteit.eenheid}{v.dozen ? ` · ${v.dozen.groot} groot, ${v.dozen.klein} klein` : ''}</span></div>}
                </div>
                <Merktekens v={v} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Acties v={v} vandaag={vandaag} bezig={bezig} onOpnieuw={onOpnieuw} primairKlas="" />
                    <Button variant="ghost" icon={<ClipboardList size={14} />} onClick={onProductie}>Productie & inpakken</Button>
                    {restOpen > 0 && <span className="ws-merk ws-merk-warn"><Wallet size={13} />{restOpen} {restOpen === 1 ? 'order' : 'orders'} met rest in de winkel</span>}
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 6 }}>
                    <div className="ws-eyebrow">Orders · {v.orders.length}</div>
                    <div className="ws-mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{eur(v.totaalCents)}</div>
                </div>
                <div style={{ marginTop: -10 }}>
                    {v.orders.map((o) => (
                        <div key={o.id} className="ws-order">
                            <div className="ws-order-kop">
                                <div className="ws-order-naam">{o.contact_naam}<span className="ws-order-nummer">{o.nummer}</span>{o.winkel_order_regels.some((r) => r.alcohol) && <span className="ws-merk ws-merk-warn" style={{ marginLeft: 8, height: 22 }}>18+</span>}</div>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    {o.status === 'betaald' && <EtiketKnop orderId={o.id} printerId={printerId} aantal={o.winkel_order_regels.reduce((s, r) => s + (artikelOpId.get(r.artikel_id)?.schaal_verdeling ? Math.max(1, Math.ceil(r.aantal / 5)) : r.aantal), 0)} melding={melding} />}
                                    <div className="ws-mono" style={{ fontSize: 13 }}>{eur(o.totaal_cents)}</div>
                                </div>
                            </div>
                            <div className="ws-order-wat">{regelsKort(o)} · {datumKort(v.datum)}{dozenTekst(v.regels.filter((x) => x.order.id === o.id))}</div>
                            <RestBetaling order={o} herlaad={herlaad} melding={melding} />
                            <div className="ws-order-wat"><a href={`mailto:${o.contact_email}`} style={{ color: 'var(--brand-gold)' }}>{o.contact_email}</a>{o.contact_telefoon && <> · <a href={`tel:${o.contact_telefoon}`} style={{ color: 'var(--brand-gold)' }}>{o.contact_telefoon}</a></>}</div>
                            {o.plaatsing_status === 'mislukt' && <span className="ws-merk ws-merk-vuur" style={{ alignSelf: 'flex-start' }}><CircleAlert size={13} />niet geplaatst — {o.plaatsing_fout}</span>}
                            <WensenBlok order={o} herlaad={herlaad} melding={melding} />
                        </div>
                    ))}
                </div>
            </div>
        </Drawer>
    );
}

function dozenTekst(regels: VakjeRegel[]): string {
    const a = regels[0]?.artikel;
    if (!a || a.capaciteit_soort !== 'dozen' || !a.doos_klein_max || !a.doos_groot) return '';
    const totaal = regels.reduce((s, r) => s + r.regel.aantal, 0);
    return totaal <= a.doos_klein_max ? ' · kleine doos' : totaal <= a.doos_groot ? ' · grote doos' : '';
}

/* ── Vandaag open (vaste bak) ──────────────────────────────────────────────── */

function VandaagDrawer({ v, vandaag, onClose, herlaad, melding }: { v: Vakje; vandaag: string; onClose: () => void; herlaad: () => Promise<void>; melding: Melding }) {
    const [bezig, setBezig] = useState<number | null>(null);
    async function vink(regelId: number, klaargezet: boolean) {
        setBezig(regelId);
        try {
            const r = await zetKlaargezet({ regelId, klaargezet });
            if ('error' in r) { melding(r.error, 'error'); return; }
            await herlaad();
        } finally { setBezig(null); }
    }
    const dagen = dagenTot(v.datum, vandaag);
    return (
        <Drawer title={`${afstandLabel(dagen)} · ${datumLang(v.datum)}`} subtitle={`Vaste bak · klaarzetten & verzenden · ${v.orders.length} ${v.orders.length === 1 ? 'order' : 'orders'}`} onClose={onClose} width={600}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div className="ws-onderschrift" style={{ textWrap: 'pretty' }}>Alles zonder afhaalmoment komt hier: meenemen of verzenden. Vink af wat klaarstaat.</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Link className="btn btn-ghost" href={`/inkoop?vakje=${encodeURIComponent(v.sleutel)}`}><ShoppingCart size={14} /> Inkoop</Link>
                    <BestelMenu v={v} vandaag={vandaag} />
                    <div className="ws-mono" style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>{v.klaargezet.klaar} / {v.klaargezet.totaal} klaargezet</div>
                </div>
                <div className="ws-eyebrow" style={{ marginTop: 6 }}>Klaarzetten · {v.regels.length}</div>
                <div style={{ marginTop: -10 }}>
                    {v.regels.length === 0 && <div className="ws-leeg" style={{ padding: '12px 0' }}>Nog niets voor vandaag.</div>}
                    {v.regels.map(({ regel, order }) => {
                        const af = Boolean(regel.klaargezet_at);
                        const verzend = order.leverwijze === 'verzenden';
                        return (
                            <div key={regel.id} className={`ws-klaar${af ? ' ws-klaar-af' : ''}`}>
                                <button type="button" className="ws-vink" role="checkbox" aria-checked={af} aria-label={af ? 'Niet klaargezet' : 'Klaargezet'} disabled={bezig === regel.id} onClick={() => vink(regel.id, !af)}>
                                    <span>{bezig === regel.id ? <Loader2 size={14} style={{ color: 'var(--muted)' }} /> : af ? <Check size={15} /> : null}</span>
                                </button>
                                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
                                    <div>
                                        <div className="ws-klaar-titel">{regel.aantal}× {regel.naam}</div>
                                        <div style={{ fontSize: 12, color: af ? 'inherit' : 'var(--muted)', marginTop: 2 }}>
                                            {order.contact_naam} · <span className="ws-mono">{order.nummer}</span> · {verzend ? `verzenden${order.leverkosten_cents ? ` · incl. ${eur(order.leverkosten_cents)} verzendkosten` : ''}` : 'meenemen'}
                                            {af && regel.klaargezet_at && <> · klaargezet {new Date(regel.klaargezet_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</>}
                                        </div>
                                    </div>
                                    {!af && verzend && order.adres && (
                                        <div className="ws-adres"><span style={{ color: 'var(--muted)', display: 'flex', paddingTop: 2 }}><MapPin size={14} /></span><div>{order.contact_naam}<br />{order.adres.straat}<br />{order.adres.postcode} {order.adres.plaats}</div></div>
                                    )}
                                    {!af && (
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <Button icon={verzend ? <Truck size={14} /> : <Check size={14} />} loading={bezig === regel.id} onClick={() => vink(regel.id, true)}>{verzend ? 'Verzonden' : 'Klaargezet'}</Button>
                                        </div>
                                    )}
                                    {order.opmerking && <WensenBlok order={order} herlaad={herlaad} melding={melding} />}
                                </div>
                                <div className="ws-mono" style={{ fontSize: 13, paddingTop: 4 }}>{eur(regel.bedrag_cents)}</div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </Drawer>
    );
}

/* ── De balie: het restbedrag boeken (S5) ──────────────────────────────────── */

function RestBetaling({ order: o, herlaad, melding }: { order: OrderRij; herlaad: () => Promise<void>; melding: Melding }) {
    const [bezig, setBezig] = useState<'contant' | 'pin' | null>(null);
    if (o.betaalwijze !== 'reservering' || o.status !== 'betaald') return null;
    if (o.rest_betaald_at) {
        return <div className="ws-order-wat" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Check size={13} style={{ color: 'var(--green)' }} />Reservering {eur(o.nu_te_betalen_cents)} online · rest {eur(o.rest_cents)} {o.rest_betaalmethode ?? ''} betaald {new Date(o.rest_betaald_at).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>;
    }
    async function boek(methode: 'contant' | 'pin') {
        setBezig(methode);
        try {
            const r = await boekRestBetaling({ orderId: o.id, methode });
            if ('error' in r) { melding(r.error, 'error'); return; }
            melding(r.data.uitkomst === 'al_geboekt' ? 'Het rest was al geboekt' : `Rest ${eur(o.rest_cents)} geboekt (${methode})`, 'success');
            await herlaad();
        } finally { setBezig(null); }
    }
    return (
        <div className="ws-rest">
            <span style={{ color: 'var(--ws-warn)', display: 'flex' }}><Wallet size={14} /></span>
            <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}><b>Reeds betaald {eur(o.nu_te_betalen_cents)}</b> · te betalen in de winkel: <b>{eur(o.rest_cents)}</b></div>
            <Button size="sm" variant="ghost" loading={bezig === 'contant'} disabled={bezig != null} onClick={() => boek('contant')}>Contant</Button>
            <Button size="sm" loading={bezig === 'pin'} disabled={bezig != null} onClick={() => boek('pin')}>Pin</Button>
        </div>
    );
}

/* ── Wat de AI las, naast het origineel ────────────────────────────────────── */

const LEGE_WENSEN: Wensen = { vegetarisch: 0, veganistisch: 0, glutenvrij: 0, allergenen: [], overig: [] };

function WensenBlok({ order: o, herlaad, melding }: { order: OrderRij; herlaad: () => Promise<void>; melding: Melding }) {
    const [form, setForm] = useState<null | { vegetarisch: string; veganistisch: string; glutenvrij: string; allergenen: string; overig: string }>(null);
    const [bezig, setBezig] = useState(false);
    if (!o.opmerking?.trim()) return null;
    const nietGelezen = opmerkingNietGelezen(o);
    const samenvatting = wensenSamenvatting(o.wensen);

    async function bewaar(w: Wensen) {
        setBezig(true);
        try {
            const r = await zetWensenHandmatig({ orderId: o.id, wensen: w });
            if ('error' in r) { melding(r.error, 'error'); return; }
            melding('Wensen gezet en het vakje opnieuw geteld', 'success');
            setForm(null);
            await herlaad();
        } finally { setBezig(false); }
    }
    function openForm() {
        const w = o.wensen ?? LEGE_WENSEN;
        setForm({ vegetarisch: String(w.vegetarisch), veganistisch: String(w.veganistisch), glutenvrij: String(w.glutenvrij), allergenen: w.allergenen.join(', '), overig: w.overig.join('; ') });
    }
    function uitForm(): Wensen | null {
        if (!form) return null;
        const n = (s: string) => { const v = Number(s); return Number.isInteger(v) && v >= 0 ? v : NaN; };
        const veg = n(form.vegetarisch), vegan = n(form.veganistisch), gf = n(form.glutenvrij);
        if ([veg, vegan, gf].some(Number.isNaN)) { melding('Aantallen zijn hele getallen, 0 of meer.', 'error'); return null; }
        return {
            vegetarisch: veg, veganistisch: vegan, glutenvrij: gf,
            allergenen: form.allergenen.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
            overig: form.overig.split(';').map((s) => s.trim()).filter(Boolean),
        };
    }

    return (
        <div className={`ws-wensen${nietGelezen ? ' ws-wensen-warn' : ''}`}>
            <div className="ws-wensen-kop">
                {nietGelezen ? (
                    <>
                        <span style={{ color: 'var(--ws-warn)', display: 'flex' }}><MailWarning size={14} /></span>
                        <div style={{ flex: 1, minWidth: 0 }}><span style={{ fontWeight: 600, color: 'var(--ws-warn)' }}>Opmerking niet gelezen — lees zelf</span><span style={{ color: 'var(--muted)' }}> · {o.wensen_bron === 'mislukt' ? 'de AI kon het niet lezen' : 'nog niet gelezen'}</span></div>
                        {!form && <Button variant="ghost" size="sm" icon={<Check size={12} />} loading={bezig} onClick={() => bewaar(LEGE_WENSEN)}>Gelezen</Button>}
                        {!form && <Button variant="ghost" size="sm" onClick={openForm}>Wensen zetten</Button>}
                    </>
                ) : (
                    <>
                        <span style={{ color: 'var(--brand-gold)', display: 'flex' }}><Sparkles size={14} /></span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontWeight: 600 }}>{samenvatting ? `Uit de opmerking: ${samenvatting}` : 'Uit de opmerking: geen wensen'}</span>
                            <span style={{ color: 'var(--muted)' }}> — {o.wensen_bron === 'handmatig' ? 'door jou gezet' : 'gelezen door AI'}</span>
                        </div>
                        {!form && <Button variant="ghost" size="sm" onClick={openForm}>Klopt niet</Button>}
                    </>
                )}
            </div>
            <div className="ws-wensen-origineel">“{o.opmerking.trim()}”</div>
            {form && (
                <div className="ws-wensen-form">
                    <div className="field"><label>Vegetarisch</label><input inputMode="numeric" value={form.vegetarisch} onChange={(e) => setForm({ ...form, vegetarisch: e.target.value })} /></div>
                    <div className="field"><label>Veganistisch</label><input inputMode="numeric" value={form.veganistisch} onChange={(e) => setForm({ ...form, veganistisch: e.target.value })} /></div>
                    <div className="field"><label>Glutenvrij</label><input inputMode="numeric" value={form.glutenvrij} onChange={(e) => setForm({ ...form, glutenvrij: e.target.value })} /></div>
                    <div className="field full"><label>Allergenen</label><input placeholder="noten, pinda, lactose" value={form.allergenen} onChange={(e) => setForm({ ...form, allergenen: e.target.value })} /><div className="field-hint">Gescheiden door komma’s</div></div>
                    <div className="field full"><label>Overig</label><input placeholder="graag bellen; komt om half elf" value={form.overig} onChange={(e) => setForm({ ...form, overig: e.target.value })} /><div className="field-hint">Gescheiden door puntkomma’s</div></div>
                    <div className="full" style={{ display: 'flex', gap: 8 }}>
                        <Button icon={<Check size={14} />} loading={bezig} onClick={() => { const w = uitForm(); if (w) void bewaar(w); }}>Opslaan</Button>
                        <Button variant="ghost" onClick={() => setForm(null)}>Annuleren</Button>
                    </div>
                </div>
            )}
        </div>
    );
}
