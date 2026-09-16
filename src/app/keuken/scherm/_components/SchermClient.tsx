'use client';

/**
 * Het wandscherm. 1920 × 1080, kiosk, read-only.
 *
 * Read-only is hier een bouwregel en geen gedragsregel: er staat geen enkele
 * knop, geen formulier en geen POST-aanroep in dit bestand. Niet een knop die
 * verborgen is — helemaal geen knop. Alle echte acties gebeuren op de tablet.
 *
 * Vier zones die nooit van plek wisselen, want hij moet blind weten waar hij
 * moet kijken: NU links (55%), STRAKS rechtsboven, MELDINGEN rechtsonder, en
 * een dunne statusbalk onderaan over de volle breedte.
 */

import { useEffect, useState } from 'react';
import { useKeukenscherm, OUD_NA_SECONDEN } from '../_lib/useKeukenscherm';
import { K, LETTER, BRON_LABEL, bronKleur, bronRand, aandachtKop } from './tokens';
import type { Keukenscherm, Melding, TijdlijnRegel } from '@/lib/keukenplanner/types';

export default function SchermClient() {
    const { data, leeftijdSec, verbindingKwijt, laatsteContact } = useKeukenscherm();
    return (
        <Wandscherm
            data={data}
            leeftijdSec={leeftijdSec}
            verbindingKwijt={verbindingKwijt}
            laatsteContact={laatsteContact}
        />
    );
}

/**
 * Het scherm zelf — puur presentatie, alles komt binnen als props.
 *
 * Bewust gescheiden van het ophalen: zo is elk van de zes toestanden los te
 * bekijken zonder database (zie /e2e-test/keukenscherm), en kan het scherm
 * nooit stiekem zelf gaan rekenen.
 */
