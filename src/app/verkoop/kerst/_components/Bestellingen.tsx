'use client';

import { useMemo, useState } from 'react';
import { useConfirm } from '@/components/ConfirmDialog';
import { afhaaldagVan, afhaaldagVoluit, euroKerst, veldenUitOrder } from '@/lib/winkel/kerstTellen';
import { boekRestBetaling, zetOpgehaald } from '../../webshop/actions';
import { stuurKerstMailOpnieuw, wijzigKerstAantal, zetKerstGeannuleerd } from '../actions';
import type { KerstOrderRij, Melding } from './types';

interface Props {
    orders: KerstOrderRij[];
    dagen: string[];
    herlaad: () => Promise<void>;
    melding: Melding;
}

type Resultaat = { error: string } | { data: unknown };

function kerstVelden(o: KerstOrderRij) {
    return veldenUitOrder(o, o.winkel_order_regels);
}

function opmerkingKlant(o: KerstOrderRij): string {
    return (o.opmerking ?? '').split('\n').filter((r) => !/^\s*waarvan vegetarisch\s*:/i.test(r) && !/^aantal nog niet zeker/i.test(r)).join('\n').trim();
}

const opgehaald = (o: KerstOrderRij) => o.winkel_order_regels.length > 0 && o.winkel_order_regels.every((r) => r.opgehaald_at);

