'use client';

/**
 * De tablet. Staand, in de hand, met vette vingers.
 *
 * Precies drie knoppen: Start, Klaar, Loopt uit. Alle raakvlakken zijn 150 px
 * hoog zodat je ze met een knokkel raakt zonder te kijken — een vinkje van
 * 24 px mis je gegarandeerd.
 *
 * Bij Klaar komen er twee vragen, allebei in één tik: hoeveel is het geworden,
 * en ben je onderbroken. Dat tweede is geen formaliteit. Zonder dat vinkje zit
 * er straks een meting van 24 minuten in omdat de leverancier aanbelde, en
 * dan leert het systeem de verkeerde les.
 */

import { useState } from 'react';
import { useKeukenscherm } from '../../scherm/_lib/useKeukenscherm';
import { K, LETTER, BRON_LABEL, bronKleur, bronRand } from '../../scherm/_components/tokens';
import ProductieAfrondenSheet, { type AfrondenProduct, type PartijAntwoord } from '@/components/productie/ProductieAfrondenSheet';
import type { PartijBlok } from '@/lib/productie/validators';
import type { AfTeMakenRegel } from '@/lib/productie/keukenscherm';

type Fase = 'taak' | 'klaar-bevestigen' | 'loopt-uit';

/**
 * "Afmaken met sticker" op de tablet. Twee ingangen:
 *   - direct na Klaar melden op een eindstap (partij in dezelfde
 *     complete-task-aanroep, dus één klik voor taak + partij + labels);
 *   - later, uit de lijst "af te maken" (partij-afronden op een taak die
 *     al klaar is).
 */
interface Sticker {
    product: AfrondenProduct;
    afronden: (blok: PartijBlok) => Promise<PartijAntwoord>;
}