export function Wandscherm({
    data, leeftijdSec, verbindingKwijt, laatsteContact,
}: {
    data: Keukenscherm | null;
    leeftijdSec: number;
    verbindingKwijt: boolean;
    laatsteContact: Date | null;
}) {
    if (!data) {
        return (
            <Doek>
                <div style={{ ...midden, color: K.stof, fontSize: 34 }}>Verbinden met de planning…</div>
            </Doek>
        );
    }

    if (verbindingKwijt) return <VerbindingKwijt leeftijdSec={leeftijdSec} laatsteContact={laatsteContact} data={data} />;

    const vrij = data.nu.aandacht !== 'actief';
    const leeg = data.stand === 'leeg';

    return (
        <Doek>
            <div style={{
                width: 1920, height: 1080, background: K.zwart, display: 'grid',
                gridTemplateColumns: '1056px 1fr', gridTemplateRows: '1fr 96px', overflow: 'hidden',
            }}>
                {/* ── NU ─────────────────────────────────────────────── */}
                <div style={{ borderRight: `1px solid ${K.lijn}`, display: 'flex', flexDirection: 'column' }}>
                    <div style={{
                        height: 64, display: 'flex', alignItems: 'center', padding: '0 56px',
                        borderBottom: `1px solid ${K.lijn}`,
                    }}>
                        <div style={{ ...mono, fontSize: 24, letterSpacing: '.16em', color: vrij && !leeg ? K.olijfLicht : K.stof }}>
                            {leeg ? 'NIETS MEER VOOR VANDAAG' : aandachtKop(data.nu.aandacht, data.nu.wachtNog)}
                        </div>
                        {data.nu.station && (
                            <div style={{ ...mono, marginLeft: 'auto', fontSize: 24, letterSpacing: '.06em', color: K.stof }}>
                                STATION {data.nu.station.toUpperCase()}
                            </div>
                        )}
                    </div>

                    <div style={{ padding: '48px 56px 56px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                        {leeg ? (
                            /* De klok is hier het onderwerp: hij loopt, dus het scherm
                               leeft. Dat is het enige wat op een lege dag bewezen hoeft
                               te worden — en het staat al in de kopregel hierboven, dus
                               de zin niet nog een keer groot herhalen. */
                            <div style={{
                                fontFamily: LETTER.display, fontWeight: 200,
                                fontSize: 176, lineHeight: .95, fontVariantNumeric: 'tabular-nums',
                            }}>
                                {data.status.tijd}
                            </div>
                        ) : (
                            <div style={{
                                fontFamily: LETTER.display, fontWeight: 200,
                                fontSize: data.nu.kop.length > 22 ? 96 : 128, lineHeight: .98,
                            }}>
                                {data.nu.kop}
                            </div>
                        )}

                        {data.nu.regel && <div style={{ fontSize: 38, marginTop: 28 }}>{data.nu.regel}</div>}
                        {data.nu.toelichting && (
                            <div style={{ fontSize: 30, marginTop: 14, color: K.stof }}>{data.nu.toelichting}</div>
                        )}

                        {/* Bij een lege dag neemt de klok de plek van de taak in: hij
                            loopt, dus het scherm leeft — dat is het enige wat hier
                            bewezen hoeft te worden. Geen leeg raster, geen etiket bij
                            een streepje, en geen "goed gedaan". */}
                        {leeg ? (
                            <div style={{ marginTop: 'auto', fontSize: 30, color: K.stof }}>
                                Morgen staat in het kookbord.
                            </div>
                        ) : (
                        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'flex-end', gap: 56 }}>
                            <div>
                                <div style={{ fontSize: 24, color: K.stof, marginBottom: 8 }}>
                                    {data.nu.resterend == null ? 'duur onbekend' : 'nog'}
                                </div>
                                <div style={{
                                    ...mono, fontSize: 180, lineHeight: .85,
                                    color: data.nu.resterend == null ? K.stofDiep : K.olijfLicht, letterSpacing: '-.02em',
                                }}>
                                    {data.nu.resterend ?? '—'}
                                </div>
                            </div>
                            <div style={{ paddingBottom: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <BronEtiket bron={data.nu.duurBron} />
                                {data.nu.bezigSinds && data.nu.vanMin != null && (
                                    <div style={{ fontSize: 26, color: K.stof }}>
                                        bezig {data.nu.bezigSinds} · van {data.nu.vanMin} min
                                    </div>
                                )}
                                {data.nu.tempDoelC != null && (
                                    <div style={{ ...mono, fontSize: 34, color: K.wit }}>kern {data.nu.tempDoelC} °C</div>
                                )}
                            </div>
                        </div>
                        )}

                        {/* Bij vrij: waar je op wacht, klein. Het werk staat groot. */}
                        {vrij && data.nu.wachtOp && (
                            <div style={{
                                marginTop: 36, padding: '20px 24px', background: K.grijs,
                                display: 'flex', alignItems: 'baseline', gap: 20,
                            }}>
                                <div style={{ fontSize: 26, color: K.stof }}>{data.nu.wachtOp}</div>
                                {data.nu.wachtNog && (
                                    <div style={{ ...mono, marginLeft: 'auto', fontSize: 30, color: K.olijfLicht }}>
                                        nog {data.nu.wachtNog}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── STRAKS + MELDINGEN ─────────────────────────────── */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ flex: 1, padding: '48px 44px', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ ...mono, fontSize: 22, letterSpacing: '.16em', color: K.stof, marginBottom: 24 }}>
                            STRAKS
                        </div>
                        {data.straks.length === 0 && (
                            <div style={{ fontSize: 30, color: K.stof }}>Niets meer ingepland.</div>
                        )}
                        {data.straks.map((r) => <StraksRegel key={r.taakId} regel={r} />)}
                    </div>

                    <div style={{
                        borderTop: `1px solid ${K.lijn}`, padding: '40px 44px',
                        display: 'flex', flexDirection: 'column', gap: 24, minHeight: 280,
                    }}>
                        <div style={{ ...mono, fontSize: 22, letterSpacing: '.16em', color: K.stof }}>MELDINGEN</div>
                        {/* Bereid maar nog geen sticker: groot in beeld. De knop zelf
                            staat op het kookbord en de tablet — dit scherm heeft er
                            geen (read-only, bouwregel). */}
                        {(data.afTeMaken ?? []).length > 0 && (
                            <div style={{ display: 'flex', gap: 18 }}>
                                <div style={{ width: 6, alignSelf: 'stretch', background: '#e0b45a', flex: 'none' }} />
                                <div>
                                    <div style={{ fontSize: 28, lineHeight: 1.35, color: K.wit }}>
                                        Af te maken met sticker: {data.afTeMaken!.map((r) => `${r.componentNaam}${r.hoeveelheid != null ? ` ${r.hoeveelheid} ${r.eenheid ?? ''}` : ''}`.trim()).join(' · ')}
                                    </div>
                                    <div style={{ fontSize: 24, color: '#e0b45a', marginTop: 6, fontStyle: 'italic' }}>Op de tablet of het kookbord: Afmaken met sticker →</div>
                                </div>
                            </div>
                        )}
                        {data.meldingen.length === 0 && (data.afTeMaken ?? []).length === 0
                            ? <div style={{ fontSize: 28, color: K.stof }}>Geen. Alles loopt op tijd.</div>
                            : data.meldingen.map((m) => <MeldingRegel key={m.id} melding={m} />)}
                    </div>
                </div>

                {/* ── Statusbalk ─────────────────────────────────────── */}
                <div style={{
                    gridColumn: '1 / -1', borderTop: `1px solid ${K.lijn}`, background: K.balk,
                    display: 'flex', alignItems: 'center', gap: 36, padding: '0 56px',
                }}>
                    <div style={{ ...mono, fontSize: 44 }}>{data.status.tijd}</div>
                    <div style={{ fontSize: 24, color: K.stof }}>
                        {data.status.takenOpen === 0 ? 'geen taken open' : `${data.status.takenOpen} taken open`}
                    </div>
                    <div style={{ fontSize: 24, color: K.stofDiep }}>·</div>
                    <div style={{ fontSize: 24, color: data.status.haccpOpen > 0 ? K.waarschuwing : K.stof }}>
                        {data.status.haccpOpen === 0
                            ? 'alle HACCP-registraties afgetekend'
                            : `${data.status.haccpOpen} HACCP-registratie${data.status.haccpOpen === 1 ? '' : 's'} vragen aandacht`}
                    </div>
                    <div style={{ ...mono, marginLeft: 'auto', fontSize: 24, color: leeftijdSec > 45 ? K.waarschuwing : K.stof }}>
                        ververst {leeftijdSec} s geleden
                    </div>
                </div>
            </div>
        </Doek>
    );
}

/* ── Onderdelen ─────────────────────────────────────────────────── */

function StraksRegel({ regel }: { regel: TijdlijnRegel }) {
    /* Tijdkritisch werk ziet er anders uit dan werk dat kan schuiven: een
       olijf streepje en volle tekst tegenover grijs en gedempt. */
    const kritisch = regel.tijdIsVast;
    return (
        <div style={{ display: 'flex', gap: 22, alignItems: 'center', padding: '18px 0' }}>
            <div style={{ width: 6, height: 44, background: kritisch ? K.olijf : K.grijs }} />
            <div style={{ ...mono, fontSize: 30, minWidth: 104, color: kritisch ? K.wit : K.stof }}>{regel.tijd}</div>
            <div style={{ fontSize: 30, color: kritisch ? K.wit : K.stof }}>
                {regel.titel}
                {regel.waar && <span style={{ color: K.stof }}> · {regel.waar}</span>}
            </div>
        </div>
    );
}

function MeldingRegel({ melding }: { melding: Melding }) {
    const kleur = melding.ernst === 'alarm' ? K.alarm : melding.ernst === 'waarschuwing' ? K.waarschuwing : K.stof;
    return (
        <div style={{ display: 'flex', gap: 18 }}>
            <div style={{ width: 6, alignSelf: 'stretch', background: kleur, flex: 'none' }} />
            <div>
                <div style={{ fontSize: 28, lineHeight: 1.35, color: melding.ernst === 'info' ? K.stof : K.wit }}>
                    {melding.kop}
                </div>
                {melding.uitleg && <div style={{ fontSize: 24, color: K.stof, marginTop: 6 }}>{melding.uitleg}</div>}
                {melding.verwacht && (
                    <div style={{ fontSize: 24, color: kleur, marginTop: 6, fontStyle: 'italic' }}>{melding.verwacht}</div>
                )}
            </div>
        </div>
    );
}

function BronEtiket({ bron }: { bron: string }) {
    return (
        <div style={{
            ...mono, fontSize: 22, letterSpacing: '.1em', color: bronKleur(bron),
            border: `1px solid ${bronRand(bron)}`, padding: '5px 14px', alignSelf: 'flex-start',
        }}>
            {BRON_LABEL[bron] ?? bron.toUpperCase()}
        </div>
    );
}

/**
 * Verbinding kwijt.
 *
 * Het oude beeld blijft staan op achttien procent — zichtbaar als geheugen,
 * onleesbaar als instructie — met een rode rand rond het hele scherm. Zwart
 * maken zou goedkoper zijn, maar dan weet hij niet of de monitor stuk is of
 * de verbinding.
 */
function VerbindingKwijt({
    leeftijdSec, laatsteContact, data,
}: { leeftijdSec: number; laatsteContact: Date | null; data: { nu: { kop: string } } }) {
    const min = Math.floor(leeftijdSec / 60);
    const sec = leeftijdSec % 60;
    const oud = Number.isFinite(leeftijdSec) ? `${min} min ${String(sec).padStart(2, '0')}` : 'onbekend hoe';

    return (
        <Doek>
            <div style={{
                width: 1920, height: 1080, background: K.zwart, border: `10px solid ${K.alarm}`,
                boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}>
                <div style={{ flex: 1, padding: 56, opacity: .18 }}>
                    <div style={{ fontFamily: LETTER.display, fontWeight: 200, fontSize: 128, lineHeight: .98 }}>
                        {data.nu.kop}
                    </div>
                </div>
                <div style={{ background: K.alarm, padding: '48px 56px', display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <div style={{ fontFamily: LETTER.display, fontWeight: 300, fontSize: 72, lineHeight: 1, color: '#F6EDE9' }}>
                        Geen verbinding
                    </div>
                    <div style={{ fontSize: 34, color: '#F0D2C9' }}>
                        Dit beeld is <strong>{oud}</strong> oud. Wat hier staat klopt niet meer.
                    </div>
                    <div style={{ fontSize: 30, color: '#F0D2C9' }}>
                        Werk verder van de tablet — daar loopt de planning door.
                    </div>
                    <div style={{ ...mono, fontSize: 26, color: '#F0D2C9', marginTop: 8 }}>
                        laatste contact {laatsteContact ? laatsteContact.toLocaleTimeString('nl-NL') : '—'}
                        {' · '}oud na {OUD_NA_SECONDEN}s
                    </div>
                </div>
            </div>
        </Doek>
    );
}

/**
 * Het scherm is precies 1920 × 1080 en schaalt mee als het venster kleiner is.
 *
 * Op de wand hangt hij op ware grootte; op een laptop kijk je naar hetzelfde
 * beeld, alleen kleiner. Geen aparte responsive layout — dan onderhoud je
 * twee schermen en zie je er één nooit.
 */
function Doek({ children }: { children: React.ReactNode }) {
    const schaal = useSchaal();
    return (
        <div style={{
            position: 'fixed', inset: 0, background: '#0b0b0c', color: K.wit,
            fontFamily: LETTER.tekst, fontVariantNumeric: 'tabular-nums',
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}>
            <div style={{
                width: 1920, height: 1080, transformOrigin: 'center',
                transform: schaal < 1 ? `scale(${schaal})` : undefined,
            }}>
                {children}
            </div>
        </div>
    );
}

/* Begint op 1 zodat server en client hetzelfde renderen; de echte schaal komt
   er meteen na het monteren bij. */
function useSchaal(): number {
    const [schaal, setSchaal] = useState(1);
    useEffect(() => {
        const meet = () => setSchaal(Math.min(window.innerWidth / 1920, window.innerHeight / 1080, 1));
        meet();
        window.addEventListener('resize', meet);
        return () => window.removeEventListener('resize', meet);
    }, []);
    return schaal;
}

const mono: React.CSSProperties = { fontFamily: LETTER.cijfer };
const midden: React.CSSProperties = {
    width: 1920, height: 1080, display: 'flex', alignItems: 'center', justifyContent: 'center',
};
