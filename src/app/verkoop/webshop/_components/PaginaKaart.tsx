'use client';

/**
 * De productkaart: alles wat de website van één bier, wijn of worst laat zien
 * (blok C5, 3 oktober 2026). Plan: docs/OPDRACHT-BBQ-ARCHITECT-CATALOGUS.md.
 *
 * Van boven naar beneden: wat er nog mist · de foto (uit ChatGPT, hier naar
 * drie breedtes) · de AI die opzoekt en voorstelt · de velden · de
 * proefkaart. Onderaan: Opslaan, Bekijk op de site (voorbeeldlink) en Zet op
 * de site / Haal van de site. Niets gaat zonder klik naar de website; prijs,
 * allergenen en ingrediënten vul je altijd zelf in.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Check, Copy, ExternalLink, Globe, ImagePlus, Sparkles, Upload, X } from 'lucide-react';
import Button from '@/components/Button';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { ontbreektVoorSite, ontbreektVoorVerkoop, soortVanType, SMAKEN, WIJNTYPES, type Paginasoort, type Proefkaart } from '@/lib/winkel/productsoorten';
import Drawer from './Drawer';
import { leesEuro, toonEuro, type ArtikelRij, type ProductRij } from '../_lib/vakjes';
import { etiketVoorAi, maakVersies } from '../_lib/fotoverwerking';
import { chatgptOpdracht } from '../_lib/fotorecept';
import { bewaarPagina, keurGoed, voorbeeldLink, zetOpSite, zetPaginaFoto } from '../catalogus-actions';

type Melding = (tekst: string, soort?: 'success' | 'error' | 'info') => void;

interface Props {
    product: ProductRij;
    artikel: ArtikelRij | null;
    onClose: () => void;
    herlaad: () => Promise<void>;
    melding: Melding;
}

/* ── Velden per soort ─────────────────────────────────────────────────────── */

type Veldsoort = 'tekst' | 'lang' | 'lijst' | 'vink' | 'keuze';
interface Veld { sleutel: string; label: string; soort: Veldsoort; hint?: string; keuzes?: readonly string[] }

const VELDEN: Record<Paginasoort, Veld[]> = {
    bier: [
        { sleutel: 'brouwerij', label: 'Brouwerij', soort: 'tekst' },
        { sleutel: 'stijl', label: 'Stijl', soort: 'tekst', hint: 'Kleine letters, zoals op het etiket: "tripel", "West Coast IPA". Bepaalt de groep op /bier.' },
    ],
    wijn: [
        { sleutel: 'producent', label: 'Producent', soort: 'tekst' },
        { sleutel: 'jaargang', label: 'Jaargang', soort: 'tekst', hint: '"2024" of "n.v."' },
        { sleutel: 'wijnType', label: 'Type', soort: 'keuze', keuzes: WIJNTYPES },
        { sleutel: 'land', label: 'Land', soort: 'tekst' },
        { sleutel: 'regio', label: 'Regio', soort: 'tekst' },
        { sleutel: 'appellatie', label: 'Appellatie', soort: 'tekst' },
        { sleutel: 'druiven', label: 'Druiven', soort: 'lijst', hint: 'Met komma\'s. Op de site pas als je ze goedkeurt.' },
        { sleutel: 'inhoud', label: 'Inhoud', soort: 'tekst', hint: '"0,75 L"' },
        { sleutel: 'stijl', label: 'Stijl', soort: 'tekst', hint: '2–4 woorden: "Fris en droog"' },
        { sleutel: 'smaak', label: 'Smaak', soort: 'lang' },
        { sleutel: 'omschrijving', label: 'Omschrijving', soort: 'lang' },
        { sleutel: 'pastBij', label: 'Past bij', soort: 'tekst' },
        { sleutel: 'serveertemperatuur', label: 'Serveertemperatuur', soort: 'tekst', hint: '"8–10 °C"' },
        { sleutel: 'biologisch', label: 'Biologisch', soort: 'vink' },
        { sleutel: 'huiswijn', label: 'Huiswijn', soort: 'vink' },
    ],
    vlees: [
        { sleutel: 'soort', label: 'Groep op /vlees', soort: 'keuze', keuzes: ['vers', 'droge-worst'] },
        { sleutel: 'fotoAlt', label: 'Wat staat er op de foto', soort: 'tekst', hint: 'Voor wie de foto niet ziet: "Een droge worst, deels in plakjes, op een eikenhouten plank."' },
        { sleutel: 'alleenKaartformaat', label: 'Foto alleen klein tonen', soort: 'vink' },
    ],
};

