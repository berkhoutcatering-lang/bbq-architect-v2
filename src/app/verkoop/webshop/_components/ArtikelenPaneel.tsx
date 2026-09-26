'use client';

/**
 * Artikelen — wat de website verkoopt, en wat de keuken daarvoor maakt of
 * jij daarvoor inkoopt. Ontwerp: artboards 05–06. Plan §3.2.
 *
 * Een AI-voorstel is een vraag, nooit een feit: het staat in amber met
 * "zo doen?" en wordt pas een koppeling als jij Ja klikt.
 */
import { useEffect, useMemo, useState } from 'react';
import { ChefHat, Check, Eye, GripVertical, Package, Plus, Search, Snowflake, Sparkles, Trash2, Truck, WandSparkles, Wine } from 'lucide-react';
import Button from '@/components/Button';
import Drawer from './Drawer';
import { leesEuro, toonEuro, type ArtikelRij, type ProductRij, type SlotRij } from '../_lib/vakjes';
import { koppelArtikel, koppelronde, maakArtikel, maakVoorraadItem, vraagKoppelVoorstel, werkArtikelBij, zetArtikelActief, zetSlots } from '../actions';
import { PRODUCT_TYPES, ProductDrawer, hoeveelheidTekst, type ProductType } from './ProductenPaneel';
import { btwVerdeling, inkoopwaardeCenten, winkelwaardeCenten, type Component, type Product } from '@/lib/winkel/rekenen';

type Melding = (tekst: string, soort?: 'success' | 'error' | 'info') => void;
export interface GerechtKeuze { id: string; naam: string }
export interface VoorraadKeuze { id: number; naam: string; unit: string | null; current_stock: number | null }

interface Props {
    artikelen: ArtikelRij[];
    gerechten: GerechtKeuze[];
    voorraad: VoorraadKeuze[];
    /* Sinterklaas: producten en slots (templates). */
    producten: ProductRij[];
    slots: SlotRij[];
    herlaad: () => Promise<void>;
    melding: Melding;
}

/** Een artikel met slots is verkoopbaar als elk slot een product heeft. */
export function slotsVanArtikel(id: string, slots: SlotRij[]): SlotRij[] {
    return slots.filter((s) => s.artikel_id === id).sort((a, b) => a.volgorde - b.volgorde);
}
export function verkoopbaarMetSlots(id: string, slots: SlotRij[]): boolean {
    return slotsVanArtikel(id, slots).every((s) => s.standaard_product_id != null);
}

type Filter = 'alles' | 'voorstellen' | 'ongekoppeld';

const gekoppeld = (a: ArtikelRij) => Boolean(a.gerecht_id || a.inventory_id);
const heeftVoorstel = (a: ArtikelRij) => !gekoppeld(a) && a.koppel_voorstel != null && a.koppel_voorstel.soort !== 'geen';

export default function ArtikelenPaneel({ artikelen, gerechten, voorraad, producten, slots, herlaad, melding }: Props) {
    const [filter, setFilter] = useState<Filter>('alles');
    const [openId, setOpenId] = useState<string | 'nieuw' | null>(null);
    const [bezig, setBezig] = useState<string | null>(null);

    const gerechtOpId = useMemo(() => new Map(gerechten.map((g) => [g.id, g])), [gerechten]);
    const voorraadOpId = useMemo(() => new Map(voorraad.map((v) => [v.id, v])), [voorraad]);
    const tel = { voorstellen: artikelen.filter(heeftVoorstel).length, ongekoppeld: artikelen.filter((a) => !gekoppeld(a)).length };
    const zichtbaar = artikelen.filter((a) => filter === 'alles' || (filter === 'voorstellen' ? heeftVoorstel(a) : !gekoppeld(a)));
    const open = openId === 'nieuw' ? 'nieuw' : openId ? artikelen.find((a) => a.id === openId) ?? null : null;

    async function doe(sleutel: string, actie: () => Promise<{ data: unknown } | { error: string }>, gelukt: string) {
        setBezig(sleutel);
        try {
            const r = await actie();
            if ('error' in r) { melding(r.error, 'error'); return false; }
            if (gelukt) melding(gelukt, 'success');
            await herlaad();
            return true;
        } finally { setBezig(null); }
    }

    async function ronde() {
        setBezig('ronde');
        try {
            const r = await koppelronde();
            if ('error' in r) { melding(r.error, 'error'); return; }
            if (r.data.fout) melding(r.data.fout, 'error');
            else melding(r.data.aantal === 0 ? 'Alles is al gekoppeld' : `${r.data.aantal} ${r.data.aantal === 1 ? 'voorstel' : 'voorstellen'} klaar — zeg ja of anders`, 'success');
            await herlaad();
        } finally { setBezig(null); }
    }

    function voorstelJa(a: ArtikelRij) {
        const v = a.koppel_voorstel!;
        const input = v.soort === 'gerecht' ? { id: a.id, soort: 'gerecht' as const, gerecht_id: String(v.id) } : { id: a.id, soort: 'voorraad' as const, inventory_id: Number(v.id), inkoop_per_stuk: null };
        void doe(`ja:${a.id}`, () => koppelArtikel(input), `${a.naam} gekoppeld aan ${v.soort} ${v.naam}`);
    }

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {tel.voorstellen > 0 && <button type="button" className="ws-teller ws-teller-warn" aria-pressed={filter === 'voorstellen'} onClick={() => setFilter(filter === 'voorstellen' ? 'alles' : 'voorstellen')}><b>{tel.voorstellen}</b> {tel.voorstellen === 1 ? 'voorstel' : 'voorstellen'}</button>}
                    {tel.ongekoppeld > 0 && <button type="button" className="ws-teller" aria-pressed={filter === 'ongekoppeld'} onClick={() => setFilter(filter === 'ongekoppeld' ? 'alles' : 'ongekoppeld')}><b>{tel.ongekoppeld}</b> nog niet gekoppeld</button>}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Button variant="ghost" icon={<Plus size={14} />} onClick={() => setOpenId('nieuw')}>Nieuw artikel</Button>
                    <Button icon={<WandSparkles size={14} />} loading={bezig === 'ronde'} disabled={tel.ongekoppeld === 0} onClick={ronde}>Koppelronde</Button>
                </div>
            </div>
            {tel.ongekoppeld > 0 && (
                <div className="ws-tip"><span style={{ color: 'var(--brand-gold)', display: 'flex' }}><Sparkles size={13} /></span>Koppelronde: de AI stelt voor alle {tel.ongekoppeld} {tel.ongekoppeld === 1 ? 'artikel' : 'artikelen'} zonder vaste koppeling een gerecht of voorraad-item voor. Jij zegt ja of anders.</div>
            )}

            <div className="panel">
                <div className="ws-tabel-kop ws-artikelen-grid"><span>Artikel</span><span>Prijs incl. btw</span><span>Btw</span><span>Aan</span><span>Afhalen</span><span>Koppeling</span></div>
                {zichtbaar.length === 0 && <div className="ws-leeg" style={{ padding: 24, textAlign: 'center' }}>{artikelen.length === 0 ? 'Nog geen artikelen. Zet je eerste artikel op met de slug van de website.' : 'Niets in deze selectie.'}</div>}
                {zichtbaar.map((a) => (
                    <div key={a.id} className="ws-tabel-rij ws-artikelen-grid" onClick={() => setOpenId(a.id)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setOpenId(a.id); }}>
                        <span style={{ fontSize: 14, fontWeight: 500 }}>{a.naam}{!a.publiek && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · niet publiek</span>}</span>
                        <span style={{ fontSize: 13 }}>
                            {a.prijs_cents == null ? <span style={{ color: 'var(--muted-weak)' }}>prijs volgt</span> : <><span className="ws-mono">€ {toonEuro(a.prijs_cents)}</span> <span style={{ color: 'var(--muted)' }}>{a.eenheid.replace(/^per persoon$/, 'p.p.')}</span></>}
                            {!verkoopbaarMetSlots(a.id, slots) && <div style={{ fontSize: 11, color: 'var(--ws-warn)' }}>slot leeg · niet verkoopbaar</div>}
                        </span>
                        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{a.btw_pct}%</span>
                        <span onClick={(e) => e.stopPropagation()}>
                            <button type="button" className="ws-schakel" role="switch" aria-checked={a.actief} aria-label={a.actief ? 'Uitzetten' : 'Aanzetten'} disabled={bezig === `aan:${a.id}`} onClick={() => doe(`aan:${a.id}`, () => zetArtikelActief({ id: a.id, actief: !a.actief }), a.actief ? `${a.naam} staat uit` : `${a.naam} staat aan`)} />
                        </span>
                        <span style={{ fontSize: 13, color: a.moment_soort === 'geen' ? 'var(--muted)' : 'var(--text)' }}>{a.moment_soort}</span>
                        <div style={{ minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
                            <Koppeling a={a} gerechtOpId={gerechtOpId} voorraadOpId={voorraadOpId} bezig={bezig === `ja:${a.id}`} onJa={() => voorstelJa(a)} onAnders={() => setOpenId(a.id)} />
                        </div>
                    </div>
                ))}
            </div>

            {open && (
                <ArtikelDrawer artikel={open === 'nieuw' ? null : open} gerechten={gerechten} voorraad={voorraad} producten={producten} slots={open === 'nieuw' ? [] : slotsVanArtikel(open.id, slots)} onClose={() => setOpenId(null)} herlaad={herlaad} melding={melding} />
            )}
        </>
    );
}