export default function TabletClient() {
    const { data, verbindingKwijt } = useKeukenscherm();
    const [fase, setFase] = useState<Fase>('taak');
    const [hoeveelheid, setHoeveelheid] = useState<number | null>(null);
    const [bezig, setBezig] = useState(false);
    const [bericht, setBericht] = useState<string | null>(null);
    const [sticker, setSticker] = useState<Sticker | null>(null);

    const nu = data?.nu ?? null;
    const taakId = nu?.taakId ?? null;
    const afTeMaken = data?.afTeMaken ?? [];

    async function post(pad: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
        const res = await fetch(pad, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? `Mislukt (${res.status})`);
        return json;
    }

    /* Uit de lijst: taak is al klaar, alleen de partij nog. */
    function openStickerVoor(regel: AfTeMakenRegel) {
        setSticker({
            product: {
                naam: regel.componentNaam, hoeveelheid: regel.hoeveelheid, eenheid: regel.eenheid,
                verpakkingGrootte: regel.verpakkingGrootte, verpakkingEenheid: regel.verpakkingEenheid,
                bewaarmethode: regel.bewaarmethode, bewaaradvies: regel.bewaaradvies,
                houdbaarheidDagen: regel.houdbaarheidDagen, stapHoudbaarheidDagen: regel.stapHoudbaarheidDagen,
                haccpPunten: regel.haccpPunten,
            },
            afronden: async (blok) => {
                const json = await post('/api/productie/partij-afronden', { prepTaskId: regel.taakId, ...blok });
                return { ok: true, bestond: !!json.bestond, ...(json.partij as object), eenheden: json.eenheden as PartijAntwoord['eenheden'] };
            },
        });
    }

    const stickerSheet = sticker ? (
        <ProductieAfrondenSheet
            open={true}
            onClose={() => { setSticker(null); setFase('taak'); }}
            product={sticker.product}
            afronden={sticker.afronden}
        />
    ) : null;

    async function stuur(pad: string, body: Record<string, unknown>) {
        setBezig(true);
        setBericht(null);
        try {
            const res = await fetch(pad, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setBericht(json.error ?? `Mislukt (${res.status})`);
                return false;
            }
            setBericht(json.bericht ?? 'Genoteerd.');
            return true;
        } catch (e) {
            setBericht(e instanceof Error ? e.message : 'Geen verbinding');
            return false;
        } finally {
            setBezig(false);
        }
    }

    if (!data || taakId == null) {
        return (
            <Doek>
                {stickerSheet}
                <div style={{ ...midden, flexDirection: 'column', gap: 20 }}>
                    <div style={{ fontFamily: LETTER.display, fontWeight: 200, fontSize: 64, textAlign: 'center' }}>
                        {data ? 'Niets te doen' : 'Verbinden…'}
                    </div>
                    {verbindingKwijt && (
                        <div style={{ fontSize: 28, color: K.alarm }}>Geen verbinding met de planning.</div>
                    )}
                </div>
                <AfTeMakenLijst regels={afTeMaken} onKies={openStickerVoor} />
            </Doek>
        );
    }

    if (fase === 'loopt-uit') {
        return (
            <LooptUit
                titel={nu!.kop}
                geplandMin={nu!.vanMin}
                bezig={bezig}
                bericht={bericht}
                terug={() => setFase('taak')}
                meld={async (werkelijkeMin) => {
                    const gelukt = await stuur('/api/productie/klopt-niet', {
                        taakId, werkelijkeMin, onderbroken: false,
                    });
                    if (gelukt) setFase('taak');
                }}
            />
        );
    }

    if (fase === 'klaar-bevestigen') {
        return (
            <KlaarBevestigen
                titel={nu!.kop}
                gewerkt={nu!.bezigSinds}
                ingepland={nu!.vanMin}
                hoeveelheid={hoeveelheid}
                zetHoeveelheid={setHoeveelheid}
                bezig={bezig}
                bericht={bericht}
                terug={() => setFase('taak')}
                bevestig={async (onderbroken) => {
                    /* Eindstap met een bouwsteen: de partij en de labels horen bij
                       dezelfde klik. De sheet stuurt complete-task mét partij-blok. */
                    const p = nu!.partij;
                    if (p?.mogelijk && !p.partij) {
                        setSticker({
                            product: {
                                naam: p.componentNaam, hoeveelheid: hoeveelheid ?? p.hoeveelheid, eenheid: p.eenheid,
                                verpakkingGrootte: p.verpakkingGrootte, verpakkingEenheid: p.verpakkingEenheid,
                                bewaarmethode: p.bewaarmethode, bewaaradvies: p.bewaaradvies,
                                houdbaarheidDagen: p.houdbaarheidDagen, stapHoudbaarheidDagen: p.stapHoudbaarheidDagen,
                                haccpPunten: p.haccpPunten,
                            },
                            afronden: async (blok) => {
                                const json = await post('/api/prep/complete-task', { taskId: taakId, actualQty: blok.actualQty, onderbroken, partij: blok });
                                const partij = json.partij as Record<string, unknown> | null;
                                if (!partij) return { ok: false, error: 'Taak is klaar gemeld, maar de partij is niet gemaakt' };
                                if (partij.ok === false) return { ok: false, error: String(partij.error ?? 'Partij mislukt'), code: partij.code as string | undefined };
                                return { ok: true, bestond: !!partij.bestond, ...partij, eenheden: partij.eenheden as PartijAntwoord['eenheden'] };
                            },
                        });
                        return;
                    }
                    const gelukt = await stuur('/api/prep/complete-task', {
                        taskId: taakId,
                        actualQty: hoeveelheid,
                        onderbroken,
                    });
                    if (gelukt) setFase('taak');
                }}
            />
        );
    }

    return (
        <Doek>
            {stickerSheet}
            <div style={{ padding: '36px 36px 0', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'baseline' }}>
                    <div style={{ ...mono, fontSize: 24, letterSpacing: '.16em', color: K.stof }}>
                        {nu!.station ? `STATION ${nu!.station.toUpperCase()}` : 'GEEN STATION'}
                    </div>
                    <div style={{ ...mono, marginLeft: 'auto', fontSize: 26, color: K.stof }}>{data.status.tijd}</div>
                </div>

                <div style={{ fontFamily: LETTER.display, fontWeight: 200, fontSize: 76, lineHeight: 1, marginTop: 24 }}>
                    {nu!.kop}
                </div>
                {nu!.regel && <div style={{ fontSize: 30, marginTop: 20 }}>{nu!.regel}</div>}
                {nu!.toelichting && <div style={{ fontSize: 26, marginTop: 10, color: K.stof }}>{nu!.toelichting}</div>}

                <div style={{ marginTop: 40, display: 'flex', alignItems: 'flex-end', gap: 24 }}>
                    <div style={{ ...mono, fontSize: 120, lineHeight: .85, color: nu!.resterend ? K.olijfLicht : K.stofDiep }}>
                        {nu!.resterend ?? '—'}
                    </div>
                    <div style={{
                        ...mono, fontSize: 22, letterSpacing: '.1em', color: bronKleur(nu!.duurBron),
                        border: `1px solid ${bronRand(nu!.duurBron)}`, padding: '5px 12px', marginBottom: 14,
                    }}>
                        {BRON_LABEL[nu!.duurBron] ?? nu!.duurBron.toUpperCase()}
                    </div>
                </div>
                {nu!.bezigSinds && nu!.vanMin != null && (
                    <div style={{ fontSize: 24, color: K.stof, marginTop: 12 }}>
                        bezig {nu!.bezigSinds} · van {nu!.vanMin} min
                    </div>
                )}
                {nu!.tempDoelC != null && (
                    <div style={{ ...mono, fontSize: 34, marginTop: 16 }}>kern {nu!.tempDoelC} °C</div>
                )}

                {bericht && <div style={{ fontSize: 26, color: K.waarschuwing, marginTop: 24 }}>{bericht}</div>}

                <AfTeMakenLijst regels={afTeMaken} onKies={openStickerVoor} />
            </div>

            {/* Klaar is negen van de tien keer de handeling, dus die krijgt de
                volle breedte en de enige kleur. */}
            <div style={{ padding: 36, display: 'flex', flexDirection: 'column', gap: 18 }}>
                <Knop
                    label="Klaar"
                    hoofd
                    uit={bezig}
                    onClick={() => {
                        setHoeveelheid(null);
                        setBericht(null);
                        setFase('klaar-bevestigen');
                    }}
                />
                <div style={{ display: 'flex', gap: 18 }}>
                    <Knop label="Start" uit={bezig} onClick={() => void stuur('/api/prep/start-task', { taskId: taakId })} />
                    <Knop label="Loopt uit" uit={bezig} onClick={() => setFase('loopt-uit')} />
                </div>
            </div>
        </Doek>
    );
}

