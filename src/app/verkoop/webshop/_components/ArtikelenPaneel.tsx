'use client';

/**
 * Artikelen — wat de website verkoopt, en wat de keuken daarvoor maakt of
 * jij daarvoor inkoopt. Ontwerp: artboards 05–06. Plan §3.2.
 *
 * Een AI-voorstel is een vraag, nooit een feit: het staat in amber met
 * "zo doen?" en wordt pas een koppeling als jij Ja klikt.
 */
import { useEffect, useMemo, useState } from 'react';
import { ChefHat, Check, Eye, Package, Plus, Search, Snowflake, Sparkles, Truck, WandSparkles } from 'lucide-react';
import Button from '@/components/Button';
import Drawer from './Drawer';
import { leesEuro, toonEuro, type ArtikelRij } from '../_lib/vakjes';
import { koppelArtikel, koppelronde, maakArtikel, maakVoorraadItem, vraagKoppelVoorstel, werkArtikelBij, zetArtikelActief } from '../actions';

type Melding = (tekst: string, soort?: 'success' | 'error' | 'info') => void;
export interface GerechtKeuze { id: string; naam: string }
export interface VoorraadKeuze { id: number; naam: string; unit: string | null; current_stock: number | null }

interface Props {
    artikelen: ArtikelRij[];
    gerechten: GerechtKeuze[];
    voorraad: VoorraadKeuze[];
    herlaad: () => Promise<void>;
    melding: Melding;
}

type Filter = 'alles' | 'voorstellen' | 'ongekoppeld';

const gekoppeld = (a: ArtikelRij) => Boolean(a.gerecht_id || a.inventory_id);
const heeftVoorstel = (a: ArtikelRij) => !gekoppeld(a) && a.koppel_voorstel != null && a.koppel_voorstel.soort !== 'geen';

export default function ArtikelenPaneel({ artikelen, gerechten, voorraad, herlaad, melding }: Props) {
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
                        <span style={{ fontSize: 13 }}>{a.prijs_cents == null ? <span style={{ color: 'var(--muted-weak)' }}>prijs volgt</span> : <><span className="ws-mono">€ {toonEuro(a.prijs_cents)}</span> <span style={{ color: 'var(--muted)' }}>{a.eenheid.replace(/^per persoon$/, 'p.p.')}</span></>}</span>
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
                <ArtikelDrawer artikel={open === 'nieuw' ? null : open} gerechten={gerechten} voorraad={voorraad} onClose={() => setOpenId(null)} herlaad={herlaad} melding={melding} />
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
    };
}

function ArtikelDrawer({ artikel, gerechten, voorraad, onClose, herlaad, melding }: { artikel: ArtikelRij | null; gerechten: GerechtKeuze[]; voorraad: VoorraadKeuze[]; onClose: () => void; herlaad: () => Promise<void>; melding: Melding }) {
    const [f, setF] = useState<Form>(() => vanArtikel(artikel));
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
        if (prijs === undefined) { melding('Dat is geen geldig bedrag.', 'error'); return; }
        const velden = {
            naam: f.naam, eenheid: f.eenheid, telt: f.telt, prijs_cents: prijs, btw_pct: f.btw_pct,
            minimum: Number(f.minimum) || 1, maximum: n(f.maximum), verzendbaar: f.verzendbaar, gekoeld: f.gekoeld,
            moment_soort: f.moment_soort, moment_groep: f.moment_groep.trim() || null, afhaalmoment_tekst: f.afhaalmoment_tekst.trim() || null,
            capaciteit_soort: f.capaciteit_soort, doos_klein_max: n(f.doos_klein_max), doos_groot: n(f.doos_groot), voorraad: n(f.voorraad),
            actief: f.actief, publiek: f.publiek, dieet: f.dieet,
        };
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
                        <div className="field"><label>Prijs incl. btw</label><input inputMode="decimal" value={f.prijs} onChange={(e) => zet('prijs', e.target.value)} placeholder="23,50" /><div className="field-hint">Leeg = prijs volgt, dan niet te koop</div></div>
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
                </section>

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