function Koppeling({ a, gerechtOpId, voorraadOpId, bezig, onJa, onAnders }: { a: ArtikelRij; gerechtOpId: Map<string, GerechtKeuze>; voorraadOpId: Map<number, VoorraadKeuze>; bezig: boolean; onJa: () => void; onAnders: () => void }) {
    if (a.gerecht_id) return <span className="ws-koppeling"><span style={{ color: 'var(--brand-gold)', display: 'flex' }}><ChefHat size={14} /></span>gerecht {gerechtOpId.get(a.gerecht_id)?.naam ?? '(verwijderd)'}</span>;
    if (a.inventory_id != null) {
        const v = voorraadOpId.get(a.inventory_id);
        return <span className="ws-koppeling"><span style={{ color: 'var(--brand-gold)', display: 'flex' }}><Package size={14} /></span>voorraad {v?.naam ?? '(verwijderd)'}<span style={{ color: 'var(--muted)' }}>({a.inkoop_per_stuk ?? 1} {v?.unit ?? 'stuk'} per stuk)</span></span>;
    }
    if (a.koppel_voorstel && a.koppel_voorstel.soort !== 'geen') {
        return (
            <span className="ws-koppeling ws-koppeling-voorstel">
                <span style={{ display: 'flex' }}><Sparkles size={14} /></span>voorstel: {a.koppel_voorstel.soort} {a.koppel_voorstel.naam} — zo doen?
                <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '3px 10px', color: 'var(--text)' }} disabled={bezig} onClick={onJa}>{bezig ? '…' : 'Ja'}</button>
                <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '3px 10px' }} onClick={onAnders}>Anders</button>
            </span>
        );
    }
    if (a.koppel_voorstel?.soort === 'geen') return <span className="ws-koppeling-leeg" title={a.koppel_voorstel.reden}>nog geen gerecht of product gekoppeld · {a.koppel_voorstel.reden}</span>;
    return <span className="ws-koppeling-leeg">nog geen gerecht of product gekoppeld</span>;
}

/* ── Drawer ────────────────────────────────────────────────────────────────── */

interface Form {
    slug: string; naam: string; eenheid: string; telt: 'stuks' | 'personen'; prijs: string; btw_pct: 0 | 9 | 21;
    minimum: string; maximum: string; verzendbaar: boolean; gekoeld: boolean; actief: boolean; publiek: boolean;
    dieet: ArtikelRij['dieet']; moment_soort: ArtikelRij['moment_soort']; moment_groep: string; afhaalmoment_tekst: string;
    capaciteit_soort: ArtikelRij['capaciteit_soort']; doos_klein_max: string; doos_groot: string; voorraad: string;
    koppel: 'gerecht' | 'voorraad' | 'geen'; gerecht_id: string | null; inventory_id: number | null; inkoop_per_stuk: string;
    /* Sinterklaas. */
    segment: ArtikelRij['segment']; alcohol: boolean; schaal_verdeling: boolean; btw21: string; verpakking_klein: string; verpakking_groot: string;
}