/**
 * Bereid, nog geen sticker. Blijft staan tot de partij er is — ook na
 * herladen, want de lijst komt van de server.
 */
function AfTeMakenLijst({ regels, onKies }: { regels: AfTeMakenRegel[]; onKies: (r: AfTeMakenRegel) => void }) {
    if (regels.length === 0) return null;
    return (
        <div style={{ marginTop: 'auto', paddingTop: 28 }}>
            <div style={{ ...mono, fontSize: 22, letterSpacing: '.16em', color: '#e0b45a' }}>
                AF TE MAKEN MET STICKER
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                {regels.map((r) => (
                    <button
                        key={r.taakId}
                        type="button"
                        onClick={() => onKies(r)}
                        style={{
                            height: 96, display: 'flex', alignItems: 'center', gap: 18, padding: '0 24px',
                            background: 'rgba(224,180,90,.12)', border: '2px solid rgba(224,180,90,.55)', color: K.wit,
                            fontFamily: LETTER.tekst, fontSize: 28, textAlign: 'left', cursor: 'pointer',
                        }}
                    >
                        <span style={{ flex: 1 }}>{r.componentNaam}{r.hoeveelheid != null ? ` · ${r.hoeveelheid} ${r.eenheid ?? ''}` : ''}</span>
                        <span style={{ fontSize: 22, color: '#e0b45a', fontWeight: 600 }}>Sticker →</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

/**
 * Loopt uit — hij keurt de schatting af.
 *
 * Bewust géén knop die zelf een getal verzint. Een systeem dat zijn eigen
 * metingen invult leert zijn eigen aannames, en dat is erger dan niet leren.
 * Hij geeft op hoeveel het écht wordt; de startwaarde is de geplande duur,
 * zodat hij alleen hoeft bij te tikken.
 */
export function LooptUit(props: {
    titel: string;
    geplandMin: number | null;
    bezig: boolean;
    bericht: string | null;
    terug: () => void;
    meld: (werkelijkeMin: number) => void;
}) {
    const { titel, geplandMin, bezig, bericht, terug, meld } = props;
    const [minuten, setMinuten] = useState<number>(geplandMin ?? 30);
    /* De stapgrootte schaalt mee: bij een gaarstap van vijf uur is vijf
       minuten per tik zestig tikken, en dan gaat hij het niet doen. */
    const stap = minuten >= 240 ? 30 : minuten >= 60 ? 15 : 5;

    return (
        <Doek>
            <div style={{ padding: 36, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ ...mono, fontSize: 24, letterSpacing: '.16em', color: K.stof }}>
                    {titel.toUpperCase()}
                </div>
                <div style={{ fontFamily: LETTER.display, fontWeight: 200, fontSize: 64, lineHeight: 1.05, marginTop: 24 }}>
                    Hoe lang duurt het echt?
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 28 }}>
                    <Vlak breed={150} onClick={() => setMinuten((m) => Math.max(stap, m - stap))}>−</Vlak>
                    <div style={{
                        flex: 1, height: 150, background: K.vlak, display: 'flex',
                        alignItems: 'baseline', justifyContent: 'center', gap: 14,
                    }}>
                        <div style={{ ...mono, fontSize: 80 }}>{minuten}</div>
                        <div style={{ fontSize: 30, color: K.stof }}>min</div>
                    </div>
                    <Vlak breed={150} onClick={() => setMinuten((m) => m + stap)}>+</Vlak>
                </div>

                {geplandMin != null && (
                    <div style={{ fontSize: 24, color: K.stof, marginTop: 14 }}>
                        ingepland {geplandMin} min · stapjes van {stap}
                    </div>
                )}
                <div style={{ fontSize: 24, color: K.stof, marginTop: 20, lineHeight: 1.4 }}>
                    Dit telt als volwaardige meting. Vanaf vijf keer rekent de planning hiermee.
                </div>

                {bericht && <div style={{ fontSize: 26, color: K.waarschuwing, marginTop: 20 }}>{bericht}</div>}
            </div>

            <div style={{ padding: 36, display: 'flex', flexDirection: 'column', gap: 18 }}>
                <button
                    type="button"
                    disabled={bezig}
                    onClick={() => meld(minuten)}
                    style={{
                        height: 150, background: K.olijf, color: '#0F1207', border: 'none',
                        fontFamily: LETTER.tekst, fontSize: 46, fontWeight: 600,
                        opacity: bezig ? .5 : 1, cursor: 'pointer',
                    }}
                >
                    Doorgeven
                </button>
                <button
                    type="button"
                    onClick={terug}
                    style={{
                        height: 96, background: 'transparent', color: K.stof,
                        border: `2px solid ${K.lijnSterk}`, fontFamily: LETTER.tekst, fontSize: 30, cursor: 'pointer',
                    }}
                >
                    Terug
                </button>
            </div>
        </Doek>
    );
}

export function KlaarBevestigen(props: {
    titel: string;
    gewerkt: string | null;
    ingepland: number | null;
    hoeveelheid: number | null;
    zetHoeveelheid: (v: number | null) => void;
    bezig: boolean;
    bericht: string | null;
    terug: () => void;
    bevestig: (onderbroken: boolean) => void;
}) {
    const { titel, gewerkt, ingepland, hoeveelheid, zetHoeveelheid, bezig, bericht, terug, bevestig } = props;
    const [onderbroken, setOnderbroken] = useState<boolean | null>(null);
    const stap = 0.2;
    const waarde = hoeveelheid ?? 0;

    return (
        <Doek>
            <div style={{ padding: 36, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ ...mono, fontSize: 24, letterSpacing: '.16em', color: K.stof }}>
                    {titel.toUpperCase()}{gewerkt ? ` · ${gewerkt} GEWERKT` : ''}
                </div>

                <div style={{ fontFamily: LETTER.display, fontWeight: 200, fontSize: 64, lineHeight: 1.05, marginTop: 24 }}>
                    Hoeveel is het geworden?
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 28 }}>
                    <Vlak breed={150} onClick={() => zetHoeveelheid(Math.max(0, round1(waarde - stap)))}>−</Vlak>
                    <div style={{
                        flex: 1, height: 150, background: K.vlak, display: 'flex',
                        alignItems: 'baseline', justifyContent: 'center', gap: 14,
                    }}>
                        <div style={{ ...mono, fontSize: 80 }}>{waarde.toFixed(1).replace('.', ',')}</div>
                        <div style={{ fontSize: 30, color: K.stof }}>kg</div>
                    </div>
                    <Vlak breed={150} onClick={() => zetHoeveelheid(round1(waarde + stap))}>+</Vlak>
                </div>
                {ingepland != null && (
                    <div style={{ fontSize: 24, color: K.stof, marginTop: 14 }}>
                        ingepland {ingepland} min · stapjes van 0,2
                    </div>
                )}

                <div style={{ fontFamily: LETTER.display, fontWeight: 200, fontSize: 64, lineHeight: 1.05, marginTop: 52 }}>
                    Ben je onderbroken?
                </div>
                <div style={{ display: 'flex', gap: 18, marginTop: 24 }}>
                    <Keuze
                        gekozen={onderbroken === false}
                        boven="Nee"
                        onder="doorgewerkt"
                        onClick={() => setOnderbroken(false)}
                    />
                    <Keuze
                        gekozen={onderbroken === true}
                        boven="Ja"
                        onder="tijd telt niet mee"
                        onClick={() => setOnderbroken(true)}
                    />
                </div>
                <div style={{ fontSize: 24, color: K.stof, marginTop: 14, lineHeight: 1.4 }}>
                    Bij ja meet ik deze keer niet mee — anders komt er straks 24 min in omdat de leverancier aanbelde.
                </div>

                {bericht && <div style={{ fontSize: 26, color: K.waarschuwing, marginTop: 20 }}>{bericht}</div>}
            </div>

            <div style={{ padding: 36, display: 'flex', flexDirection: 'column', gap: 18 }}>
                <button
                    type="button"
                    disabled={bezig || onderbroken == null}
                    onClick={() => bevestig(onderbroken === true)}
                    style={{
                        height: 150, background: onderbroken == null ? K.grijs : K.wit,
                        color: onderbroken == null ? K.stof : K.zwart, border: 'none',
                        fontFamily: LETTER.tekst, fontSize: 46, fontWeight: 600, cursor: 'pointer',
                    }}
                >
                    {onderbroken == null ? 'Kies eerst hierboven' : 'Klaar melden'}
                </button>
                <button
                    type="button"
                    onClick={terug}
                    style={{
                        height: 96, background: 'transparent', color: K.stof,
                        border: `2px solid ${K.lijnSterk}`, fontFamily: LETTER.tekst, fontSize: 30, cursor: 'pointer',
                    }}
                >
                    Terug
                </button>
            </div>
        </Doek>
    );
}

/* ── Bouwstenen ─────────────────────────────────────────────────── */

function Knop({ label, hoofd, uit, onClick }: { label: string; hoofd?: boolean; uit?: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            disabled={uit}
            onClick={onClick}
            style={{
                flex: 1, height: 150,
                background: hoofd ? K.olijf : 'transparent',
                color: hoofd ? '#0F1207' : K.wit,
                border: hoofd ? 'none' : `2px solid ${K.lijnSterk}`,
                fontFamily: LETTER.tekst, fontSize: hoofd ? 46 : 36, fontWeight: hoofd ? 600 : 400,
                opacity: uit ? .5 : 1, cursor: 'pointer',
            }}
        >
            {label}
        </button>
    );
}

function Vlak({ breed, children, onClick }: { breed: number; children: React.ReactNode; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            style={{
                width: breed, height: 150, background: 'transparent', color: K.wit,
                border: `2px solid ${K.lijnSterk}`, fontFamily: LETTER.cijfer, fontSize: 56, cursor: 'pointer',
            }}
        >
            {children}
        </button>
    );
}

function Keuze({ gekozen, boven, onder, onClick }: { gekozen: boolean; boven: string; onder: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            style={{
                flex: 1, height: 170, background: gekozen ? K.olijf : K.vlak,
                border: gekozen ? 'none' : `2px solid ${K.lijnSterk}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
                fontFamily: LETTER.tekst, cursor: 'pointer',
            }}
        >
            <span style={{ fontSize: 40, color: gekozen ? '#0F1207' : K.wit }}>{boven}</span>
            <span style={{ fontSize: 24, color: gekozen ? '#243009' : K.stof }}>{onder}</span>
        </button>
    );
}

function Doek({ children }: { children: React.ReactNode }) {
    return (
        <div style={{
            position: 'fixed', inset: 0, background: K.zwart, color: K.wit,
            fontFamily: LETTER.tekst, fontVariantNumeric: 'tabular-nums',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
            {children}
        </div>
    );
}

const mono: React.CSSProperties = { fontFamily: LETTER.cijfer };
const midden: React.CSSProperties = {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
};

function round1(n: number): number {
    return Math.round(n * 10) / 10;
}
