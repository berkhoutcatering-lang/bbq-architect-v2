'use client';

/**
 * Recept uit een boek → jouw receptuur.
 *
 * Drie schermen achter elkaar: foto's kiezen, wachten, en dan de goedkeur-lade.
 * Die laatste is waar het om gaat — daar zie je wat er vertaald is, wat er
 * vervallen is en waarom, en wat er nog beslist moet worden. Pas als dat leeg
 * is, gaat de opslaan-knop van het slot.
 *
 * De foto's gaan niet de opslag in. Ze worden verkleind, verstuurd, gelezen en
 * vergeten. Alleen jouw eigen vertaalde receptuur blijft achter.
 */

import { useCallback, useRef, useState } from 'react';
import {
    openstaandeVragen,
    soortVraag,
    type Controle,
    type GecontroleerdeStap,
    type Antwoorden,
} from '@/lib/keukenplanner/ontleder';

type Fase = 'kiezen' | 'bezig' | 'nakijken';

/** Eenheden die de rest van de app kent — dezelfde lijst als de opslagroute. */
const EENHEDEN = ['g', 'kg', 'ml', 'l', 'stuk'] as const;

interface Invulling {
    antwoorden: Antwoorden;
    /** Eenheid per component die aangemaakt gaat worden. */
    eenheden: Record<string, string>;
}

const LEEG: Invulling = {
    antwoorden: {
        herhaalDuren: {}, akkoordOndanks: [],
        componenten: [], componentenOvergeslagen: [], keuzes: {},
    },
    eenheden: {},
};

export default function OntledenClient() {
    const [fase, setFase] = useState<Fase>('kiezen');
    const [fotos, setFotos] = useState<string[]>([]);
    const [opmerking, setOpmerking] = useState('');
    const [controle, setControle] = useState<Controle | null>(null);
    const [kosten, setKosten] = useState<{ centen: number } | null>(null);
    const [fout, setFout] = useState<string | null>(null);
    const [invulling, setInvulling] = useState<Invulling>(LEEG);
    const [bezigMetOpslaan, setBezigMetOpslaan] = useState(false);
    const [resultaat, setResultaat] = useState<{ gerechtId: string; waarschuwing: string | null } | null>(null);
    const invoer = useRef<HTMLInputElement>(null);

    const kiesBestanden = useCallback(async (lijst: FileList | null) => {
        if (!lijst) return;
        setFout(null);
        const nieuw: string[] = [];
        for (const bestand of Array.from(lijst).slice(0, 6)) {
            try {
                nieuw.push(await verklein(bestand));
            } catch {
                setFout(`${bestand.name} kon niet gelezen worden`);
            }
        }
        setFotos((b) => [...b, ...nieuw].slice(0, 6));
    }, []);

    async function ontleed() {
        setFase('bezig');
        setFout(null);
        try {
            const res = await fetch('/api/recipe/ontleed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fotos, opmerking }),
            });
            const json = await res.json();
            if (!res.ok) {
                setFout(json.error ?? `Mislukt (${res.status})`);
                setFase('kiezen');
                return;
            }
            setControle(json.controle);
            setKosten(json.kosten ?? null);
            setInvulling(LEEG);
            setResultaat(null);
            setFase('nakijken');
        } catch (e) {
            setFout(e instanceof Error ? e.message : 'Geen verbinding');
            setFase('kiezen');
        }
    }

    async function bewaar() {
        if (!controle) return;
        setBezigMetOpslaan(true);
        setFout(null);
        try {
            const res = await fetch('/api/recipe/ontleed/opslaan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    controle,
                    antwoorden: invulling.antwoorden,
                    nieuweComponenten: (invulling.antwoorden.componenten ?? [])
                        .map((naam) => ({ naam, eenheid: invulling.eenheden[naam] ?? 'g' })),
                }),
            });
            const json = await res.json();
            if (!res.ok) {
                setFout(json.error ?? `Opslaan mislukt (${res.status})`);
                return;
            }
            setResultaat({ gerechtId: json.gerechtId, waarschuwing: json.waarschuwing ?? null });
        } catch (e) {
            setFout(e instanceof Error ? e.message : 'Geen verbinding');
        } finally {
            setBezigMetOpslaan(false);
        }
    }

    /* Dezelfde regel als de opslagroute gebruikt. Eén plek, geen twee waarheden. */
    const openstaand = controle ? openstaandeVragen(controle, invulling.antwoorden) : [];

    return (
        <div style={{ maxWidth: 880, margin: '0 auto', padding: '32px 20px 96px' }}>
            <h1 style={{ fontSize: 30, fontWeight: 600, marginBottom: 6 }}>Recept uit een boek</h1>
            <p style={{ color: 'var(--kf-muted, #8A8F98)', marginBottom: 28, lineHeight: 1.5 }}>
                Foto van een receptpagina erin, en je krijgt hem terug zoals hij hier gemaakt wordt —
                op jouw apparatuur. De foto zelf wordt niet bewaard.
            </p>

            {fout && <Melding soort="fout">{fout}</Melding>}

            {fase === 'kiezen' && (
                <Kiezen
                    fotos={fotos}
                    zetFotos={setFotos}
                    opmerking={opmerking}
                    zetOpmerking={setOpmerking}
                    invoer={invoer}
                    kiesBestanden={kiesBestanden}
                    start={() => void ontleed()}
                />
            )}

            {fase === 'bezig' && (
                <div style={{ padding: '56px 0', textAlign: 'center', color: 'var(--kf-muted, #8A8F98)' }}>
                    <div style={{ fontSize: 18, marginBottom: 8 }}>Aan het lezen en omzetten…</div>
                    <div style={{ fontSize: 14 }}>Duurt ongeveer een minuut.</div>
                </div>
            )}

            {fase === 'nakijken' && controle && (
                <Lade
                    controle={controle}
                    kosten={kosten}
                    invulling={invulling}
                    zetInvulling={setInvulling}
                    openstaand={openstaand}
                    bezigMetOpslaan={bezigMetOpslaan}
                    resultaat={resultaat}
                    bewaar={() => void bewaar()}
                    opnieuw={() => { setFase('kiezen'); setControle(null); setResultaat(null); setFotos([]); }}
                />
            )}
        </div>
    );
}