/** Een slot in het formulier: alles als tekst, pas bij opslaan getallen. */
interface SlotForm { id: string | null; slot_type: ProductType; naam: string; hoeveelheid: string; eenheid: 'stuk' | 'gram'; per: 'stuk' | 'persoon'; standaard_product_id: string | null }
function vanSlot(s: SlotRij): SlotForm {
    return { id: s.id, slot_type: s.slot_type as ProductType, naam: s.naam, hoeveelheid: String(s.hoeveelheid), eenheid: s.eenheid, per: s.per, standaard_product_id: s.standaard_product_id };
}

function vanArtikel(a: ArtikelRij | null): Form {
    return {
        slug: a?.slug ?? '', naam: a?.naam ?? '', eenheid: a?.eenheid ?? 'per stuk', telt: a?.telt ?? 'stuks', prijs: toonEuro(a?.prijs_cents), btw_pct: (a?.btw_pct as 0 | 9 | 21) ?? 9,
        minimum: String(a?.minimum ?? 1), maximum: a?.maximum == null ? '' : String(a.maximum), verzendbaar: a?.verzendbaar ?? false, gekoeld: a?.gekoeld ?? false,
        actief: a?.actief ?? false, publiek: a?.publiek ?? true, dieet: a?.dieet ?? null, moment_soort: a?.moment_soort ?? 'geen', moment_groep: a?.moment_groep ?? '',
        afhaalmoment_tekst: a?.afhaalmoment_tekst ?? '', capaciteit_soort: a?.capaciteit_soort ?? 'regel', doos_klein_max: a?.doos_klein_max == null ? '' : String(a.doos_klein_max),
        doos_groot: a?.doos_groot == null ? '' : String(a.doos_groot), voorraad: a?.voorraad == null ? '' : String(a.voorraad),
        koppel: a?.gerecht_id ? 'gerecht' : a?.inventory_id != null ? 'voorraad' : 'geen', gerecht_id: a?.gerecht_id ?? null, inventory_id: a?.inventory_id ?? null,
        inkoop_per_stuk: a?.inkoop_per_stuk == null ? '1' : String(a.inkoop_per_stuk),
        segment: a?.segment ?? null, alcohol: a?.alcohol ?? false, schaal_verdeling: a?.schaal_verdeling ?? false,
        btw21: a?.btw_verdeling?.['21'] == null ? '' : String(a.btw_verdeling['21']),
        verpakking_klein: toonEuro(a?.verpakking_klein_cents), verpakking_groot: toonEuro(a?.verpakking_groot_cents),
    };
}

