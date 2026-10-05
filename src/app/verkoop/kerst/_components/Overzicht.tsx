'use client';

import { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { afhaaldagVoluit, euroKerst, hoeveelheidTekst, kerstProductie, type DagTotaal, type KerstOnderdeel } from '@/lib/winkel/kerstTellen';
import { negeerKerstLead, zetLeadOmOpnieuw } from '../actions';
import type { KerstLead, Melding, MomentRij } from './types';

interface Props {
    totalen: { dagen: DagTotaal[]; totaal: DagTotaal };
    onderdelen: KerstOnderdeel[];
    momenten: MomentRij[];
    leads: KerstLead[];
    vegaApart: boolean;
    herlaad: () => Promise<void>;
    melding: Melding;
    naarInhoud: () => void;
}

function dagKort(iso: string): string {
    const v = afhaaldagVoluit(iso);
    return v.charAt(0).toUpperCase() + v.slice(1);
}

export default function Overzicht({ totalen, onderdelen, momenten, leads, vegaApart, herlaad, melding, naarInhoud }: Props) {
    const [bezig, setBezig] = useState<string | null>(null);
    const t = totalen.totaal;
    const productie = useMemo(() => kerstProductie(onderdelen, totalen.dagen), [onderdelen, totalen.dagen]);
    const capaciteit = (dag: string) => momenten.find((m) => m.datum === dag)?.capaciteit ?? null;

    async function doe(sleutel: string, fn: () => Promise<{ error: string } | { data: unknown }>, gelukt: string) {
        setBezig(sleutel);
        try {
            const r = await fn();
            if ('error' in r) { melding(r.error, 'error'); return; }
            melding(gelukt, 'success');
            await herlaad();
        } finally {
            setBezig(null);
        }
    }

    const tegels: [string, string][] = [
        [String(t.personen), 'personen'],
        [String(t.vega), 'waarvan vegetarisch'],
        [String(t.bier), 'bierproeverijen'],
        [String(t.wijn), 'wijnproeverijen'],
        [String(t.dozen), 'dozen'],
        [euroKerst(t.totaalCenten), 'omzet'],
        [euroKerst(t.openCenten), 'nog te betalen aan de balie'],
        [String(t.onzeker), 'personen nog niet zeker'],
    ];

    return (
        <>
            {leads.length > 0 && (
                <div className="panel" style={{ borderColor: 'rgba(232,106,44,.35)' }}>
                    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
                        <div className="ws-banner-titel">{leads.length === 1 ? 'Eén bestelling staat' : `${leads.length} bestellingen staan`} nog niet in de productie</div>
                        <div className="ws-onderschrift" style={{ marginTop: 4 }}>De klant heeft zijn bevestiging gekregen. Los de reden op en klik op <em>Zet om</em>; er gaat geen tweede mail.</div>
                    </div>
                    {leads.map((l) => (
                        <div key={l.id} className="ws-order" style={{ padding: '12px 20px' }}>
                            <div className="ws-order-kop">
                                <div className="ws-order-naam">{l.naam}<span className="ws-order-nummer">aanvraag {l.id}</span></div>
                                <div className="kr-acties kr-niet-printen">
                                    <button type="button" className="btn btn-brand" disabled={bezig !== null} onClick={() => doe(`om:${l.id}`, () => zetLeadOmOpnieuw({ leadId: l.id }), 'In de productie gezet')}>{bezig === `om:${l.id}` ? 'Bezig…' : 'Zet om'}</button>
                                    <button type="button" className="btn btn-ghost" disabled={bezig !== null} onClick={() => doe(`neg:${l.id}`, () => negeerKerstLead({ leadId: l.id }), 'Uit de lijst gehaald')}>Geen bestelling</button>
                                </div>
                            </div>
                            <div className="ws-order-wat">
                                {l.gasten ?? '?'} personen · {l.event_datum ? afhaaldagVoluit(l.event_datum) : 'geen dag'} · {l.email ?? ''}{l.telefoon ? ` · ${l.telefoon}` : ''}
                            </div>
                            <div className="ws-merk ws-merk-vuur" style={{ alignSelf: 'flex-start', whiteSpace: 'normal', height: 'auto', padding: '4px 10px' }}>{l.omzet_fout}</div>
                        </div>
                    ))}
                </div>
            )}

            <div className="kr-tegels">
                {tegels.map(([waarde, label]) => (
                    <div key={label} className="ws-tegel"><b>{waarde}</b><span>{label}</span></div>
                ))}
            </div>

            <div className="panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                    <div className="ws-sectie-kop">Per afhaaldag</div>
                    <div className="ws-onderschrift">Alleen geldige bestellingen; geannuleerde tellen niet mee.{!vegaApart && ' Vegetarisch komt uit de regel "Waarvan vegetarisch" in de opmerking.'}</div>
                </div>
                <div className="ws-tabel-kop kr-dag-grid">
                    <span>Dag</span><span className="kr-getal">Best.</span><span className="kr-getal">Pers.</span><span className="kr-getal">Gewoon</span><span className="kr-getal">Vega</span><span className="kr-getal">Bier</span><span className="kr-getal">Wijn</span><span className="kr-getal">Dozen</span><span className="kr-getal">Nog te betalen</span>
                </div>
                {totalen.dagen.map((d) => {
                    const cap = capaciteit(d.dag);
                    return (
                        <div key={d.dag} className="ws-tabel-rij kr-dag-grid" style={{ cursor: 'default' }}>
                            <div>
                                <div style={{ fontWeight: 500 }}>{dagKort(d.dag)}</div>
                                <div className="kr-zacht" style={{ fontSize: 12 }}>
                                    {d.opgehaald > 0 ? `${d.opgehaald} van ${d.orders} opgehaald` : d.orders ? 'nog niets opgehaald' : 'geen bestellingen'}
                                    {d.onzeker > 0 && <> · <span style={{ color: 'var(--ws-warn)' }}>{d.onzeker} onzeker</span></>}
                                </div>
                            </div>
                            <span className="kr-getal">{d.orders}</span>
                            <span className="kr-getal"><b>{d.personen}</b></span>
                            <span className="kr-getal">{d.gewoon}</span>
                            <span className="kr-getal">{d.vega}</span>
                            <span className="kr-getal">{d.bier || '—'}</span>
                            <span className="kr-getal">{d.wijn || '—'}</span>
                            <span className="kr-getal" title={cap == null ? 'Geen grens op deze dag' : `Grens: ${cap} dozen`} style={cap != null && d.dozen >= cap ? { color: 'var(--ws-warn)' } : undefined}>{d.dozen}{cap != null ? ` / ${cap}` : ''}</span>
                            <span className="kr-getal">{euroKerst(d.openCenten)}</span>
                        </div>
                    );
                })}
                <div className="ws-tabel-rij kr-dag-grid kr-totaalrij" style={{ cursor: 'default' }}>
                    <span>Totaal</span>
                    <span className="kr-getal">{t.orders}</span>
                    <span className="kr-getal">{t.personen}</span>
                    <span className="kr-getal">{t.gewoon}</span>
                    <span className="kr-getal">{t.vega}</span>
                    <span className="kr-getal">{t.bier || '—'}</span>
                    <span className="kr-getal">{t.wijn || '—'}</span>
                    <span className="kr-getal">{t.dozen}</span>
                    <span className="kr-getal">{euroKerst(t.openCenten)}</span>
                </div>
            </div>

            <div className="panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                    <div>
                        <div className="ws-sectie-kop">Wat er gemaakt moet worden</div>
                        <div className="ws-onderschrift" style={{ marginTop: 2 }}>Per persoon × gewoon, plus per persoon vega × vegetarisch.</div>
                    </div>
                    <button type="button" className="btn btn-ghost kr-niet-printen" onClick={() => window.print()}><Printer size={14} /> Printen</button>
                </div>
                {productie.length === 0 ? (
                    <div className="ws-leeg" style={{ padding: 20 }}>
                        Nog niet ingevuld wat er per persoon in de doos zit. <button type="button" className="btn btn-ghost kr-niet-printen" style={{ marginLeft: 8 }} onClick={naarInhoud}>Vul de inhoud in</button>
                    </div>
                ) : (
                    <>
                        <div className="ws-tabel-kop kr-prod-grid" style={{ ['--kr-dagen' as string]: totalen.dagen.length }}>
                            <span>Onderdeel</span>
                            {totalen.dagen.map((d) => <span key={d.dag} className="kr-getal">{afhaaldagVoluit(d.dag).split(' ').slice(1).join(' ')}</span>)}
                            <span className="kr-getal">Totaal</span>
                        </div>
                        {productie.map((p) => (
                            <div key={p.onderdeel.id} className="ws-tabel-rij kr-prod-grid" style={{ cursor: 'default', ['--kr-dagen' as string]: totalen.dagen.length }}>
                                <div>
                                    <div style={{ fontWeight: 500 }}>{p.onderdeel.naam}</div>
                                    <div className="kr-zacht" style={{ fontSize: 12 }}>{p.onderdeel.soort}</div>
                                </div>
                                {totalen.dagen.map((d) => <span key={d.dag} className="kr-getal">{hoeveelheidTekst(p.perDag[d.dag] ?? 0, p.onderdeel.eenheid)}</span>)}
                                <span className="kr-getal"><b>{hoeveelheidTekst(p.totaal, p.onderdeel.eenheid)}</b></span>
                            </div>
                        ))}
                    </>
                )}
            </div>
        </>
    );
}