const LABEL: Record<Paginasoort, string> = { bier: 'Bier', wijn: 'Wijn', vlees: 'Vlees en worst' };

const naarLijst = (s: string): string[] => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
const uitLijst = (l: unknown): string => (Array.isArray(l) ? l.join(', ') : '');
const getal = (s: string): number | null => {
    const t = s.replace(',', '.').replace('%', '').trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
};
const fotoUrl = (basis: string, w: number) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/winkel-fotos/${basis}-${w}.webp`;

interface Form {
    naam: string; slug: string; prijs: string; eenheid: string; alcohol: string; ean: string;
    allergenen: string; ingredienten: string; bewaren: string; lekker_bij: string;
    kenmerken: Record<string, unknown>;
}

function vanProduct(p: ProductRij, a: ArtikelRij | null): Form {
    return {
        naam: p.naam, slug: p.slug ?? '', prijs: toonEuro(a?.prijs_cents ?? p.winkelprijs_incl_cents), eenheid: a?.eenheid ?? 'per stuk',
        alcohol: p.alcohol_pct == null ? '' : String(p.alcohol_pct).replace('.', ','), ean: p.ean ?? '',
        allergenen: uitLijst(p.allergenen), ingredienten: uitLijst(p.ingredienten), bewaren: p.bewaren ?? '', lekker_bij: p.lekker_bij ?? '',
        kenmerken: { ...(p.kenmerken ?? {}) },
    };
}

/* ── Wat de AI teruggeeft ─────────────────────────────────────────────────── */

interface AiVoorstel {
    naam: string | null;
    alcohol_pct: number | null;
    kenmerken: Record<string, unknown>;
    proefkaart: Proefkaart | null;
    lekker_bij: string | null;
    hints: { etiket: string | null; prijzen: { winkel: string; prijs: number; url: string }[] };
    twijfel: string[];
    geweerd: string[];
}
interface AiAntwoord {
    voorstel: AiVoorstel;
    bronnen: { url: string; titel: string }[];
    tekstcontrole: { status: 'goed' } | { status: 'fout'; fouten: { veld: string; woord: string }[] } | { status: 'onbekend'; reden: string };
    usage: { cost_eur_cents: number };
}

function waarde(v: unknown): string {
    if (v == null || v === '') return '—';
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'boolean') return v ? 'ja' : 'nee';
    if (typeof v === 'object') {
        const o = v as { soort?: string; cl?: number };
        if (o.soort && o.cl) return `${o.soort} ${String(o.cl).replace('.', ',')} cl`;
        return JSON.stringify(v);
    }
    return String(v);
}

function seinZin(sein: string | null | undefined): string {
    if (sein === 'verstuurd') return ' De site bouwt opnieuw; over een paar minuten staat het erop.';
    if (sein === 'geen-hook') return ' De site neemt het mee bij de volgende build (de deploy hook is nog niet ingesteld).';
    if (sein === 'mislukt') return ' De site kon niet gewaarschuwd worden; hij neemt het mee bij de volgende build.';
    return '';
}

/* ── De kaart ─────────────────────────────────────────────────────────────── */

export default function PaginaKaart({ product: p, artikel, onClose, herlaad, melding }: Props) {
    const soort = soortVanType(p.type) as Paginasoort;
    const { organization } = useOrg();
    const [f, setF] = useState<Form>(() => vanProduct(p, artikel));
    const [bezig, setBezig] = useState<string | null>(null);
    const [ai, setAi] = useState<AiAntwoord | null>(null);
    const [etiketten, setEtiketten] = useState<File[]>([]);
    const [aiExtra, setAiExtra] = useState('');
    const [fotoMelding, setFotoMelding] = useState<string | null>(null);
    const [bronnen, setBronnen] = useState<{ url: string; titel: string }[] | undefined>(undefined);
    const live = p.pagina_status === 'live';

    const zet = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
    const zetK = (k: string, v: unknown) => setF((x) => ({ ...x, kenmerken: { ...x.kenmerken, [k]: v } }));

    /* Wat er nog mist, live uit het formulier — dezelfde regels als de database-poort en de website. */
    const rijNu = useMemo(() => ({
        type: p.type, slug: f.slug || null, foto: p.foto ?? null, allergenen: naarLijst(f.allergenen), ingredienten: naarLijst(f.ingredienten),
        bewaren: f.bewaren || null, alcohol: soort !== 'vlees' && (getal(f.alcohol) ?? 1) > 0.5, alcohol_pct: getal(f.alcohol), kenmerken: f.kenmerken,
    }), [f, p.type, p.foto, soort]);
    const mistSite = ontbreektVoorSite(rijNu);
    const mistVerkoop = ontbreektVoorVerkoop(rijNu, { prijs_cents: leesEuro(f.prijs) ?? null });

    async function opslaan(stil = false): Promise<boolean> {
        const prijs = leesEuro(f.prijs);
        if (prijs === undefined) { melding('Dat is geen geldig bedrag.', 'error'); return false; }
        const pct = getal(f.alcohol);
        if (Number.isNaN(pct)) { melding('Alcohol: een getal, zoals 8,5.', 'error'); return false; }
        setBezig('opslaan');
        try {
            const r = await bewaarPagina({
                id: p.id, naam: f.naam, slug: f.slug, kenmerken: f.kenmerken, alcohol_pct: pct,
                allergenen: naarLijst(f.allergenen), ingredienten: naarLijst(f.ingredienten), bewaren: f.bewaren || null,
                lekker_bij: f.lekker_bij || null, ean: f.ean.trim() || null, prijs_cents: prijs, eenheid: f.eenheid, bronnen,
            });
            if ('error' in r) { melding(r.error, 'error'); return false; }
            const tc = r.data.tekstcontrole;
            if (tc.status === 'fout') melding(`Opgeslagen, maar deze woorden mogen niet op de site: ${tc.fouten.map((x) => `"${x.woord}"`).join(', ')}.`, 'error');
            else if (!stil) melding(`Opgeslagen.${seinZin(r.data.sein)}`, 'success');
            await herlaad();
            return true;
        } finally { setBezig(null); }
    }

    /* ── Foto ── */
    async function kiesFoto(bestand: File | undefined) {
        if (!bestand || !organization) return;
        if (!f.slug) { melding('Geef het product eerst een adres (slug).', 'error'); return; }
        setBezig('foto');
        setFotoMelding(null);
        try {
            const { check, versies } = await maakVersies(bestand);
            if (check.breedte < 640) { setFotoMelding(check.waarschuwing); return; }
            const basis = `${organization.id}/${f.slug}-${Date.now()}`;
            for (const v of versies) {
                const { error } = await supabase!.storage.from('winkel-fotos').upload(`${basis}-${v.w}.webp`, v.blob, { contentType: 'image/webp', upsert: true });
                if (error) { melding(`Uploaden mislukt: ${error.message}`, 'error'); return; }
            }
            const grootste = versies[versies.length - 1]!;
            const r = await zetPaginaFoto({ id: p.id, foto: { basis, breedte: grootste.w, hoogte: grootste.h, maten: versies.map((v) => ({ w: v.w, h: v.h })), formaten: ['webp'] } });
            if ('error' in r) { melding(r.error, 'error'); return; }
            setFotoMelding(check.waarschuwing);
            melding(`Foto opgeslagen.${seinZin(r.data.sein)}`, 'success');
            await herlaad();
        } catch (e) {
            melding(e instanceof Error ? e.message : 'De foto kon niet verwerkt worden.', 'error');
        } finally { setBezig(null); }
    }

    async function kopieerOpdracht() {
        const liggend = soort === 'vlees';
        try {
            await navigator.clipboard.writeText(chatgptOpdracht(soort, liggend));
            melding('De ChatGPT-opdracht staat op je klembord. Upload er een bestaande foto van deze sectie bij als stijlvoorbeeld (foto 1) en de foto van het product (foto 2).', 'info');
        } catch {
            melding('Kopiëren lukte niet in deze browser.', 'error');
        }
    }

    /* ── AI ── */
    async function vraagAi() {
        if (!(await opslaan(true))) return;
        setBezig('ai');
        setAi(null);
        try {
            const fotos = await Promise.all(etiketten.slice(0, 2).map(etiketVoorAi));
            const r = await fetch('/api/winkel/product-invullen', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ productId: p.id, fotos, ean: f.ean.trim() || null, extra: aiExtra.trim() || null }),
            });
            const d = await r.json();
            if (!r.ok) { melding(d.error ?? 'De AI kon het niet invullen.', 'error'); return; }
            setAi(d as AiAntwoord);
        } catch {
            melding('De AI is niet bereikbaar. Vul het zelf in of probeer het later.', 'error');
        } finally { setBezig(null); }
    }

    function neemOver(veld: string) {
        if (!ai) return;
        const v = ai.voorstel;
        if (veld === 'naam' && v.naam) zet('naam', v.naam);
        else if (veld === 'alcohol_pct' && v.alcohol_pct != null) zet('alcohol', String(v.alcohol_pct).replace('.', ','));
        else if (veld === 'lekker_bij' && v.lekker_bij) zet('lekker_bij', v.lekker_bij);
        else if (veld === 'proefkaart' && v.proefkaart) zetK('proefkaart', v.proefkaart);
        else if (veld.startsWith('k.')) zetK(veld.slice(2), v.kenmerken[veld.slice(2)]);
        setBronnen(ai.bronnen);
    }
    function neemAllesOver() {
        if (!ai) return;
        const v = ai.voorstel;
        setF((x) => ({
            ...x,
            naam: v.naam ?? x.naam,
            alcohol: v.alcohol_pct != null ? String(v.alcohol_pct).replace('.', ',') : x.alcohol,
            lekker_bij: v.lekker_bij ?? x.lekker_bij,
            kenmerken: { ...x.kenmerken, ...v.kenmerken, ...(v.proefkaart ? { proefkaart: v.proefkaart } : {}) },
        }));
        setBronnen(ai.bronnen);
        melding('Overgenomen in het formulier. Kijk het na en sla op.', 'info');
    }

    /* ── Site ── */
    async function opDeSite(aan: boolean) {
        if (aan && !(await opslaan(true))) return;
        setBezig('site');
        try {
            const r = await zetOpSite({ id: p.id, live: aan });
            if ('error' in r) { melding(r.error, 'error'); return; }
            const onbekend = r.data.tekstcontrole.status === 'onbekend' ? ' (De woordcontrole van de website was niet bereikbaar; kijk de teksten zelf na.)' : '';
            melding(`${aan ? 'Staat op de site.' : 'Van de site gehaald.'}${seinZin(r.data.sein)}${onbekend}`, 'success');
            await herlaad();
        } finally { setBezig(null); }
    }

    async function bekijk() {
        if (!(await opslaan(true))) return;
        const r = await voorbeeldLink({ id: p.id });
        if ('error' in r) { melding(r.error, 'error'); return; }
        window.open(r.data.url, '_blank', 'noopener');
    }

    async function keur(groep: 'proefkaart' | 'druiven', aan: boolean) {
        if (!(await opslaan(true))) return;
        const r = await keurGoed({ id: p.id, groep, aan });
        if ('error' in r) { melding(r.error, 'error'); return; }
        melding(aan ? 'Goedgekeurd: de site toont het.' : 'Goedkeuring ingetrokken: de site toont het niet meer.', 'success');
        await herlaad();
    }

    const proef = f.kenmerken.proefkaart as Proefkaart | null | undefined;
    const goed = (g: string) => Boolean(p.goedgekeurd?.[g]?.op);
    const verpakking = f.kenmerken.verpakking as { soort: 'fles' | 'blik'; cl: number } | null | undefined;

    return (
        <Drawer
            eyebrow={<><Globe size={11} style={{ verticalAlign: '-1px' }} /> {LABEL[soort]} · pagina op de website</>}
            title={f.naam || 'Nieuw product'}
            subtitle={live ? `Op de site · hopbites.nl/bestellen/${p.slug}` : 'Concept — alleen te zien via Bekijk op de site'}
            onClose={onClose}
            width={640}
            footer={<>
                <Button icon={<Check size={14} />} loading={bezig === 'opslaan'} onClick={() => opslaan()}>Opslaan</Button>
                <Button variant="ghost" icon={<ExternalLink size={14} />} onClick={bekijk}>Bekijk op de site</Button>
                {live
                    ? <Button variant="ghost" icon={<X size={14} />} loading={bezig === 'site'} onClick={() => opDeSite(false)}>Haal van de site</Button>
                    : <Button variant="ghost" icon={<Globe size={14} />} loading={bezig === 'site'} disabled={mistSite.length > 0} onClick={() => opDeSite(true)}>Zet op de site</Button>}
            </>}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Wat er nog mist */}
                {(mistSite.length > 0 || mistVerkoop.length > 0 || !p.foto) && (
                    <div className="ws-tip" style={{ display: 'block', lineHeight: 1.5 }}>
                        {mistSite.length > 0 && <div><b>Nog niet op de site:</b> {mistSite.join(', ')}.</div>}
                        {mistVerkoop.length > 0 && <div><b>Wel te zien, nog niet te koop:</b> {mistVerkoop.join(', ')}.</div>}
                        {!p.foto && <div><b>Zonder foto</b> toont de site de kaart in letters.</div>}
                    </div>
                )}

                {/* Foto */}
                <Blok titel="Foto">
                    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 16, alignItems: 'start' }}>
                        <div style={{ width: 120, aspectRatio: '4 / 5', borderRadius: 10, overflow: 'hidden', background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {p.foto
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img src={fotoUrl(p.foto.basis, p.foto.maten[0]?.w ?? 640)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 42%' }} />
                                : <ImagePlus size={22} style={{ color: 'var(--muted)' }} />}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <label className="ws-chip" style={{ width: 'fit-content', cursor: 'pointer' }}>
                                <Upload size={14} />{bezig === 'foto' ? 'Bezig…' : p.foto ? 'Andere foto' : 'Kies de studiofoto'}
                                <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => kiesFoto(e.target.files?.[0])} />
                            </label>
                            <button type="button" className="ws-chip" style={{ width: 'fit-content' }} onClick={kopieerOpdracht}><Copy size={14} />Kopieer de ChatGPT-opdracht</button>
                            <div className="field-hint">Staand 2 : 3 (1024 × 1536), in de studio van de site: dezelfde plank, het licht van links, de wand van {LABEL[soort].toLowerCase()}. Op de kaart wordt hij 4 : 5.</div>
                            {fotoMelding && <div className="field-hint" style={{ color: 'var(--ws-warn)' }}>{fotoMelding}</div>}
                        </div>
                    </div>
                </Blok>

                {/* AI */}
                <Blok titel="Laat de AI invullen">
                    <div className="field-hint" style={{ marginTop: -4 }}>De AI zoekt op internet en leest het etiket, en stelt voor. Jij neemt over wat klopt. Prijs, allergenen en ingrediënten vul je altijd zelf in.</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <label className="ws-chip" style={{ cursor: 'pointer' }}>
                            <ImagePlus size={14} />{etiketten.length ? `${etiketten.length} etiketfoto${etiketten.length > 1 ? "'s" : ''}` : 'Foto van het etiket (mag)'}
                            <input type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => setEtiketten([...(e.target.files ?? [])].slice(0, 2))} />
                        </label>
                        <Button icon={<Sparkles size={14} />} loading={bezig === 'ai'} onClick={vraagAi}>{ai ? 'Opnieuw' : 'Zoek het op'}</Button>
                    </div>
                    <input value={aiExtra} onChange={(e) => setAiExtra(e.target.value)} placeholder="Iets wat de AI moet weten (mag leeg): 'het is de versie van 2024'" />
                    {bezig === 'ai' && <div className="ws-leeg">Even zoeken — dit duurt meestal een halve minuut.</div>}
                    {ai && <AiPaneel ai={ai} form={f} soort={soort} neemOver={neemOver} neemAllesOver={neemAllesOver} />}
                </Blok>

                {/* De velden */}
                <Blok titel="Op de pagina">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <div className="field" style={{ gridColumn: '1 / -1' }}><label>Naam</label><input value={f.naam} onChange={(e) => zet('naam', e.target.value)} /></div>
                        <div className="field" style={{ gridColumn: '1 / -1' }}>
                            <label>Adres</label>
                            <input value={f.slug} disabled={live} onChange={(e) => zet('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} />
                            <div className="field-hint">hopbites.nl/bestellen/{f.slug || '…'}{live ? ' — vast zolang het op de site staat' : ''}</div>
                        </div>
                        {VELDEN[soort].map((v) => <VeldInvoer key={v.sleutel} veld={v} waarde={f.kenmerken[v.sleutel]} zet={(x) => zetK(v.sleutel, x)} />)}
                        {soort === 'bier' && (
                            <div className="field" style={{ gridColumn: '1 / -1' }}>
                                <label>Verpakking</label>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <div className="ws-keuze" style={{ width: 200 }}>
                                        {(['fles', 'blik'] as const).map((s) => <button key={s} type="button" aria-pressed={verpakking?.soort === s} onClick={() => zetK('verpakking', { soort: s, cl: verpakking?.cl ?? 33 })}>{s}</button>)}
                                    </div>
                                    <input inputMode="decimal" style={{ width: 90 }} value={verpakking ? String(verpakking.cl).replace('.', ',') : ''} placeholder="33" onChange={(e) => { const n = getal(e.target.value); zetK('verpakking', n && !Number.isNaN(n) ? { soort: verpakking?.soort ?? 'fles', cl: n } : null); }} />
                                    <span className="ws-leeg">cl</span>
                                </div>
                            </div>
                        )}
                        {soort !== 'vlees' && <div className="field"><label>Alcohol</label><input inputMode="decimal" value={f.alcohol} onChange={(e) => zet('alcohol', e.target.value)} placeholder="8,5" /><div className="field-hint">%, van het etiket. Online alleen onder de 15 %.</div></div>}
                        <div className="field"><label>Prijs</label><input inputMode="decimal" value={f.prijs} onChange={(e) => zet('prijs', e.target.value)} placeholder="3,45" /><div className="field-hint">Incl. btw, {f.eenheid}. Leeg = prijs volgt (niet te koop).</div></div>
                        <div className="field"><label>Per</label><input value={f.eenheid} onChange={(e) => zet('eenheid', e.target.value)} /><div className="field-hint">{`"per fles", "per blik", "per 100 gram"`}</div></div>
                        <div className="field"><label>Streepjescode</label><input inputMode="numeric" value={f.ean} onChange={(e) => zet('ean', e.target.value.replace(/\D/g, ''))} /><div className="field-hint">Voor de kassa in de winkel</div></div>
                        <div className="field" style={{ gridColumn: '1 / -1' }}><label>Allergenen</label><input value={f.allergenen} onChange={(e) => zet('allergenen', e.target.value)} placeholder="gluten (gerst), sulfiet" /><div className="field-hint">Van het etiket, met komma&apos;s. Zonder allergenen niet te koop.</div></div>
                        <div className="field" style={{ gridColumn: '1 / -1' }}><label>Ingrediënten</label><input value={f.ingredienten} onChange={(e) => zet('ingredienten', e.target.value)} /><div className="field-hint">{soort === 'vlees' ? 'Verplicht bij vlees.' : 'Verplicht bij alcoholvrij (tot 1,2 %); anders mag het.'}</div></div>
                        {soort === 'vlees' && <div className="field" style={{ gridColumn: '1 / -1' }}><label>Bewaren</label><input value={f.bewaren} onChange={(e) => zet('bewaren', e.target.value)} placeholder="Gekoeld, 2–7 °C. Na openen binnen 3 dagen." /></div>}
                        {soort !== 'wijn' && <div className="field" style={{ gridColumn: '1 / -1' }}><label>Lekker bij</label><input value={f.lekker_bij} onChange={(e) => zet('lekker_bij', e.target.value)} placeholder="de borrelplank" /><div className="field-hint">Eén regel. Leeg = geen regel.</div></div>}
                    </div>
                    {soort === 'wijn' && (
                        <Goedkeuring aan={goed('druiven')} bezig={!!bezig} onClick={() => keur('druiven', !goed('druiven'))}>De druiven kloppen (dan noemt de site ze)</Goedkeuring>
                    )}
                </Blok>

                {soort === 'bier' && (
                    <Blok titel="Proefkaart">
                        {!proef
                            ? <div className="ws-leeg">Nog geen proefkaart. Laat de AI hem opzoeken, of laat hem weg: de pagina werkt ook zonder.</div>
                            : <ProefkaartInvoer kaart={proef} zet={(k) => zetK('proefkaart', k)} weg={() => zetK('proefkaart', null)} />}
                        {proef && <Goedkeuring aan={goed('proefkaart')} bezig={!!bezig} onClick={() => keur('proefkaart', !goed('proefkaart'))}>Ik heb de proefkaart nagelezen (dan toont de site hem)</Goedkeuring>}
                    </Blok>
                )}

                {(p.bronnen?.length ?? 0) > 0 && (
                    <Blok titel="Bronnen">
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
                            {p.bronnen!.map((b) => <li key={b.url}><a href={b.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand)' }}>{b.titel}</a></li>)}
                        </ul>
                    </Blok>
                )}
            </div>
        </Drawer>
    );
}

/* ── Bouwstenen ───────────────────────────────────────────────────────────── */

function Blok({ titel, children }: { titel: string; children: ReactNode }) {
    return (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div className="ws-eyebrow">{titel}</div>
            {children}
        </section>
    );
}

function Goedkeuring({ aan, bezig, onClick, children }: { aan: boolean; bezig: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button type="button" className="ws-chip" aria-pressed={aan} disabled={bezig} onClick={onClick} style={{ width: 'fit-content' }}>
            <Check size={14} />{children}
        </button>
    );
}

function VeldInvoer({ veld: v, waarde: w, zet }: { veld: Veld; waarde: unknown; zet: (x: unknown) => void }) {
    const breed = v.soort === 'lang' || v.soort === 'lijst' || (v.hint?.length ?? 0) > 60;
    if (v.soort === 'vink') {
        return (
            <div className="field">
                <label>{v.label}</label>
                <button type="button" className="ws-schakel" role="switch" aria-checked={Boolean(w)} aria-label={v.label} onClick={() => zet(!w)} />
            </div>
        );
    }
    return (
        <div className="field" style={breed ? { gridColumn: '1 / -1' } : undefined}>
            <label>{v.label}</label>
            {v.soort === 'keuze' ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {v.keuzes!.map((k) => <button key={k} type="button" className="ws-pil" aria-pressed={w === k} onClick={() => zet(k)}>{k}</button>)}
                </div>
            ) : v.soort === 'lang' ? (
                <textarea rows={3} value={typeof w === 'string' ? w : ''} onChange={(e) => zet(e.target.value)} />
            ) : v.soort === 'lijst' ? (
                <input value={uitLijst(w)} onChange={(e) => zet(naarLijst(e.target.value))} />
            ) : (
                <input value={typeof w === 'string' ? w : ''} onChange={(e) => zet(e.target.value)} />
            )}
            {v.hint && <div className="field-hint">{v.hint}</div>}
        </div>
    );
}

function ProefkaartInvoer({ kaart: k, zet, weg }: { kaart: Proefkaart; zet: (k: Proefkaart) => void; weg: () => void }) {
    const z = <K extends keyof Proefkaart>(s: K, v: Proefkaart[K]) => zet({ ...k, [s]: v });
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field"><label>Plaats</label><input value={k.plaats} onChange={(e) => z('plaats', e.target.value)} /></div>
            <div className="field"><label>Land</label><input value={k.land} onChange={(e) => z('land', e.target.value)} /></div>
            <div className="field" style={{ gridColumn: '1 / -1' }}><label>Smaak</label><textarea rows={3} value={k.smaak} onChange={(e) => z('smaak', e.target.value)} /></div>
            <div className="field" style={{ gridColumn: '1 / -1' }}><label>De brouwerij</label><textarea rows={3} value={k.brouwerij} onChange={(e) => z('brouwerij', e.target.value)} /></div>
            <div className="field" style={{ gridColumn: '1 / -1' }}><label>Oorsprong</label><textarea rows={3} value={k.oorsprong} onChange={(e) => z('oorsprong', e.target.value)} /></div>
            <div className="field" style={{ gridColumn: '1 / -1' }}><label>Gebrouwen met</label><input value={k.gebrouwenMet.join(', ')} onChange={(e) => z('gebrouwenMet', naarLijst(e.target.value))} /></div>
            <div className="field"><label>IBU</label><input inputMode="numeric" value={k.ibu ?? ''} onChange={(e) => z('ibu', e.target.value ? Math.max(0, Math.round(Number(e.target.value)) || 0) : null)} /></div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Smaakpalet (1–5)</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    {SMAKEN.map((s) => (
                        <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, textTransform: 'none', letterSpacing: 0 }}>
                            <span style={{ width: 56 }}>{s}</span>
                            <input type="number" min={1} max={5} value={k.palet[s]} style={{ width: 64 }} onChange={(e) => z('palet', { ...k.palet, [s]: Math.min(5, Math.max(1, Number(e.target.value) || 1)) })} />
                        </label>
                    ))}
                </div>
            </div>
            <button type="button" className="ws-chip" style={{ width: 'fit-content' }} onClick={weg}><X size={14} />Proefkaart weghalen</button>
        </div>
    );
}

function AiPaneel({ ai, form, soort, neemOver, neemAllesOver }: { ai: AiAntwoord; form: Form; soort: Paginasoort; neemOver: (veld: string) => void; neemAllesOver: () => void }) {
    const v = ai.voorstel;
    const rijen: { veld: string; label: string; nu: unknown; voorstel: unknown }[] = [];
    if (v.naam && v.naam !== form.naam) rijen.push({ veld: 'naam', label: 'Naam', nu: form.naam, voorstel: v.naam });
    if (v.alcohol_pct != null && String(v.alcohol_pct).replace('.', ',') !== form.alcohol) rijen.push({ veld: 'alcohol_pct', label: 'Alcohol %', nu: form.alcohol, voorstel: v.alcohol_pct });
    for (const [k, w] of Object.entries(v.kenmerken)) {
        if (JSON.stringify(w) === JSON.stringify(form.kenmerken[k])) continue;
        const label = VELDEN[soort].find((x) => x.sleutel === k)?.label ?? (k === 'verpakking' ? 'Verpakking' : k);
        rijen.push({ veld: `k.${k}`, label, nu: form.kenmerken[k], voorstel: w });
    }
    if (v.lekker_bij && v.lekker_bij !== form.lekker_bij) rijen.push({ veld: 'lekker_bij', label: 'Lekker bij', nu: form.lekker_bij, voorstel: v.lekker_bij });
    if (v.proefkaart) rijen.push({ veld: 'proefkaart', label: 'Proefkaart', nu: form.kenmerken.proefkaart ? 'er is er een' : null, voorstel: v.proefkaart.smaak });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: 12, background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)' }}>
            {ai.tekstcontrole.status === 'fout' && <div className="field-hint" style={{ color: 'var(--ws-vuur)' }}>Deze woorden mogen niet op de site: {ai.tekstcontrole.fouten.map((x) => `"${x.woord}" (${x.veld})`).join(', ')}. Pas ze aan na het overnemen.</div>}
            {rijen.length === 0 ? <div className="ws-leeg">Niets nieuws gevonden ten opzichte van wat er al staat.</div> : (
                <>
                    {rijen.map((r) => (
                        <div key={r.veld} style={{ display: 'grid', gridTemplateColumns: '110px 1fr auto', gap: 10, alignItems: 'start', fontSize: 13 }}>
                            <span style={{ color: 'var(--muted)' }}>{r.label}</span>
                            <span><span style={{ color: 'var(--muted-weak)', textDecoration: r.nu ? 'line-through' : undefined }}>{r.nu ? waarde(r.nu) : ''}</span>{r.nu ? ' → ' : ''}{waarde(r.voorstel)}</span>
                            <button type="button" className="ws-pil" onClick={() => neemOver(r.veld)}>Neem over</button>
                        </div>
                    ))}
                    <Button variant="ghost" icon={<Check size={14} />} onClick={neemAllesOver}>Neem alles over</Button>
                </>
            )}
            {v.hints.etiket && <div className="field-hint"><b>Op het etiket gelezen</b> (vul zelf in bij allergenen en ingrediënten): {v.hints.etiket}</div>}
            {v.hints.prijzen.length > 0 && <div className="field-hint"><b>Elders</b> (nooit duurder dan Mr. Hop of Gall &amp; Gall): {v.hints.prijzen.map((x, i) => <span key={x.url}>{i ? ' · ' : ''}<a href={x.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand)' }}>{x.winkel}</a> € {x.prijs.toFixed(2).replace('.', ',')}</span>)}</div>}
            {v.twijfel.length > 0 && <div className="field-hint"><b>Niet zeker:</b> {v.twijfel.join(' · ')}</div>}
            {v.geweerd.length > 0 && <div className="field-hint">De AI gaf ook {v.geweerd.join(', ')} — weggelaten: dat vul je zelf in.</div>}
            {ai.bronnen.length > 0 && <div className="field-hint"><b>Bronnen:</b> {ai.bronnen.slice(0, 6).map((b, i) => <span key={b.url}>{i ? ' · ' : ''}<a href={b.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand)' }}>{b.titel}</a></span>)}</div>}
            <div className="field-hint">Kosten van deze zoektocht: € {(ai.usage.cost_eur_cents / 100).toFixed(2).replace('.', ',')}</div>
        </div>
    );
}