function ArtikelDrawer({ artikel, gerechten, voorraad, producten, slots, onClose, herlaad, melding }: { artikel: ArtikelRij | null; gerechten: GerechtKeuze[]; voorraad: VoorraadKeuze[]; producten: ProductRij[]; slots: SlotRij[]; onClose: () => void; herlaad: () => Promise<void>; melding: Melding }) {
    const [f, setF] = useState<Form>(() => vanArtikel(artikel));
    const [slotForms, setSlotForms] = useState<SlotForm[]>(() => slots.map(vanSlot));
    const [slotsGewijzigd, setSlotsGewijzigd] = useState(false);
    const [nieuwProductVoor, setNieuwProductVoor] = useState<number | null>(null);
    const productOpId = useMemo(() => new Map(producten.map((p) => [p.id, p])), [producten]);
    const [bezig, setBezig] = useState(false);
    const [aiBezig, setAiBezig] = useState(false);
    const [voorstel, setVoorstel] = useState(artikel?.koppel_voorstel ?? null);
    const [zoekG, setZoekG] = useState('');
    const [zoekV, setZoekV] = useState('');
    const [nieuwItem, setNieuwItem] = useState<null | { naam: string; unit: string }>(null);
    const [lokaleVoorraad, setLokaleVoorraad] = useState(voorraad);
    useEffect(() => setLokaleVoorraad(voorraad), [voorraad]);
    const zet = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

    /* Het AI-voorstel als eerste, aangevinkte optie — maar pas een koppeling als je opslaat. */
    useEffect(() => {
        if (!artikel || artikel.gerecht_id || artikel.inventory_id != null || !voorstel || voorstel.soort === 'geen') return;
        setF((x) => x.koppel !== 'geen' ? x : voorstel.soort === 'gerecht'
            ? { ...x, koppel: 'gerecht', gerecht_id: String(voorstel.id) }
            : { ...x, koppel: 'voorraad', inventory_id: Number(voorstel.id) });
    }, [artikel, voorstel]);

    const n = (s: string) => (s.trim() === '' ? null : Number(s));
    async function opslaan() {
        const prijs = leesEuro(f.prijs);
        const verpKlein = leesEuro(f.verpakking_klein);
        const verpGroot = leesEuro(f.verpakking_groot);
        if (prijs === undefined || verpKlein === undefined || verpGroot === undefined) { melding('Dat is geen geldig bedrag.', 'error'); return; }
        const btw21 = f.btw21.trim() === '' ? null : Number(f.btw21.replace(',', '.'));
        if (btw21 != null && !(btw21 >= 0 && btw21 <= 100)) { melding('De btw-verdeling is een percentage tussen 0 en 100.', 'error'); return; }
        const velden = {
            naam: f.naam, eenheid: f.eenheid, telt: f.telt, prijs_cents: prijs, btw_pct: f.btw_pct,
            minimum: Number(f.minimum) || 1, maximum: n(f.maximum), verzendbaar: f.verzendbaar, gekoeld: f.gekoeld,
            moment_soort: f.moment_soort, moment_groep: f.moment_groep.trim() || null, afhaalmoment_tekst: f.afhaalmoment_tekst.trim() || null,
            capaciteit_soort: f.capaciteit_soort, doos_klein_max: n(f.doos_klein_max), doos_groot: n(f.doos_groot), voorraad: n(f.voorraad),
            actief: f.actief, publiek: f.publiek, dieet: f.dieet,
            segment: f.segment, alcohol: f.alcohol, schaal_verdeling: f.schaal_verdeling,
            btw_verdeling: btw21 == null ? null : { '21': btw21, '9': Math.round((100 - btw21) * 100) / 100 },
            verpakking_klein_cents: verpKlein, verpakking_groot_cents: verpGroot,
        };
        /* Slots: alles als getal, elke regel een naam en een hoeveelheid. */
        const slotInvoer = slotForms.map((sl) => ({ id: sl.id, slot_type: sl.slot_type, naam: sl.naam.trim(), hoeveelheid: Number(sl.hoeveelheid.replace(',', '.')), eenheid: sl.eenheid, per: sl.per, standaard_product_id: sl.standaard_product_id }));
        if (slotInvoer.some((sl) => !sl.naam || !(sl.hoeveelheid > 0))) { melding('Elk slot heeft een naam en een hoeveelheid groter dan 0.', 'error'); return; }
        setBezig(true);
        try {
            let id = artikel?.id ?? null;
            if (!id) {
                const r = await maakArtikel({ ...velden, slug: f.slug.trim() });
                if ('error' in r) { melding(r.error, 'error'); return; }
                id = r.data.id;
            } else {
                const r = await werkArtikelBij({ ...velden, id });
                if ('error' in r) { melding(r.error, 'error'); return; }
            }
            const was = artikel ? vanArtikel(artikel) : null;
            const koppelingVeranderd = !was || was.koppel !== f.koppel || was.gerecht_id !== f.gerecht_id || was.inventory_id !== f.inventory_id || was.inkoop_per_stuk !== f.inkoop_per_stuk;
            if (koppelingVeranderd) {
                const input = f.koppel === 'gerecht' && f.gerecht_id ? { id, soort: 'gerecht' as const, gerecht_id: f.gerecht_id }
                    : f.koppel === 'voorraad' && f.inventory_id != null ? { id, soort: 'voorraad' as const, inventory_id: f.inventory_id, inkoop_per_stuk: n(f.inkoop_per_stuk) }
                        : { id, soort: 'geen' as const };
                const r = await koppelArtikel(input);
                if ('error' in r) { melding(r.error, 'error'); return; }
            }
            if (slotsGewijzigd || (!artikel && slotInvoer.length)) {
                const r = await zetSlots({ artikelId: id, slots: slotInvoer });
                if ('error' in r) { melding(r.error, 'error'); return; }
            }
            melding(artikel ? 'Artikel opgeslagen' : 'Artikel aangemaakt', 'success');
            await herlaad();
            onClose();
        } finally { setBezig(false); }
    }

    async function vraagAi() {
        if (!artikel) return;
        setAiBezig(true);
        try {
            const r = await vraagKoppelVoorstel({ id: artikel.id });
            if ('error' in r) { melding(r.error, 'error'); return; }
            if (r.data.fout) melding(r.data.fout, 'error');
            setVoorstel(r.data.voorstel);
            if (r.data.voorstel?.soort === 'geen') melding(r.data.voorstel.reden, 'info');
        } finally { setAiBezig(false); }
    }

    async function maakItem() {
        if (!nieuwItem) return;
        const r = await maakVoorraadItem(nieuwItem);
        if ('error' in r) { melding(r.error, 'error'); return; }
        const item = { id: r.data.id, naam: nieuwItem.naam, unit: nieuwItem.unit, current_stock: 0 };
        setLokaleVoorraad((v) => [...v, item]);
        setF((x) => ({ ...x, koppel: 'voorraad', inventory_id: item.id }));
        setNieuwItem(null);
        melding(`Voorraad-item ${item.naam} aangemaakt — leverancier en prijs zet je in Voorraad`, 'success');
    }

    const gerechtKeuze = f.gerecht_id ? gerechten.find((g) => g.id === f.gerecht_id) : null;
    const voorraadKeuze = f.inventory_id != null ? lokaleVoorraad.find((v) => v.id === f.inventory_id) : null;
    const gTreffers = zoekG.trim() ? gerechten.filter((g) => g.naam.toLowerCase().includes(zoekG.toLowerCase())).slice(0, 8) : [];
    const vTreffers = zoekV.trim() ? lokaleVoorraad.filter((v) => v.naam.toLowerCase().includes(zoekV.toLowerCase())).slice(0, 8) : [];
    const sub = artikel ? `${artikel.moment_soort === 'geen' ? 'Losse verkoop' : artikel.moment_soort === 'dag' ? 'Afhaaldag' : 'Afhaalmoment'}${artikel.prijs_cents != null ? ` · € ${toonEuro(artikel.prijs_cents)} ${artikel.eenheid}` : ' · prijs volgt'}` : 'Met de slug precies zoals op de website';

    return (
        <Drawer title={artikel?.naam || 'Nieuw artikel'} subtitle={sub} onClose={onClose} width={600}
            footer={<><Button icon={<Check size={14} />} loading={bezig} onClick={opslaan}>{artikel ? 'Opslaan' : 'Aanmaken'}</Button><Button variant="ghost" onClick={onClose}>Annuleren</Button></>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className="ws-eyebrow">Op de kassa</div>
                    {!artikel && <div className="field"><label>Slug</label><input value={f.slug} onChange={(e) => zet('slug', e.target.value.toLowerCase())} placeholder="kerst-box" /><div className="field-hint">Kleine letters, cijfers en koppeltekens — precies de slug van de website. Daarna vast.</div></div>}
                    <div className="field"><label>Naam</label><input value={f.naam} onChange={(e) => zet('naam', e.target.value)} /></div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <div className="field"><label>Eenheid</label><input value={f.eenheid} onChange={(e) => zet('eenheid', e.target.value)} placeholder="per persoon, per fles" /></div>
                        <div className="field"><label>Telt</label><div className="ws-keuze"><button type="button" aria-pressed={f.telt === 'personen'} onClick={() => zet('telt', 'personen')}>personen</button><button type="button" aria-pressed={f.telt === 'stuks'} onClick={() => zet('telt', 'stuks')}>stuks</button></div></div>
                        <div className="field"><label>Prijs incl. btw</label><input inputMode="decimal" value={f.prijs} onChange={(e) => zet('prijs', e.target.value)} placeholder="bijv. 6,50" /><div className="field-hint">Leeg = prijs volgt, dan niet te koop</div></div>
                        <div className="field"><label>Btw</label><div className="ws-keuze">{([0, 9, 21] as const).map((p) => <button key={p} type="button" aria-pressed={f.btw_pct === p} onClick={() => zet('btw_pct', p)}>{p}%</button>)}</div></div>
                        <div className="field"><label>Minimum</label><input inputMode="numeric" value={f.minimum} onChange={(e) => zet('minimum', e.target.value)} /></div>
                        <div className="field"><label>Maximum</label><input inputMode="numeric" value={f.maximum} onChange={(e) => zet('maximum', e.target.value)} /><div className="field-hint">Per order · leeg = geen maximum</div></div>
                    </div>
                    <div className="ws-chips">
                        <button type="button" className="ws-chip" aria-pressed={f.verzendbaar} onClick={() => zet('verzendbaar', !f.verzendbaar)}><Truck size={14} />Verzendbaar</button>
                        <button type="button" className="ws-chip" aria-pressed={f.gekoeld} onClick={() => zet('gekoeld', !f.gekoeld)}><Snowflake size={14} />Gekoeld</button>
                        <button type="button" className="ws-chip" aria-pressed={f.actief} onClick={() => zet('actief', !f.actief)}><Check size={14} />Actief</button>
                        <button type="button" className="ws-chip" aria-pressed={f.publiek} onClick={() => zet('publiek', !f.publiek)}><Eye size={14} />Publiek</button>
                    </div>
                    <div className="field"><label>Dieet</label><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {([['vegetarisch', 'vegetarisch'], ['veganistisch', 'veganistisch']] as const).map(([k, l]) => <button key={k} type="button" className="ws-pil" aria-pressed={f.dieet === k} onClick={() => zet('dieet', f.dieet === k ? null : k)}>{l}</button>)}
                    </div><div className="field-hint">Telt mee bij de keuken: een vegetarische box is een vegetarische gast</div></div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <div className="field"><label>Segment</label><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {(['bier', 'wijn', 'combi'] as const).map((k) => <button key={k} type="button" className="ws-pil" aria-pressed={f.segment === k} onClick={() => zet('segment', f.segment === k ? null : k)}>{k === 'combi' ? 'bier & wijn' : k}</button>)}
                        </div><div className="field-hint">Voor geschenkpakketten</div></div>
                        <div className="field"><label>18+</label><div className="ws-chips">
                            <button type="button" className="ws-chip" aria-pressed={f.alcohol} onClick={() => zet('alcohol', !f.alcohol)}><Wine size={14} />Bevat alcohol</button>
                        </div><div className="field-hint">Op order, mail en etiket. Volgt ook uit een product in een slot.</div></div>
                    </div>
                </section>

                <div className="ws-lijn" />

                <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className="ws-eyebrow">Afhalen & capaciteit</div>
                    <div className="field"><label>Afhalen</label><div className="ws-keuze">
                        <button type="button" aria-pressed={f.moment_soort === 'geen'} onClick={() => zet('moment_soort', 'geen')}>geen</button>
                        <button type="button" aria-pressed={f.moment_soort === 'moment'} onClick={() => zet('moment_soort', 'moment')}>moment uit de agenda</button>
                        <button type="button" aria-pressed={f.moment_soort === 'dag'} onClick={() => zet('moment_soort', 'dag')}>dag</button>
                    </div><div className="field-hint">Geen = meenemen of verzenden, komt in het vakje Vandaag</div></div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        {f.moment_soort !== 'geen' && <div className="field"><label>Groep</label><input value={f.moment_groep} onChange={(e) => zet('moment_groep', e.target.value)} placeholder="agenda, kerst-box" /><div className="field-hint">Uit welke momenten de klant kiest</div></div>}
                        <div className="field"><label>Kassa-voorraad</label><input inputMode="numeric" value={f.voorraad} onChange={(e) => zet('voorraad', e.target.value)} /><div className="field-hint">Leeg = onbeperkt</div></div>
                        <div className="field full" style={{ gridColumn: '1 / -1' }}><label>Tekst op de bon</label><input value={f.afhaalmoment_tekst} onChange={(e) => zet('afhaalmoment_tekst', e.target.value)} placeholder="Afhalen op 23 of 24 december" /></div>
                    </div>
                    <div className="field"><label>Capaciteit telt</label><div className="ws-keuze">
                        <button type="button" aria-pressed={f.capaciteit_soort === 'regel'} onClick={() => zet('capaciteit_soort', 'regel')}>per regel</button>
                        <button type="button" aria-pressed={f.capaciteit_soort === 'aantal'} onClick={() => zet('capaciteit_soort', 'aantal')}>per aantal</button>
                        <button type="button" aria-pressed={f.capaciteit_soort === 'dozen'} onClick={() => zet('capaciteit_soort', 'dozen')}>in dozen</button>
                    </div><div className="field-hint">Per regel: een plank is één plank, hoe groot ook. In dozen: voor de Kerst-Box.</div></div>
                    {f.capaciteit_soort === 'dozen' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                            <div className="field"><label>Kleine doos t/m</label><input inputMode="numeric" value={f.doos_klein_max} onChange={(e) => zet('doos_klein_max', e.target.value)} placeholder="3" /><div className="field-hint">personen</div></div>
                            <div className="field"><label>Grote doos</label><input inputMode="numeric" value={f.doos_groot} onChange={(e) => zet('doos_groot', e.target.value)} placeholder="5" /><div className="field-hint">personen per grote doos</div></div>
                        </div>
                    )}
                    {f.telt === 'personen' && (
                        <div className="ws-chips">
                            <button type="button" className="ws-chip" aria-pressed={f.schaal_verdeling} onClick={() => zet('schaal_verdeling', !f.schaal_verdeling)}><Package size={14} />Personen over schalen verdelen</button>
                        </div>
                    )}
                    {f.schaal_verdeling && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14 }}>
                            <div className="field"><label>Kleine schaal t/m</label><input inputMode="numeric" value={f.doos_klein_max} onChange={(e) => zet('doos_klein_max', e.target.value)} placeholder="3" /><div className="field-hint">2–3 personen</div></div>
                            <div className="field"><label>Grote schaal</label><input inputMode="numeric" value={f.doos_groot} onChange={(e) => zet('doos_groot', e.target.value)} placeholder="5" /><div className="field-hint">4–5, nooit 1</div></div>
                            <div className="field"><label>Verpakking klein</label><input inputMode="decimal" value={f.verpakking_klein} onChange={(e) => zet('verpakking_klein', e.target.value)} placeholder="2,25" /><div className="field-hint">incl. btw, marge</div></div>
                            <div className="field"><label>Verpakking groot</label><input inputMode="decimal" value={f.verpakking_groot} onChange={(e) => zet('verpakking_groot', e.target.value)} placeholder="3,00" /><div className="field-hint">incl. btw, marge</div></div>
                        </div>
                    )}
                </section>

                <div className="ws-lijn" />

                <SlotsSectie slotForms={slotForms} producten={producten} productOpId={productOpId} telt={f.telt} prijsCents={leesEuro(f.prijs) ?? null} btwPct={f.btw_pct} btw21={f.btw21} verpakking={{ klein: leesEuro(f.verpakking_klein) ?? null, groot: leesEuro(f.verpakking_groot) ?? null }}
                    onChange={(sl) => { setSlotForms(sl); setSlotsGewijzigd(true); }} onBtw21={(v) => zet('btw21', v)} onNieuwProduct={(i) => setNieuwProductVoor(i)} />
                {nieuwProductVoor != null && (
                    <ProductDrawer product={null} onClose={() => setNieuwProductVoor(null)} herlaad={herlaad} melding={melding}
                        onAangemaakt={(id) => { setSlotForms((sl) => sl.map((x, i) => (i === nieuwProductVoor ? { ...x, standaard_product_id: id } : x))); setSlotsGewijzigd(true); }} />
                )}

                <div className="ws-lijn" />

                <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="ws-sectie-kop">Wat maakt of koopt je hiervoor?</div>
                    <div className="ws-onderschrift" style={{ marginTop: -6 }}>Zonder koppeling komt een order in geen kookbord en geen inkoop.</div>
                    {artikel && !voorstel && f.koppel === 'geen' && (
                        <Button variant="ghost" size="sm" icon={<Sparkles size={13} />} loading={aiBezig} onClick={vraagAi} style={{ alignSelf: 'flex-start' }}>Vraag de AI om een voorstel</Button>
                    )}
                    {voorstel?.soort === 'geen' && <div className="ws-tip" style={{ color: 'var(--ws-warn)' }}><Sparkles size={13} />{voorstel.reden}</div>}

                    <div className="ws-kies" role="radio" aria-checked={f.koppel === 'voorraad'} onClick={() => zet('koppel', 'voorraad')}>
                        <span className="ws-radio" />
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div><div style={{ fontSize: 14, fontWeight: 600 }}>Dit koop je in</div>
                                {voorstel?.soort === 'voorraad' ? <div className="ws-tip" style={{ color: 'var(--brand-gold)', marginTop: 3 }}><Sparkles size={12} />Voorstel van de AI: {voorstel.reden || voorstel.naam}</div> : <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>Bier, saus, noten — een voorraad-item dat je doorverkoopt.</div>}
                            </div>
                            {f.koppel === 'voorraad' && (
                                <>
                                    {voorraadKeuze ? (
                                        <div className="ws-zoek" style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); zet('inventory_id', null); }}>
                                            <span style={{ color: 'var(--muted)', display: 'flex' }}><Package size={15} /></span>
                                            <div style={{ flex: 1, fontSize: 14 }}>{voorraadKeuze.naam} <span style={{ color: 'var(--muted)', fontSize: 12 }}>· voorraad {voorraadKeuze.current_stock ?? 0} {voorraadKeuze.unit ?? ''}</span></div>
                                            <span style={{ color: 'var(--muted)', display: 'flex' }}><Search size={14} /></span>
                                        </div>
                                    ) : (
                                        <div onClick={(e) => e.stopPropagation()}>
                                            <div className="ws-zoek"><Search size={14} style={{ color: 'var(--muted)' }} /><input autoFocus placeholder="Zoek voorraad-item…" value={zoekV} onChange={(e) => setZoekV(e.target.value)} /></div>
                                            {vTreffers.length > 0 && <div className="ws-zoek-lijst" style={{ marginTop: 6 }}>{vTreffers.map((v) => <button key={v.id} type="button" onClick={() => { zet('inventory_id', v.id); setZoekV(''); }}><span>{v.naam}</span><span style={{ color: 'var(--muted)' }}>{v.current_stock ?? 0} {v.unit ?? ''}</span></button>)}</div>}
                                            {zoekV.trim() && vTreffers.length === 0 && <div className="ws-leeg" style={{ padding: '8px 2px' }}>Niets gevonden — maak het item hieronder aan.</div>}
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }} onClick={(e) => e.stopPropagation()}>
                                        <span style={{ color: 'var(--muted)' }}>Per besteld stuk:</span>
                                        <input inputMode="decimal" value={f.inkoop_per_stuk} onChange={(e) => zet('inkoop_per_stuk', e.target.value)} style={{ width: 60, height: 36, padding: '0 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', font: '500 13px var(--font-mono)', textAlign: 'right' }} />
                                        <span>{voorraadKeuze?.unit ?? 'stuk'}</span>
                                    </div>
                                    {nieuwItem ? (
                                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto auto', gap: 8, alignItems: 'end' }} onClick={(e) => e.stopPropagation()}>
                                            <div className="field"><label>Naam</label><input autoFocus value={nieuwItem.naam} onChange={(e) => setNieuwItem({ ...nieuwItem, naam: e.target.value })} placeholder="bier Drenthe" /></div>
                                            <div className="field"><label>Eenheid</label><input value={nieuwItem.unit} onChange={(e) => setNieuwItem({ ...nieuwItem, unit: e.target.value })} placeholder="fles" /></div>
                                            <Button size="sm" icon={<Plus size={13} />} onClick={maakItem}>Aanmaken</Button>
                                            <Button size="sm" variant="ghost" onClick={() => setNieuwItem(null)}>Laat maar</Button>
                                        </div>
                                    ) : (
                                        <button type="button" className="link-btn" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--muted)' }} onClick={(e) => { e.stopPropagation(); setNieuwItem({ naam: f.naam, unit: 'stuk' }); }}><Plus size={13} />Nieuw voorraad-item</button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    <div className="ws-kies" role="radio" aria-checked={f.koppel === 'gerecht'} onClick={() => zet('koppel', 'gerecht')}>
                        <span className="ws-radio" />
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div><div style={{ fontSize: 14, fontWeight: 600 }}>De keuken maakt dit</div>
                                {voorstel?.soort === 'gerecht' ? <div className="ws-tip" style={{ color: 'var(--brand-gold)', marginTop: 3 }}><Sparkles size={12} />Voorstel van de AI: {voorstel.reden || voorstel.naam}</div> : <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>Kies een gerecht; dan staat het op het kookbord van het vakje.</div>}
                            </div>
                            {f.koppel === 'gerecht' && (
                                gerechtKeuze ? (
                                    <div className="ws-zoek" style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); zet('gerecht_id', null); }}>
                                        <span style={{ color: 'var(--muted)', display: 'flex' }}><ChefHat size={15} /></span>
                                        <div style={{ flex: 1, fontSize: 14 }}>{gerechtKeuze.naam}</div>
                                        <span style={{ color: 'var(--muted)', display: 'flex' }}><Search size={14} /></span>
                                    </div>
                                ) : (
                                    <div onClick={(e) => e.stopPropagation()}>
                                        <div className="ws-zoek"><Search size={14} style={{ color: 'var(--muted)' }} /><input autoFocus placeholder="Zoek gerecht…" value={zoekG} onChange={(e) => setZoekG(e.target.value)} /></div>
                                        {gTreffers.length > 0 && <div className="ws-zoek-lijst" style={{ marginTop: 6 }}>{gTreffers.map((g) => <button key={g.id} type="button" onClick={() => { zet('gerecht_id', g.id); setZoekG(''); }}><span>{g.naam}</span></button>)}</div>}
                                        {zoekG.trim() && gTreffers.length === 0 && <div className="ws-leeg" style={{ padding: '8px 2px' }}>Geen gerecht met die naam. Maak het eerst aan in Gerechten — hier wordt niets verzonnen.</div>}
                                    </div>
                                )
                            )}
                        </div>
                    </div>

                    <div className="ws-kies" role="radio" aria-checked={f.koppel === 'geen'} onClick={() => zet('koppel', 'geen')}>
                        <span className="ws-radio" />
                        <div><div style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted-light)' }}>Nog geen koppeling</div><div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>De keuken en de inkoop zien dan alleen aantallen.</div></div>
                    </div>
                </section>
            </div>
        </Drawer>
    );
}


