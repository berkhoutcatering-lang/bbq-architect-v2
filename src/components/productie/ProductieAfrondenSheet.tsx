'use client';

/**
 * "Afmaken met sticker" — één scherm voor kookbord én tablet.
 *
 *   PULLED PORK
 *   Gemaakt: [ 12 ] kg            ← productiewaarheid, mag je corrigeren
 *   Verpakking: 12 × 1,00 kg      ← ± alleen op het aantal, nooit op labels
 *   THT: 16-12-2026 · Bewaren: max. -18 °C
 *   [ AFRONDEN EN 12 LABELS PRINTEN ]
 *
 * Daarna:
 *   ✓ Batch PP-20260916-01 · ✓ 12 eenheden · 12/12 labels
 *   of: "7/12 labels geprint" + [ Print ontbrekende 5 ]
 *
 * De sheet kent geen endpoint: de aanroeper geeft `afronden(blok)` mee
 * (complete-task op de tablet, partij-afronden op het kookbord). Printen
 * loopt via de printerlaag. Eén idempotency-sleutel per opening: dubbel
 * tikken maakt nooit twee partijen.
 */

import { useEffect, useMemo, useState } from 'react';
import { Check, Minus, Plus, Printer, X, AlertTriangle } from 'lucide-react';
import { berekenEenheden, formatInhoud, normaliseerEenheid, verdeelOverAantal, EENHEDEN, type Eenheid } from '@/lib/productie/eenheden';
import { bepaalTht, vandaagIso } from '@/lib/productie/tht';
import { printLabels, usePrinters, werkstationPrinter, type PrintResultaat } from '@/lib/labelprinter/client';
import type { PartijBlok } from '@/lib/productie/validators';
import { PUNT_LABEL, beoordeel, puntVraagtWaarde, type HaccpPunt } from '@/lib/productie/vrijgave';

export interface AfrondenProduct {
    naam: string;
    hoeveelheid: number | null;
    eenheid: string | null;
    verpakkingGrootte: number | null;
    verpakkingEenheid: string | null;
    bewaarmethode: string | null;
    bewaaradvies: string | null;
    houdbaarheidDagen: number | null;
    stapHoudbaarheidDagen?: number | null;
    /** HACCP-punten van de bouwsteen; verplichte punten blokkeren zonder meting. */
    haccpPunten?: HaccpPunt[] | null;
}

export interface PartijAntwoord {
    ok: boolean;
    bestond?: boolean;
    id?: string;
    partijnummer?: string;
    aantal_eenheden?: number;
    eenheden?: Array<{ id: string; volgnummer: number; code: string; label_geprint_at: string | null }>;
    error?: string;
    code?: string;
}

export interface BestaandePartij {
    id: string;
    partijnummer: string;
    aantalEenheden: number;
    labelsGeprint: number;
}

interface Props {
    open: boolean;
    onClose: () => void;
    product: AfrondenProduct;
    /** Al een partij? Dan begint de sheet in de resultaatstand. */
    bestaand?: BestaandePartij | null;
    afronden: (blok: PartijBlok) => Promise<PartijAntwoord>;
    /** Na een geslaagde partij (nieuw of bestaand), zodat de aanroeper kan verversen. */
    onPartij?: (partij: PartijAntwoord) => void;
}

type Stand = 'invoer' | 'bezig' | 'resultaat';

const D = {
    achter: 'rgba(8,8,10,.92)', vlak: '#141416', vlakLicht: '#1d1d21', lijn: 'rgba(255,255,255,.1)',
    tekst: '#f4f4f4', stof: '#9a9aa2', goud: '#e0b45a', groen: '#74e29a', rood: '#f27474',
};

function nieuweSleutel(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); });
}

function stapVoor(eenheid: Eenheid): number {
    return eenheid === 'kg' || eenheid === 'l' ? 0.5 : eenheid === 'g' || eenheid === 'ml' ? 100 : 1;
}