/* ── Foto's kiezen ──────────────────────────────────────────────── */

function Kiezen(props: {
    fotos: string[];
    zetFotos: (fn: (b: string[]) => string[]) => void;
    opmerking: string;
    zetOpmerking: (v: string) => void;
    invoer: React.RefObject<HTMLInputElement | null>;
    kiesBestanden: (l: FileList | null) => Promise<void>;
    start: () => void;
}) {
    const { fotos, zetFotos, opmerking, zetOpmerking, invoer, kiesBestanden, start } = props;

    return (
        <>
            <div
                onClick={() => invoer.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); void kiesBestanden(e.dataTransfer.files); }}
                style={{
                    border: '2px dashed var(--kf-border, #2B2E33)', borderRadius: 12,
                    padding: 44, textAlign: 'center', cursor: 'pointer',
                    background: 'var(--kf-card, #1B1D21)',
                }}
            >
                <div style={{ fontSize: 17, marginBottom: 6 }}>Sleep hier de foto&apos;s van het recept</div>
                <div style={{ color: 'var(--kf-muted, #8A8F98)', fontSize: 14 }}>of klik om te kiezen · hooguit zes</div>
            </div>
            <input
                ref={invoer} type="file" accept="image/*" multiple hidden
                onChange={(e) => void kiesBestanden(e.target.files)}
            />

            {fotos.length > 0 && (
                <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                    {fotos.map((f, i) => (
                        <div key={i} style={{ position: 'relative' }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={f} alt="" style={{ height: 110, borderRadius: 8, display: 'block' }} />
                            <button
                                type="button"
                                aria-label="Foto weghalen"
                                onClick={() => zetFotos((b) => b.filter((_, j) => j !== i))}
                                style={{
                                    position: 'absolute', top: 4, right: 4, border: 'none',
                                    background: 'rgba(0,0,0,.65)', color: '#fff', borderRadius: 6,
                                    width: 24, height: 24, cursor: 'pointer', lineHeight: 1,
                                }}
                            >×</button>
                        </div>
                    ))}
                </div>
            )}

            <textarea
                value={opmerking}
                onChange={(e) => zetOpmerking(e.target.value)}
                placeholder="Iets wat hij moet weten? Bijvoorbeeld: dit doen we altijd op de houtskoolgrill."
                rows={2}
                style={{
                    width: '100%', marginTop: 16, padding: 12, borderRadius: 8,
                    border: '1px solid var(--kf-border, #2B2E33)', background: 'var(--kf-card, #1B1D21)',
                    color: 'inherit', font: 'inherit', resize: 'vertical',
                }}
            />

            <button
                type="button"
                disabled={fotos.length === 0}
                onClick={start}
                style={{ ...knop, marginTop: 16, opacity: fotos.length === 0 ? .45 : 1 }}
            >
                Lees het recept
            </button>
        </>
    );
}