/* ── Het template: slots met een product ───────────────────────────────────── */

const SLOT_TYPE_HINT: Partial<Record<ProductType, string>> = { bier: 'fles', wijn: 'fles', worst: 'stuk', amandelen: 'gram', crackers: 'bakje', marmelade: 'pot', doos: 'doos' };

function SlotsSectie({ slotForms, producten, productOpId, telt, prijsCents, btwPct, btw21, verpakking, onChange, onBtw21, onNieuwProduct }: {
    slotForms: SlotForm[]; producten: ProductRij[]; productOpId: Map<string, ProductRij>; telt: 'stuks' | 'personen';
    prijsCents: number | null; btwPct: number; btw21: string; verpakking: { klein: number | null; groot: number | null };
    onChange: (sl: SlotForm[]) => void; onBtw21: (v: string) => void; onNieuwProduct: (i: number) => void;
}) {
    const zet = (i: number, patch: Partial<SlotForm>) => onChange(slotForms.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    const perPersoon = telt === 'personen';
    const nieuwSlot = (): SlotForm => ({ id: null, slot_type: perPersoon ? 'vleeswaar' : 'bier', naam: '', hoeveelheid: '1', eenheid: perPersoon ? 'gram' : 'stuk', per: perPersoon ? 'persoon' : 'stuk', standaard_product_id: null });
    const leeg = slotForms.filter((x) => !x.standaard_product_id).length;

    /* De marge-regel uit de opdracht, alleen met ingevulde prijzen. */
    const componenten: Component[] = slotForms.map((sl) => ({ product_id: sl.standaard_product_id, slot_type: sl.slot_type, naam: sl.naam, hoeveelheid: Number(sl.hoeveelheid.replace(',', '.')) || 0, eenheid: sl.eenheid }));
    const prodMap = new Map<string, Product>(producten.map((p) => [p.id, { ...p, voorraad: p.voorraad, actief: p.actief }]));
    let winkelwaarde = 0, inkoop = 0, winkelBekend = 0, inkoopBekend = 0;
    for (const c of componenten) {
        const p = c.product_id ? productOpId.get(c.product_id) : null;
        if (!p) continue;
        const w = winkelwaardeCenten(p, c.hoeveelheid);
        const i = inkoopwaardeCenten(p, c.hoeveelheid);
        if (w != null) { winkelwaarde += w; winkelBekend += 1; }
        if (i != null) { inkoop += i; inkoopBekend += 1; }
    }
    const alleBekend = slotForms.length > 0 && slotForms.every((x) => x.standaard_product_id);
    const verdeling = prijsCents != null && !perPersoon ? btwVerdeling({ btw_pct: btwPct, btw_verdeling: btw21.trim() === '' ? null : { '21': Number(btw21), '9': 100 - Number(btw21) } }, componenten, prodMap, prijsCents) : null;
    const btwTotaal = verdeling ? Object.values(verdeling.btw).reduce((s, v) => s + v, 0) : null;
    const omzetExcl = prijsCents != null && btwTotaal != null ? prijsCents - btwTotaal : null;
    const verpak = verpakking.groot ?? verpakking.klein ?? 0;
    const kosten = inkoop + (perPersoon ? 0 : 0) + Math.round(verpak / 1.21);
    const kostenPct = omzetExcl ? Math.round((kosten / omzetExcl) * 1000) / 10 : null;

    return (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="ws-sectie-kop">Wat zit erin?</div>
            <div className="ws-onderschrift" style={{ marginTop: -6 }}>{perPersoon ? 'Per persoon, in grammen — de receptuur van de plank. Hieruit komt de productielijst.' : 'Per pakket. Elk slot moet een product hebben, anders is het pakket niet verkoopbaar. Vast pakket: geen wissels (fase 2).'}</div>
            {slotForms.length > 0 && leeg > 0 && <div className="ws-tip" style={{ color: 'var(--ws-warn)' }}><Sparkles size={13} />{leeg} {leeg === 1 ? 'slot' : 'slots'} zonder product — kies er een, of maak het product aan.</div>}
            {slotForms.length > 0 && (
                <div className="ws-slots-grid" style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted-weak)' }}>
                    <span>Type</span><span>Naam op de lijst</span><span>Hoeveel</span><span>Eenheid</span><span>Per</span><span>Product</span><span />
                </div>
            )}
            {slotForms.map((sl, i) => {
                const keuze = producten.filter((p) => p.actief && (p.type === sl.slot_type || sl.slot_type === 'overig'));
                const gekozen = sl.standaard_product_id ? productOpId.get(sl.standaard_product_id) : null;
                return (
                    <div key={sl.id ?? `n${i}`} className="ws-slots-grid">
                        <select value={sl.slot_type} onChange={(e) => zet(i, { slot_type: e.target.value as ProductType })}>{PRODUCT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                        <input value={sl.naam} placeholder={SLOT_TYPE_HINT[sl.slot_type] ? `${sl.slot_type} (${SLOT_TYPE_HINT[sl.slot_type]})` : sl.slot_type} onChange={(e) => zet(i, { naam: e.target.value })} />
                        <input inputMode="decimal" value={sl.hoeveelheid} onChange={(e) => zet(i, { hoeveelheid: e.target.value })} style={{ textAlign: 'right' }} />
                        <select value={sl.eenheid} onChange={(e) => zet(i, { eenheid: e.target.value as 'stuk' | 'gram' })}><option value="stuk">stuk</option><option value="gram">gram</option></select>
                        <select value={sl.per} onChange={(e) => zet(i, { per: e.target.value as 'stuk' | 'persoon' })}><option value="stuk">pakket</option><option value="persoon">persoon</option></select>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
                            <select value={sl.standaard_product_id ?? ''} onChange={(e) => zet(i, { standaard_product_id: e.target.value || null })} style={{ flex: 1, minWidth: 0, borderColor: sl.standaard_product_id ? undefined : 'rgba(245,158,11,.5)' }}>
                                <option value="">— nog geen product —</option>
                                {gekozen && !keuze.some((p) => p.id === gekozen.id) && <option value={gekozen.id}>{gekozen.naam}</option>}
                                {keuze.map((p) => <option key={p.id} value={p.id}>{p.naam}{p.winkelprijs_incl_cents != null ? ` · € ${toonEuro(p.winkelprijs_incl_cents)}` : ''}</option>)}
                            </select>
                            <button type="button" className="mr-icon-btn-sm" style={{ width: 32, height: 32, flexShrink: 0 }} title="Nieuw product" onClick={() => onNieuwProduct(i)}><Plus size={13} /></button>
                        </div>
                        <button type="button" className="mr-icon-btn-sm" style={{ width: 32, height: 32 }} title="Slot weg" onClick={() => onChange(slotForms.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
                    </div>
                );
            })}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Button variant="ghost" size="sm" icon={<Plus size={13} />} onClick={() => onChange([...slotForms, nieuwSlot()])}>Slot toevoegen</Button>
                {slotForms.length > 1 && <span style={{ fontSize: 12, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><GripVertical size={12} />volgorde = volgorde op de lijst</span>}
            </div>

            {slotForms.length > 0 && !perPersoon && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 6 }}>
                    <div className="field"><label>Btw-verdeling: deel tegen 21 %</label><input inputMode="decimal" value={btw21} onChange={(e) => onBtw21(e.target.value)} placeholder={verdeling && btw21.trim() === '' ? `${Math.round(((verdeling.delen['21'] ?? 0) / (prijsCents || 1)) * 1000) / 10} (naar rato)` : 'naar rato'} /><div className="field-hint">Leeg = naar rato van de winkelwaarde van de producten. [BEVESTIGEN door de boekhouder]</div></div>
                    <div className="field"><label>Rekenbasis</label>
                        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, paddingTop: 6 }}>
                            {winkelBekend > 0 && <>Winkelwaarde inhoud: <b className="ws-mono" style={{ color: prijsCents != null && winkelwaarde < prijsCents ? 'var(--ws-vuur)' : 'var(--text)' }}>€ {toonEuro(winkelwaarde)}</b>{winkelBekend < slotForms.length ? ` (${slotForms.length - winkelBekend} zonder prijs)` : ''}{prijsCents != null && alleBekend && winkelbekendTekst(winkelwaarde, prijsCents)}<br /></>}
                            {inkoopBekend > 0 && omzetExcl != null && <>Inkoop + verpakking: <b className="ws-mono" style={{ color: kostenPct != null && kostenPct > 65 ? 'var(--ws-vuur)' : 'var(--text)' }}>€ {toonEuro(kosten)}</b> = {kostenPct}% van € {toonEuro(omzetExcl)} excl. btw{inkoopBekend < slotForms.length ? ` (${slotForms.length - inkoopBekend} zonder inkoopprijs)` : ''} · richtlijn ≤ 65 %<br /></>}
                            {verdeling && <>Btw: {Object.entries(verdeling.btw).map(([p, c]) => `${p}% € ${toonEuro(c)}`).join(' · ')}</>}
                            {winkelBekend === 0 && inkoopBekend === 0 && 'Vul prijzen bij de producten in voor de marge.'}
                        </div>
                    </div>
                </div>
            )}
            {perPersoon && slotForms.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Per persoon: {hoeveelheidTekst(componenten.reduce((s, c) => s + (c.eenheid === 'gram' ? c.hoeveelheid : 0), 0), 'gram')} in totaal{inkoopBekend > 0 ? ` · inkoop € ${toonEuro(inkoop)} p.p. (${inkoopBekend} van ${slotForms.length} met prijs)` : ''}.</div>
            )}
        </section>
    );
}

function winkelbekendTekst(winkelwaarde: number, prijs: number): string {
    return winkelwaarde >= prijs ? ' · ≥ pakketprijs ✓' : ` · onder de pakketprijs € ${toonEuro(prijs)}`;
}