export default function ProductieAfrondenSheet({ open, onClose, product, bestaand, afronden, onPartij }: Props) {
    const { printers } = usePrinters();
    const printer = useMemo(() => werkstationPrinter(printers), [printers]);

    const [sleutel, setSleutel] = useState(nieuweSleutel);
    const [stand, setStand] = useState<Stand>('invoer');
    const [hoeveelheid, setHoeveelheid] = useState<number>(product.hoeveelheid ?? 0);
    const [eenheid, setEenheid] = useState<Eenheid>(normaliseerEenheid(product.eenheid) ?? 'kg');
    const [verpakking, setVerpakking] = useState<number | null>(product.verpakkingGrootte);
    const [verpakkingEenheid, setVerpakkingEenheid] = useState<Eenheid>(normaliseerEenheid(product.verpakkingEenheid) ?? normaliseerEenheid(product.eenheid) ?? 'kg');
    const [aantalOverride, setAantalOverride] = useState<number | null>(null);
    const [tht, setTht] = useState<string>('');
    const [bewaaradvies, setBewaaradvies] = useState<string>(product.bewaaradvies ?? '');
    const [bewaarmethode, setBewaarmethode] = useState<string>(product.bewaarmethode ?? '');
    const [fout, setFout] = useState<string | null>(null);
    /* HACCP: per punt de ingevoerde waarde ('' = niets) of 'ja' bij een vinkje. */
    const [metingen, setMetingen] = useState<Record<string, string>>({});
    const [partij, setPartij] = useState<PartijAntwoord | null>(null);
    const [print, setPrint] = useState<PrintResultaat | null>(null);
    const [printBezig, setPrintBezig] = useState(false);

    /* Elke opening: schone sleutel en schone invoer. Alleen bij het openen —
       de aanroeper geeft `product` vaak als nieuw object per render mee, en
       dat mag de invoer halverwege nooit wissen. */
    useEffect(() => {
        if (!open) return;
        setSleutel(nieuweSleutel());
        setFout(null);
        setPrint(null);
        setAantalOverride(null);
        setMetingen({});
        setHoeveelheid(product.hoeveelheid ?? 0);
        setEenheid(normaliseerEenheid(product.eenheid) ?? 'kg');
        setVerpakking(product.verpakkingGrootte);
        setVerpakkingEenheid(normaliseerEenheid(product.verpakkingEenheid) ?? normaliseerEenheid(product.eenheid) ?? 'kg');
        setBewaaradvies(product.bewaaradvies ?? '');
        setBewaarmethode(product.bewaarmethode ?? '');
        const t = bepaalTht(vandaagIso(), { stapDagen: product.stapHoudbaarheidDagen ?? null, componentDagen: product.houdbaarheidDagen });
        setTht(t.tht ?? '');
        if (bestaand) {
            setPartij({ ok: true, bestond: true, id: bestaand.id, partijnummer: bestaand.partijnummer, aantal_eenheden: bestaand.aantalEenheden });
            setStand('resultaat');
        } else {
            setPartij(null);
            setStand('invoer');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const uitkomst = useMemo(() => {
        if (!(hoeveelheid > 0) || !verpakking || !(verpakking > 0)) return null;
        return aantalOverride != null
            ? verdeelOverAantal(hoeveelheid, eenheid, aantalOverride, verpakkingEenheid)
            : berekenEenheden(hoeveelheid, eenheid, verpakking, verpakkingEenheid);
    }, [hoeveelheid, eenheid, verpakking, verpakkingEenheid, aantalOverride]);
    const aantal = uitkomst?.eenheden.length ?? 0;
    const perEenheid = uitkomst?.eenheden[0]?.inhoud ?? verpakking ?? 0;

    /* HACCP: verplichte punten moeten hier ingevuld zijn (en akkoord) vóór de
       knop vrijkomt. De server controleert het nog een keer. */
    const punten = product.haccpPunten ?? [];
    const verplicht = punten.filter((p) => p.verplicht_voor_vrijgave);
    const haccpStand = verplicht.map((p) => {
        const v = metingen[p.type] ?? '';
        if (!puntVraagtWaarde(p.type)) return { punt: p, ingevuld: v === 'ja', beoordeling: v === 'ja' ? 'geregistreerd' as const : null };
        const n = parseFloat(v.replace(',', '.'));
        if (!Number.isFinite(n)) return { punt: p, ingevuld: false, beoordeling: null };
        return { punt: p, ingevuld: true, beoordeling: beoordeel(p, n) };
    });
    const haccpOk = haccpStand.every((h) => h.ingevuld && h.beoordeling !== 'afwijking');
    const kan = stand === 'invoer' && !!uitkomst && !uitkomst.fout && aantal > 0 && haccpOk;

    function metingenVoorBlok(): PartijBlok['metingen'] {
        const uit: PartijBlok['metingen'] = [];
        for (const p of punten) {
            const v = metingen[p.type] ?? '';
            if (!v) continue;
            if (!puntVraagtWaarde(p.type)) { if (v === 'ja') uit.push({ type: p.type, temp: null }); continue; }
            const n = parseFloat(v.replace(',', '.'));
            if (Number.isFinite(n)) uit.push({ type: p.type, temp: Math.round(n * 10) / 10 });
        }
        return uit;
    }

    async function doeAfronden() {
        if (!kan) return;
        setStand('bezig');
        setFout(null);
        const blok: PartijBlok = {
            idempotencyKey: sleutel,
            actualQty: hoeveelheid, eenheid,
            verpakkingGrootte: verpakking, verpakkingEenheid,
            aantalEenheden: aantalOverride,
            tht: tht || null,
            bewaarmethode: (bewaarmethode || null) as PartijBlok['bewaarmethode'],
            bewaaradvies: bewaaradvies.trim() || null,
            opslagLocatieId: null, kernTempC: null, metingen: metingenVoorBlok(), notitie: null,
        };
        try {
            const r = await afronden(blok);
            if (!r.ok || !r.id) {
                setFout(r.error ?? 'Afronden mislukt');
                setStand('invoer');
                return;
            }
            setPartij(r);
            onPartij?.(r);
            setStand('resultaat');
            await doePrint(r.id, null);
        } catch (e) {
            setFout(e instanceof Error ? e.message : 'Afronden mislukt');
            setStand('invoer');
        }
    }

    async function doePrint(partijId: string, eenheidIds: string[] | null) {
        if (!printer) { setFout('Geen printer voor dit apparaat — kies er een bij Instellingen → Printers'); return; }
        setPrintBezig(true);
        setFout(null);
        try {
            const r = await printLabels({ soort: 'partij_labels', printerId: printer.id, partijId, eenheidIds });
            setPrint(r);
            /* Ververs de eenheden (welke zijn nu geprint) voor "ontbrekende". */
            const res = await fetch(`/api/productie/partij/${partijId}`, { cache: 'no-store' });
            const json = await res.json().catch(() => null);
            if (res.ok && json?.eenheden) setPartij((p) => (p ? { ...p, eenheden: json.eenheden } : p));
        } catch (e) {
            setFout(e instanceof Error ? e.message : 'Printen mislukt');
        } finally {
            setPrintBezig(false);
        }
    }

    if (!open) return null;

    const ontbrekend = (partij?.eenheden ?? []).filter((e) => !e.label_geprint_at);
    const totaal = partij?.aantal_eenheden ?? aantal;
    const geprint = partij?.eenheden ? partij.eenheden.length - ontbrekend.length : (bestaand?.labelsGeprint ?? 0);

    return (
        <div role="dialog" aria-modal="true" aria-label="Afmaken met sticker" style={{ position: 'fixed', inset: 0, zIndex: 300, background: D.achter, display: 'flex', flexDirection: 'column', color: D.tekst, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 24px', borderBottom: `1px solid ${D.lijn}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, letterSpacing: '.16em', textTransform: 'uppercase', color: D.stof }}>Afmaken met sticker</div>
                    <div style={{ fontSize: 30, fontWeight: 600, lineHeight: 1.1, marginTop: 4 }}>{product.naam}</div>
                </div>
                <button type="button" onClick={onClose} aria-label="Sluiten" style={{ width: 56, height: 56, borderRadius: 14, background: D.vlak, border: `1px solid ${D.lijn}`, color: D.tekst, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={24} /></button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 760, width: '100%', margin: '0 auto' }}>
                {stand !== 'resultaat' && (
                    <>
                        {/* Hoeveelheid gemaakt */}
                        <Blok kop="Gemaakt">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <Vlak onClick={() => setHoeveelheid((h) => Math.max(0, round3(h - stapVoor(eenheid))))}><Minus size={28} /></Vlak>
                                <input
                                    type="number" inputMode="decimal" step="any" min={0}
                                    value={hoeveelheid || ''} onChange={(e) => { setHoeveelheid(parseFloat(e.target.value.replace(',', '.')) || 0); setAantalOverride(null); }}
                                    style={{ flex: 1, height: 88, fontSize: 44, textAlign: 'center', background: D.vlak, border: `1px solid ${D.lijn}`, borderRadius: 14, color: D.tekst, fontVariantNumeric: 'tabular-nums' }}
                                />
                                <select value={eenheid} onChange={(e) => setEenheid(e.target.value as Eenheid)} style={{ height: 88, fontSize: 24, padding: '0 14px', background: D.vlak, border: `1px solid ${D.lijn}`, borderRadius: 14, color: D.tekst }}>
                                    {EENHEDEN.map((u) => <option key={u} value={u}>{u}</option>)}
                                </select>
                                <Vlak onClick={() => setHoeveelheid((h) => round3(h + stapVoor(eenheid)))}><Plus size={28} /></Vlak>
                            </div>
                            {product.hoeveelheid != null && <p style={{ margin: '8px 0 0', color: D.stof, fontSize: 14 }}>Gepland: {product.hoeveelheid} {product.eenheid}</p>}
                        </Blok>

                        {/* Verpakking */}
                        <Blok kop="Verpakking">
                            {verpakking == null || !(verpakking > 0) ? (
                                <div>
                                    <p style={{ margin: '0 0 10px', fontSize: 15, color: D.goud, display: 'flex', gap: 8, alignItems: 'center' }}><AlertTriangle size={16} /> Nog niet bekend voor {product.naam} — vul één keer in, daarna onthoudt het systeem het.</p>
                                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                        <span style={{ fontSize: 18 }}>Per eenheid</span>
                                        <input type="number" inputMode="decimal" step="any" min={0} placeholder="1" onChange={(e) => setVerpakking(parseFloat(e.target.value.replace(',', '.')) || null)} style={{ width: 140, height: 64, fontSize: 28, textAlign: 'center', background: D.vlak, border: `1px solid ${D.lijn}`, borderRadius: 12, color: D.tekst }} />
                                        <select value={verpakkingEenheid} onChange={(e) => setVerpakkingEenheid(e.target.value as Eenheid)} style={{ height: 64, fontSize: 20, padding: '0 12px', background: D.vlak, border: `1px solid ${D.lijn}`, borderRadius: 12, color: D.tekst }}>
                                            {EENHEDEN.map((u) => <option key={u} value={u}>{u}</option>)}
                                        </select>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <Vlak onClick={() => setAantalOverride(Math.max(1, aantal - 1))} klein><Minus size={22} /></Vlak>
                                    <div style={{ flex: 1, textAlign: 'center' }}>
                                        <div style={{ fontSize: 40, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{aantal} <span style={{ fontSize: 22, fontWeight: 500, color: D.stof }}>× {formatInhoud(perEenheid, verpakkingEenheid)}</span></div>
                                        <div style={{ fontSize: 14, color: D.stof, marginTop: 4 }}>
                                            {uitkomst?.fout ? <span style={{ color: D.rood }}>{uitkomst.fout}</span>
                                                : uitkomst?.rest ? (uitkomst.volle === 0 ? `minder dan één verpakking: 1 eenheid van ${formatInhoud(uitkomst.rest, verpakkingEenheid)}` : `${uitkomst.volle} volle + 1 rest van ${formatInhoud(uitkomst.rest, verpakkingEenheid)}`)
                                                    : aantalOverride != null ? 'aantal gecorrigeerd — inhoud gelijk verdeeld' : `${aantal} eenheden = ${aantal} labels`}
                                        </div>
                                    </div>
                                    <Vlak onClick={() => setAantalOverride(Math.min(500, aantal + 1))} klein><Plus size={22} /></Vlak>
                                </div>
                            )}
                        </Blok>

                        {/* HACCP — alleen wat de bouwsteen zelf verplicht stelt */}
                        {punten.length > 0 && (
                            <Blok kop="HACCP">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {punten.map((p) => {
                                        const v = metingen[p.type] ?? '';
                                        const st = haccpStand.find((h) => h.punt.type === p.type);
                                        const b = st?.beoordeling ?? (v && puntVraagtWaarde(p.type) && Number.isFinite(parseFloat(v.replace(',', '.'))) ? beoordeel(p, parseFloat(v.replace(',', '.'))) : null);
                                        const kleur = b === 'afwijking' ? D.rood : b ? D.groen : p.verplicht_voor_vrijgave ? D.goud : D.stof;
                                        return (
                                            <div key={p.type} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <span style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.05)', color: kleur }}>
                                                    {b && b !== 'afwijking' ? <Check size={16} /> : <AlertTriangle size={14} />}
                                                </span>
                                                <span style={{ flex: 1, fontSize: 16 }}>
                                                    {PUNT_LABEL[p.type] ?? p.type}
                                                    {p.threshold_value != null && <span style={{ color: D.stof }}> · eis {p.type === 'koeltemp' || p.type === 'tijd_uit_koeling' ? '≤' : '≥'} {p.threshold_value} {p.threshold_unit === 'celsius' ? '°C' : p.threshold_unit ?? ''}</span>}
                                                    {p.verplicht_voor_vrijgave && <span style={{ color: D.goud, fontSize: 12, marginLeft: 8 }}>verplicht</span>}
                                                </span>
                                                {puntVraagtWaarde(p.type) ? (
                                                    <input
                                                        type="number" inputMode="decimal" step="0.1" placeholder={p.threshold_unit === 'celsius' ? '°C' : 'min'}
                                                        value={v} onChange={(e) => setMetingen((m) => ({ ...m, [p.type]: e.target.value }))}
                                                        style={{ width: 120, height: 56, fontSize: 24, textAlign: 'center', background: D.vlak, border: `1px solid ${b === 'afwijking' ? D.rood : D.lijn}`, borderRadius: 12, color: D.tekst }}
                                                    />
                                                ) : (
                                                    <button type="button" onClick={() => setMetingen((m) => ({ ...m, [p.type]: m[p.type] === 'ja' ? '' : 'ja' }))} style={{ height: 56, padding: '0 18px', borderRadius: 12, border: `1px solid ${v === 'ja' ? D.groen : D.lijn}`, background: v === 'ja' ? 'rgba(116,226,154,.12)' : D.vlak, color: D.tekst, fontSize: 16, cursor: 'pointer' }}>
                                                        {v === 'ja' ? 'Gedaan ✓' : 'Gedaan?'}
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {!haccpOk && <p style={{ margin: 0, fontSize: 13, color: D.goud }}>Verplichte HACCP-punten moeten gemeten en akkoord zijn voordat de partij vrijgegeven wordt. De meting wordt als HACCP-registratie bewaard.</p>}
                                </div>
                            </Blok>
                        )}

                        {/* THT & bewaren */}
                        <Blok kop="Op het label">
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <span style={{ fontSize: 13, color: D.stof }}>THT {tht ? '' : '(onbekend — geen dagen ingesteld)'}</span>
                                    <input type="date" value={tht} onChange={(e) => setTht(e.target.value)} style={{ height: 56, fontSize: 18, padding: '0 12px', background: D.vlak, border: `1px solid ${D.lijn}`, borderRadius: 12, color: D.tekst }} />
                                </label>
                                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <span style={{ fontSize: 13, color: D.stof }}>Bewaren (tekst op label)</span>
                                    <input type="text" value={bewaaradvies} maxLength={60} placeholder="bv. max. -18 °C" onChange={(e) => setBewaaradvies(e.target.value)} style={{ height: 56, fontSize: 18, padding: '0 12px', background: D.vlak, border: `1px solid ${D.lijn}`, borderRadius: 12, color: D.tekst }} />
                                </label>
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                {(['vers', 'vries', 'houdbaar'] as const).map((m) => (
                                    <button key={m} type="button" onClick={() => setBewaarmethode(m)} style={{ flex: 1, height: 48, borderRadius: 12, border: `1px solid ${bewaarmethode === m ? D.goud : D.lijn}`, background: bewaarmethode === m ? 'rgba(224,180,90,.15)' : D.vlak, color: D.tekst, fontSize: 15, cursor: 'pointer' }}>
                                        {m === 'vers' ? 'Koelkast' : m === 'vries' ? 'Vriezer' : 'Droog'}
                                    </button>
                                ))}
                            </div>
                        </Blok>
                    </>
                )}

                {stand === 'resultaat' && partij && (
                    <Blok kop="Resultaat">
                        <Regel ok tekst={`Batch ${partij.partijnummer} ${partij.bestond ? 'bestond al' : 'aangemaakt'}`} />
                        <Regel ok tekst={`${totaal} ${totaal === 1 ? 'eenheid' : 'eenheden'} in voorraad`} />
                        <Regel
                            ok={geprint >= totaal}
                            tekst={printBezig ? 'Labels printen…' : `${geprint}/${totaal} labels geprint${print?.tekst ? ` — ${print.tekst}` : ''}`}
                        />
                        {print?.uitkomst.onzekerEenheidIds.length ? (
                            <p style={{ margin: '8px 0 0', fontSize: 14, color: D.goud }}>Van {print.uitkomst.onzekerEenheidIds.length} labels is niet zeker of ze uit de printer kwamen — kijk na en print wat ontbreekt.</p>
                        ) : null}
                        {print?.waarschuwingen.length ? (
                            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, color: D.goud }}>{print.waarschuwingen.map((w) => <li key={w}>{w}</li>)}</ul>
                        ) : null}
                    </Blok>
                )}

                {fout && <p style={{ margin: 0, padding: '12px 14px', borderRadius: 12, background: 'rgba(242,116,116,.12)', border: '1px solid rgba(242,116,116,.4)', color: D.rood, fontSize: 15 }}>{fout}</p>}
                {!printer && stand !== 'resultaat' && <p style={{ margin: 0, fontSize: 13, color: D.goud }}>Geen printer gekozen voor dit apparaat: de partij wordt wél gemaakt, de labels kun je daarna printen zodra een printer gekoppeld is.</p>}
            </div>

            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12, borderTop: `1px solid ${D.lijn}`, maxWidth: 760, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
                {stand !== 'resultaat' ? (
                    <button type="button" disabled={!kan} onClick={() => void doeAfronden()} style={{ height: 96, borderRadius: 16, border: 'none', background: kan ? D.goud : D.vlakLicht, color: kan ? '#141414' : D.stof, fontSize: 24, fontWeight: 700, cursor: kan ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                        <Printer size={26} />
                        {stand === 'bezig' ? 'Bezig…' : aantal > 0 ? `Afronden en ${aantal} label${aantal === 1 ? '' : 's'} printen` : 'Afronden'}
                    </button>
                ) : (
                    <>
                        {partij?.id && ontbrekend.length > 0 && (
                            <button type="button" disabled={printBezig} onClick={() => void doePrint(partij.id!, ontbrekend.map((e) => e.id))} style={{ height: 88, borderRadius: 16, border: 'none', background: D.goud, color: '#141414', fontSize: 22, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                                <Printer size={24} /> Print ontbrekende {ontbrekend.length}
                            </button>
                        )}
                        {partij?.id && ontbrekend.length === 0 && geprint === 0 && (
                            <button type="button" disabled={printBezig} onClick={() => void doePrint(partij.id!, null)} style={{ height: 88, borderRadius: 16, border: 'none', background: D.goud, color: '#141414', fontSize: 22, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                                <Printer size={24} /> Print {totaal} labels
                            </button>
                        )}
                        <button type="button" onClick={onClose} style={{ height: 72, borderRadius: 16, background: 'transparent', border: `2px solid ${D.lijn}`, color: D.tekst, fontSize: 20, cursor: 'pointer' }}>
                            {geprint >= totaal ? 'Klaar' : 'Later verder'}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

function round3(n: number): number { return Math.round(n * 1000) / 1000; }

function Blok({ kop, children }: { kop: string; children: React.ReactNode }) {
    return (
        <section style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${D.lijn}`, borderRadius: 16, padding: 16 }}>
            <div style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', color: D.stof, marginBottom: 10 }}>{kop}</div>
            {children}
        </section>
    );
}

function Vlak({ children, onClick, klein }: { children: React.ReactNode; onClick: () => void; klein?: boolean }) {
    const m = klein ? 64 : 88;
    return (
        <button type="button" onClick={onClick} style={{ width: m, height: m, flex: '0 0 auto', borderRadius: 14, background: D.vlakLicht, border: `1px solid ${D.lijn}`, color: D.tekst, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            {children}
        </button>
    );
}

function Regel({ ok, tekst }: { ok: boolean; tekst: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 18, padding: '6px 0' }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: ok ? 'rgba(116,226,154,.15)' : 'rgba(224,180,90,.15)', color: ok ? D.groen : D.goud }}>{ok ? <Check size={18} /> : <AlertTriangle size={16} />}</span>
            <span>{tekst}</span>
        </div>
    );
}