export default function Bestellingen({ orders, dagen, herlaad, melding }: Props) {
    const [zoek, setZoek] = useState('');
    const [dag, setDag] = useState<string | null>(null);
    const [metGeannuleerd, setMetGeannuleerd] = useState(false);
    const [open, setOpen] = useState<number | null>(null);
    const [bezig, setBezig] = useState<string | null>(null);
    const confirm = useConfirm();

    const zichtbaar = useMemo(() => {
        const q = zoek.trim().toLowerCase();
        return orders
            .filter((o) => metGeannuleerd || o.status === 'betaald')
            .filter((o) => o.status === 'betaald' || o.status === 'geannuleerd')
            .filter((o) => !dag || afhaaldagVan({ regels: o.winkel_order_regels }) === dag)
            .filter((o) => !q || o.nummer.toLowerCase().includes(q) || o.contact_naam.toLowerCase().includes(q) || (o.contact_telefoon ?? '').replace(/\s/g, '').includes(q.replace(/\s/g, '')))
            .sort((a, b) => afhaaldagVan({ regels: a.winkel_order_regels }).localeCompare(afhaaldagVan({ regels: b.winkel_order_regels })) || a.contact_naam.localeCompare(b.contact_naam));
    }, [orders, zoek, dag, metGeannuleerd]);

    async function doe(sleutel: string, fn: () => Promise<Resultaat>, gelukt: string) {
        setBezig(sleutel);
        try {
            const r = await fn();
            if ('error' in r) { melding(r.error, 'error'); return false; }
            melding(gelukt, 'success');
            await herlaad();
            return true;
        } finally {
            setBezig(null);
        }
    }

    return (
        <>
            <div className="kr-acties kr-niet-printen">
                <input className="ws-zoek" style={{ minWidth: 240, height: 36, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)' }}
                    placeholder="Zoek op naam, nummer of telefoon" value={zoek} onChange={(e) => setZoek(e.target.value)} aria-label="Zoeken" />
                <button type="button" className="ws-pil" aria-pressed={dag === null} onClick={() => setDag(null)}>Alle dagen</button>
                {dagen.map((d) => (
                    <button key={d} type="button" className="ws-pil" aria-pressed={dag === d} onClick={() => setDag(d)}>{afhaaldagVoluit(d).split(' ').slice(0, 2).join(' ')}</button>
                ))}
                <label className="ws-onderschrift" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
                    <input type="checkbox" checked={metGeannuleerd} onChange={(e) => setMetGeannuleerd(e.target.checked)} /> Geannuleerde tonen
                </label>
            </div>

            <div className="panel">
                <div className="ws-tabel-kop kr-best-grid">
                    <span>Klant</span><span>Afhalen</span><span className="kr-getal">Personen</span><span className="kr-getal">Totaal</span><span>Status</span>
                </div>
                {zichtbaar.length === 0 && <div className="ws-leeg" style={{ padding: 20 }}>{orders.length ? 'Geen bestellingen die hierbij passen.' : 'Nog geen Kerst-Box-bestellingen.'}</div>}
                {zichtbaar.map((o) => {
                    const v = kerstVelden(o);
                    const isOpen = open === o.id;
                    const geannuleerd = o.status === 'geannuleerd';
                    const betaald = Boolean(o.rest_betaald_at) || o.rest_cents === 0;
                    return (
                        <div key={o.id} className={geannuleerd ? 'kr-geannuleerd' : undefined}>
                            <div className="ws-tabel-rij kr-best-grid" onClick={() => setOpen(isOpen ? null : o.id)} aria-expanded={isOpen}>
                                <div>
                                    <div className="ws-order-naam">{o.contact_naam}<span className="ws-order-nummer">{o.nummer}</span></div>
                                    <div className="kr-zacht" style={{ fontSize: 12 }}>{o.contact_telefoon ?? o.contact_email}</div>
                                </div>
                                <span>{afhaaldagVoluit(v.afhaaldag)}</span>
                                <span className="kr-getal">
                                    <b>{v.personen}</b>{v.vegetarisch ? <span className="kr-zacht"> ({v.vegetarisch} vega)</span> : null}
                                    {(v.bier || v.wijn) ? <div className="kr-zacht" style={{ fontSize: 12 }}>{[v.bier ? `${v.bier} bier` : '', v.wijn ? `${v.wijn} wijn` : ''].filter(Boolean).join(' · ')}</div> : null}
                                </span>
                                <span className="kr-getal">{euroKerst(o.totaal_cents)}</span>
                                <div className="ws-chips" style={{ gap: 4 }}>
                                    {geannuleerd && <span className="pill pill-red">Geannuleerd</span>}
                                    {!geannuleerd && o.aantal_onzeker && <span className="ws-merk ws-merk-warn">Aantal onzeker</span>}
                                    {!geannuleerd && (betaald ? <span className="pill pill-green">Betaald{o.rest_betaalmethode ? ` · ${o.rest_betaalmethode}` : ''}</span> : <span className="pill pill-amber">Te betalen</span>)}
                                    {!geannuleerd && opgehaald(o) && <span className="pill pill-blue">Opgehaald</span>}
                                    {!geannuleerd && o.mail_status === 'mislukt' && <span className="ws-merk ws-merk-vuur" title={o.mail_fout ?? ''}>Mail mislukt</span>}
                                    {!geannuleerd && o.plaatsing_status === 'mislukt' && <span className="ws-merk ws-merk-vuur" title={o.plaatsing_fout ?? ''}>Niet in vakje</span>}
                                </div>
                            </div>
                            {isOpen && (
                                <Uitklap o={o} v={v} betaald={betaald} bezig={bezig} doe={doe}
                                    annuleer={async () => {
                                        const ok = await confirm({ title: `Bestelling ${o.nummer} annuleren?`, description: `${o.contact_naam} · ${v.personen} personen. Hij telt dan niet meer mee in de productie. De klant krijgt geen mail; laat het hem zelf weten.`, confirmText: 'Annuleren', danger: true });
                                        if (ok) await doe(`ann:${o.id}`, () => zetKerstGeannuleerd({ orderId: o.id, geannuleerd: true }), 'Bestelling geannuleerd');
                                    }} />
                            )}
                        </div>
                    );
                })}
            </div>
        </>
    );
}

function Uitklap({ o, v, betaald, bezig, doe, annuleer }: {
    o: KerstOrderRij;
    v: ReturnType<typeof kerstVelden>;
    betaald: boolean;
    bezig: string | null;
    doe: (sleutel: string, fn: () => Promise<Resultaat>, gelukt: string) => Promise<boolean | undefined>;
    annuleer: () => Promise<void>;
}) {
    const [personen, setPersonen] = useState(v.personen);
    const [vega, setVega] = useState(v.vegetarisch);
    const [bier, setBier] = useState(v.bier);
    const [wijn, setWijn] = useState(v.wijn);
    const [onzeker, setOnzeker] = useState(o.aantal_onzeker);
    const geannuleerd = o.status === 'geannuleerd';
    const gewijzigd = personen !== v.personen || vega !== v.vegetarisch || bier !== v.bier || wijn !== v.wijn || onzeker !== o.aantal_onzeker;
    const isOpgehaald = opgehaald(o);
    const vast = Boolean(o.rest_betaald_at) || o.winkel_order_regels.some((r) => r.klaargezet_at || r.opgehaald_at);
    const opm = opmerkingKlant(o);
    const getal = (zet: (n: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => zet(Math.max(0, Math.floor(Number(e.target.value) || 0)));

    if (geannuleerd) {
        return (
            <div className="kr-uitklap">
                <div className="kr-acties">
                    <button type="button" className="btn btn-ghost" disabled={bezig !== null} onClick={() => doe(`terug:${o.id}`, () => zetKerstGeannuleerd({ orderId: o.id, geannuleerd: false }), 'Bestelling staat weer open')}>Annulering terugdraaien</button>
                </div>
            </div>
        );
    }

    return (
        <div className="kr-uitklap">
            <div style={{ fontSize: 13 }}>
                <a href={`mailto:${o.contact_email}`} style={{ color: 'var(--brand-gold)' }}>{o.contact_email}</a>
                {o.contact_telefoon && <> · <a href={`tel:${o.contact_telefoon.replace(/\s/g, '')}`} style={{ color: 'var(--brand-gold)' }}>{o.contact_telefoon}</a></>}
                <span className="kr-zacht"> · besteld {new Date(o.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            {opm && <div className="ws-wensen-origineel" style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>“{opm}”</div>}

            <div>
                <div className="ws-eyebrow" style={{ marginBottom: 8 }}>Aantal</div>
                {vast ? (
                    <div className="ws-onderschrift">Al ingepakt, opgehaald of betaald: het aantal staat vast. Zet dat eerst terug om te wijzigen.</div>
                ) : (
                    <div className="kr-aantal">
                        <div className="field"><label>Personen</label><input type="number" min={1} value={personen || ''} onChange={getal(setPersonen)} /></div>
                        <div className="field"><label>Waarvan vega</label><input type="number" min={0} value={vega || ''} placeholder="0" onChange={getal(setVega)} /></div>
                        <div className="field"><label>Bierproeverij</label><input type="number" min={0} value={bier || ''} placeholder="0" onChange={getal(setBier)} /></div>
                        <div className="field"><label>Wijnproeverij</label><input type="number" min={0} value={wijn || ''} placeholder="0" onChange={getal(setWijn)} /></div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                            <label className="ws-onderschrift" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                                <input type="checkbox" checked={onzeker} onChange={(e) => setOnzeker(e.target.checked)} /> Nog niet zeker
                            </label>
                            <button type="button" className="btn btn-brand" disabled={!gewijzigd || bezig !== null}
                                onClick={() => doe(`aantal:${o.id}`, () => wijzigKerstAantal({ orderId: o.id, personen, vegetarisch: vega, bier, wijn, onzeker }), 'Aantal aangepast')}>
                                {bezig === `aantal:${o.id}` ? 'Bezig…' : 'Opslaan'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div>
                <div className="ws-eyebrow" style={{ marginBottom: 8 }}>Balie</div>
                <div className="kr-acties">
                    {betaald ? (
                        <span className="pill pill-green">Betaald{o.rest_betaalmethode ? ` met ${o.rest_betaalmethode}` : ''}</span>
                    ) : (
                        <>
                            <span className="ws-onderschrift">{euroKerst(o.rest_cents)} te betalen:</span>
                            <button type="button" className="btn btn-ghost" disabled={bezig !== null} onClick={() => doe(`pin:${o.id}`, () => boekRestBetaling({ orderId: o.id, methode: 'pin' }), 'Betaald met pin')}>Pin</button>
                            <button type="button" className="btn btn-ghost" disabled={bezig !== null} onClick={() => doe(`contant:${o.id}`, () => boekRestBetaling({ orderId: o.id, methode: 'contant' }), 'Betaald contant')}>Contant</button>
                        </>
                    )}
                    <button type="button" className="btn btn-ghost" disabled={bezig !== null}
                        onClick={() => doe(`op:${o.id}`, () => zetOpgehaald({ orderId: o.id, opgehaald: !isOpgehaald }), isOpgehaald ? 'Niet meer opgehaald' : 'Opgehaald')}>
                        {isOpgehaald ? 'Opgehaald ✓ — terugzetten' : 'Opgehaald'}
                    </button>
                </div>
            </div>

            <div>
                <div className="ws-eyebrow" style={{ marginBottom: 8 }}>Mail</div>
                <div className="kr-acties">
                    <span className="ws-onderschrift">
                        Bevestiging {o.mail_status === 'verstuurd' ? 'verstuurd' : o.mail_status === 'mislukt' ? 'mislukt' : 'niet verstuurd'}
                        {o.aantal_onzeker && ` · navraag ${o.navraag_verstuurd_at ? 'verstuurd' : 'volgt vijf dagen ervoor'}`}
                        {` · herinnering ${o.herinnering_verstuurd_at ? 'verstuurd' : 'volgt de dag ervoor'}`}
                    </span>
                    <button type="button" className="btn btn-ghost" disabled={bezig !== null} onClick={() => doe(`mail:${o.id}`, () => stuurKerstMailOpnieuw({ orderId: o.id, soort: 'ontvangen' }), 'Bevestiging verstuurd')}>Bevestiging opnieuw sturen</button>
                    {o.aantal_onzeker && (
                        <button type="button" className="btn btn-ghost" disabled={bezig !== null} onClick={() => doe(`nav:${o.id}`, () => stuurKerstMailOpnieuw({ orderId: o.id, soort: 'navraag' }), 'Navraag verstuurd')}>Nu om het aantal vragen</button>
                    )}
                </div>
            </div>

            <div className="kr-acties" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" style={{ color: 'var(--red, #ef4444)' }} disabled={bezig !== null || isOpgehaald} onClick={annuleer}>Annuleren</button>
            </div>
        </div>
    );
}