/* ── De goedkeur-lade ───────────────────────────────────────────── */

function Lade(props: {
    controle: Controle;
    kosten: { centen: number } | null;
    invulling: Invulling;
    zetInvulling: (fn: (i: Invulling) => Invulling) => void;
    openstaand: string[];
    bezigMetOpslaan: boolean;
    resultaat: { gerechtId: string; waarschuwing: string | null } | null;
    bewaar: () => void;
    opnieuw: () => void;
}) {
    const { controle, kosten, invulling, zetInvulling, openstaand, bezigMetOpslaan, resultaat, bewaar, opnieuw } = props;
    const s = controle.samenvatting;
    const { antwoorden } = invulling;

    if (resultaat) {
        return (
            <>
                <Melding soort="goed">Opgeslagen. {controle.gerechtNaam} staat nu in je gerechtenboek.</Melding>
                {resultaat.waarschuwing && <Melding soort="fout">{resultaat.waarschuwing}</Melding>}
                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                    <a href={`/gerechten/${resultaat.gerechtId}`} style={{ ...knop, textDecoration: 'none' }}>
                        Bekijk het gerecht
                    </a>
                    <button type="button" onClick={opnieuw} style={knopLicht}>Nog een recept</button>
                </div>
            </>
        );
    }

    return (
        <>
            <h2 style={{ fontSize: 23, fontWeight: 600, marginBottom: 4 }}>{controle.gerechtNaam}</h2>
            <p style={{ color: 'var(--kf-muted, #8A8F98)', marginBottom: 4 }}>
                {controle.porties ?? antwoorden.porties ?? '?'} porties · {s.stappen} stappen
            </p>

            {/* Het boek zegt soms "voor circa 1,5 kg" en geen aantal personen.
                Daar hoort geen stille tien voor in de plaats — je kostprijs per
                portie hangt eraan. */}
            {controle.porties == null && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '10px 0 4px' }}>
                    <span style={{ fontSize: 14 }}>Voor hoeveel porties is dit?</span>
                    <input
                        type="number" min={1} placeholder="aantal"
                        value={antwoorden.porties ?? ''}
                        onChange={(e) => zetInvulling((i) => ({
                            ...i, antwoorden: { ...i.antwoorden, porties: Number(e.target.value) || null },
                        }))}
                        aria-label="Aantal porties"
                        style={getal}
                    />
                </div>
            )}
            {/* Nooit "1 min werk" als kop zetten terwijl veertien stappen nog geen
                tijd hebben — dan lees je een halve dag als één minuut. Er staat
                bij over hoeveel stappen het gaat. */}
            <p style={{ color: 'var(--kf-muted, #8A8F98)', marginBottom: 4 }}>
                {s.stappen - s.zonderTijd === 0
                    ? 'Nog geen enkele stap heeft een tijd — die worden gemeten zodra je hem draait.'
                    : `Bekende tijd over ${s.stappen - s.zonderTijd} van de ${s.stappen} stappen:`
                        + ` ${s.actiefMin} min werk`
                        + (s.passiefMin > 0 ? `, ${formatWacht(s.passiefMin)} wachten` : '')
                        + (s.zonderTijd > 0 ? ` · de andere ${s.zonderTijd} worden gemeten` : '')}
            </p>
            {kosten && (
                <p style={{ color: 'var(--kf-muted, #8A8F98)', fontSize: 13, marginBottom: 20 }}>
                    Dit lezen kostte € {(kosten.centen / 100).toFixed(2)}.
                </p>
            )}

            {controle.vervallen.length > 0 && (
                <Blok titel="Vervallen op onze apparatuur">
                    {controle.vervallen.map((v, i) => (
                        <div key={i} style={{ marginBottom: 10 }}>
                            <div style={{ textDecoration: 'line-through', color: 'var(--kf-muted, #8A8F98)' }}>{v.tekst}</div>
                            <div style={{ fontSize: 13, color: 'var(--brand, #6B7A3F)' }}>{v.reden}</div>
                        </div>
                    ))}
                </Blok>
            )}

            {controle.keuzes.length > 0 && (
                <Blok titel="Hier komt hij zelf niet uit">
                    {controle.keuzes.map((k) => (
                        <div key={k.vraag} style={{ marginBottom: 14 }}>
                            <div style={{ marginBottom: 6 }}>{k.vraag}</div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {k.opties.map((optie) => {
                                    const gekozen = (antwoorden.keuzes ?? {})[k.vraag] === optie;
                                    return (
                                        <button
                                            key={optie}
                                            type="button"
                                            onClick={() => zetInvulling((i) => ({
                                                ...i,
                                                antwoorden: {
                                                    ...i.antwoorden,
                                                    keuzes: { ...(i.antwoorden.keuzes ?? {}), [k.vraag]: optie },
                                                },
                                            }))}
                                            style={gekozen ? knopKlein : knopKleinUit}
                                        >{optie}</button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </Blok>
            )}

            {controle.ontbrekendeComponenten.length > 0 && (
                <Blok titel="Onderdelen die je nog niet hebt">
                    {controle.ontbrekendeComponenten.map((naam) => (
                        <ComponentKeuze
                            key={naam}
                            naam={naam}
                            keuze={
                                (antwoorden.componenten ?? []).includes(naam) ? 'aanmaken'
                                    : (antwoorden.componentenOvergeslagen ?? []).includes(naam) ? 'overslaan'
                                        : null
                            }
                            eenheid={invulling.eenheden[naam] ?? 'g'}
                            zetKeuze={(keuze) => zetInvulling((i) => ({
                                ...i,
                                antwoorden: {
                                    ...i.antwoorden,
                                    componenten: keuze === 'aanmaken'
                                        ? [...new Set([...(i.antwoorden.componenten ?? []), naam])]
                                        : (i.antwoorden.componenten ?? []).filter((n) => n !== naam),
                                    componentenOvergeslagen: keuze === 'overslaan'
                                        ? [...new Set([...(i.antwoorden.componentenOvergeslagen ?? []), naam])]
                                        : (i.antwoorden.componentenOvergeslagen ?? []).filter((n) => n !== naam),
                                },
                            }))}
                            zetEenheid={(e) => zetInvulling((i) => ({ ...i, eenheden: { ...i.eenheden, [naam]: e } }))}
                        />
                    ))}
                </Blok>
            )}

            <Blok titel="De stappen">
                {controle.stappen.map((stap) => (
                    <StapRegel
                        key={stap.volgnummer}
                        stap={stap}
                        herhaalDuur={(antwoorden.herhaalDuren ?? {})[stap.volgnummer]}
                        akkoord={(antwoorden.akkoordOndanks ?? []).includes(stap.volgnummer)}
                        zetHerhaalDuur={(min) => zetInvulling((i) => ({
                            ...i,
                            antwoorden: {
                                ...i.antwoorden,
                                herhaalDuren: { ...(i.antwoorden.herhaalDuren ?? {}), [stap.volgnummer]: min },
                            },
                        }))}
                        zetAkkoord={() => zetInvulling((i) => ({
                            ...i,
                            antwoorden: {
                                ...i.antwoorden,
                                akkoordOndanks: [...new Set([...(i.antwoorden.akkoordOndanks ?? []), stap.volgnummer])],
                            },
                        }))}
                    />
                ))}
            </Blok>

            <div style={{ marginTop: 24, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                    type="button"
                    disabled={openstaand.length > 0 || bezigMetOpslaan}
                    onClick={bewaar}
                    style={{ ...knop, opacity: openstaand.length > 0 || bezigMetOpslaan ? .45 : 1 }}
                >
                    {bezigMetOpslaan ? 'Bezig…' : 'Opslaan in mijn gerechtenboek'}
                </button>
                <button type="button" onClick={opnieuw} style={knopLicht}>Opnieuw beginnen</button>
            </div>

            {openstaand.length > 0 && (
                <p style={{ marginTop: 12, color: 'var(--kf-muted, #8A8F98)', fontSize: 14 }}>
                    Nog {openstaand.length} ding{openstaand.length === 1 ? '' : 'en'} te beslissen — bovenaan: {openstaand[0]}
                </p>
            )}
        </>
    );
}

function ComponentKeuze(props: {
    naam: string;
    keuze: 'aanmaken' | 'overslaan' | null;
    eenheid: string;
    zetKeuze: (k: 'aanmaken' | 'overslaan') => void;
    zetEenheid: (e: string) => void;
}) {
    const { naam, keuze, eenheid, zetKeuze, zetEenheid } = props;
    return (
        <div style={{ padding: '10px 0', borderBottom: '1px solid var(--kf-border, #2B2E33)' }}>
            <div style={{ marginBottom: 6 }}><strong>{naam}</strong> bestaat nog niet als bouwsteen.</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" onClick={() => zetKeuze('aanmaken')} style={keuze === 'aanmaken' ? knopKlein : knopKleinUit}>
                    Aanmaken
                </button>
                <button type="button" onClick={() => zetKeuze('overslaan')} style={keuze === 'overslaan' ? knopKlein : knopKleinUit}>
                    Hoort bij dit gerecht
                </button>
                {keuze === 'aanmaken' && (
                    <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: 'var(--kf-muted, #8A8F98)' }}>
                        kostprijs straks per
                        <select
                            value={eenheid}
                            onChange={(e) => zetEenheid(e.target.value)}
                            style={{
                                padding: '4px 8px', borderRadius: 6, font: 'inherit', color: 'inherit',
                                background: 'var(--kf-card, #1B1D21)', border: '1px solid var(--kf-border, #2B2E33)',
                            }}
                        >
                            {EENHEDEN.map((e) => <option key={e} value={e}>{e}</option>)}
                        </select>
                    </label>
                )}
            </div>
        </div>
    );
}

function StapRegel(props: {
    stap: GecontroleerdeStap;
    herhaalDuur: number | undefined;
    akkoord: boolean;
    zetHerhaalDuur: (min: number) => void;
    zetAkkoord: () => void;
}) {
    const { stap, herhaalDuur, akkoord, zetHerhaalDuur, zetAkkoord } = props;
    const vraag = stap.oordeel === 'vraag' ? soortVraag(stap.bezwaar) : null;

    const details = [
        stap.actiefMin != null ? `${stap.actiefMin} min werk` : null,
        stap.passiefMin != null ? `${formatWacht(stap.passiefMin)} wachten` : null,
        stap.materieelNaam,
        stap.tempC != null ? `${stap.tempC} °C` : null,
        stap.kernTempC != null ? `klaar bij kern ${stap.kernTempC} °C` : null,
        stap.herhaalIntervalMin != null ? `elke ${stap.herhaalIntervalMin} min iets doen` : null,
        stap.duurOnbekend ? 'tijd wordt gemeten' : null,
    ].filter(Boolean).join(' · ');

    return (
        <div style={{
            display: 'flex', gap: 12, padding: '10px 0',
            borderBottom: '1px solid var(--kf-border, #2B2E33)', alignItems: 'flex-start',
        }}>
            <div style={{ width: 26, color: 'var(--kf-muted, #8A8F98)', fontVariantNumeric: 'tabular-nums' }}>
                {stap.volgnummer}.
            </div>
            <div style={{ flex: 1 }}>
                <div>{stap.tekst}</div>
                {details && (
                    <div style={{ fontSize: 13, color: 'var(--kf-muted, #8A8F98)', marginTop: 2 }}>{details}</div>
                )}

                {vraag && !akkoord && (
                    <div style={{ marginTop: 8, color: '#C9A14A', fontSize: 13 }}>{stap.bezwaar}</div>
                )}
                {akkoord && (
                    <div style={{ marginTop: 8, fontSize: 13, color: 'var(--brand, #6B7A3F)' }}>
                        Jij zegt: klopt toch.
                    </div>
                )}

                {/* Bij een herhaling gaat het om de duur pér keer. Zonder dit veld
                    liep een stap als "elk half uur natspuiten" muurvast: de
                    controle zag terecht dat het niet paste, maar er was geen plek
                    om te zeggen dat het één minuut is. */}
                {vraag === 'herhaling' && !akkoord && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, color: 'var(--kf-muted, #8A8F98)' }}>
                            Hoe lang duurt het per keer?
                        </span>
                        <input
                            type="number" min={1} max={(stap.herhaalIntervalMin ?? 60) - 1} placeholder="min"
                            value={herhaalDuur ?? ''}
                            onChange={(e) => zetHerhaalDuur(Number(e.target.value))}
                            aria-label={`Duur per keer van stap ${stap.volgnummer} in minuten`}
                            style={getal}
                        />
                        <span style={{ fontSize: 13, color: 'var(--kf-muted, #8A8F98)' }}>
                            elke {stap.herhaalIntervalMin} min
                        </span>
                    </div>
                )}

                {/* Een oordeel is niet met een getal op te lossen. Dan beslist de
                    kok, want die kent zijn keuken beter dan de controle. */}
                {vraag && !akkoord && (
                    <button
                        type="button"
                        onClick={zetAkkoord}
                        style={{ ...knopKleinUit, marginTop: 8 }}
                    >
                        {vraag === 'oordeel' ? 'Klopt toch, laat maar staan' : 'Laat maar staan zoals hij staat'}
                    </button>
                )}
            </div>
        </div>
    );
}

/* ── Kleine bouwstenen ──────────────────────────────────────────── */

function Blok({ titel, children }: { titel: string; children: React.ReactNode }) {
    return (
        <section style={{
            marginTop: 20, padding: 16, borderRadius: 10,
            background: 'var(--kf-card, #1B1D21)', border: '1px solid var(--kf-border, #2B2E33)',
        }}>
            <h3 style={{
                fontSize: 12, letterSpacing: '.09em', textTransform: 'uppercase',
                color: 'var(--kf-muted, #8A8F98)', marginBottom: 12, fontWeight: 600,
            }}>{titel}</h3>
            {children}
        </section>
    );
}

function Melding({ soort, children }: { soort: 'fout' | 'goed'; children: React.ReactNode }) {
    return (
        <div style={{
            padding: '12px 14px', borderRadius: 8, marginBottom: 16,
            background: soort === 'fout' ? 'rgba(180,68,47,.14)' : 'rgba(107,122,63,.18)',
            border: `1px solid ${soort === 'fout' ? '#B4442F' : 'var(--brand, #6B7A3F)'}`,
        }}>{children}</div>
    );
}

const knop: React.CSSProperties = {
    padding: '10px 18px', borderRadius: 8, border: 'none',
    background: 'var(--brand, #6B7A3F)', color: '#F5F3EE', font: 'inherit',
    fontWeight: 600, cursor: 'pointer', display: 'inline-block',
};

const knopLicht: React.CSSProperties = {
    padding: '10px 18px', borderRadius: 8, border: '1px solid var(--kf-border, #2B2E33)',
    background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer',
};

const knopKlein: React.CSSProperties = {
    padding: '5px 12px', borderRadius: 6, border: '1px solid var(--brand, #6B7A3F)',
    background: 'var(--brand, #6B7A3F)', color: '#F5F3EE', font: 'inherit',
    fontSize: 13, cursor: 'pointer',
};

const getal: React.CSSProperties = {
    width: 84, padding: '5px 8px', borderRadius: 6,
    border: '1px solid var(--kf-border, #2B2E33)',
    background: 'var(--kf-card, #1B1D21)', color: 'inherit', font: 'inherit',
};

const knopKleinUit: React.CSSProperties = {
    ...knopKlein, background: 'transparent', color: 'inherit',
    border: '1px solid var(--kf-border, #2B2E33)',
};

/* ── Hulp ───────────────────────────────────────────────────────── */

/** Vier uur wachten lees je niet als 240. */
function formatWacht(min: number): string {
    if (min < 90) return `${min} min`;
    const uren = Math.floor(min / 60);
    const rest = min % 60;
    return rest === 0 ? `${uren} uur` : `${uren} u ${rest} min`;
}

/**
 * Verklein een foto voor verzending.
 *
 * Een telefoonfoto van vier megapixel kost onnodig veel tokens en leest niet
 * beter dan één van 1600 pixels breed. Scheelt geld per recept en tijd per
 * aanroep.
 */
async function verklein(bestand: File, maxZijde = 1600, kwaliteit = 0.85): Promise<string> {
    const bitmap = await createImageBitmap(bestand);
    const schaal = Math.min(1, maxZijde / Math.max(bitmap.width, bitmap.height));
    const breedte = Math.round(bitmap.width * schaal);
    const hoogte = Math.round(bitmap.height * schaal);

    const doek = document.createElement('canvas');
    doek.width = breedte;
    doek.height = hoogte;
    doek.getContext('2d')?.drawImage(bitmap, 0, 0, breedte, hoogte);
    bitmap.close();

    return doek.toDataURL('image/jpeg', kwaliteit);
}
