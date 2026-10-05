'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useConfirm } from '@/components/ConfirmDialog';
import { euroKerst, KERST_SLUG, type KerstOnderdeel } from '@/lib/winkel/kerstTellen';
import { bewaarOnderdeel, verwijderOnderdeel, zetProeverijPrijs } from '../actions';
import type { ArtikelRij, Melding } from './types';

interface Props {
    onderdelen: KerstOnderdeel[];
    artikelen: ArtikelRij[];
    herlaad: () => Promise<void>;
    melding: Melding;
}

/** "7,50" / "7.5" / "€ 7,50" → 750; leeg → null; onzin → NaN. */
function centenUit(tekst: string): number | null {
    const t = tekst.replace(/€/g, '').trim();
    if (!t) return null;
    const n = Number(t.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : NaN;
}

function euroInvoer(c: number | null | undefined): string {
    return c == null ? '' : (c / 100).toFixed(2).replace('.', ',');
}

function getalUit(tekst: string): number | null {
    const t = tekst.trim();
    if (!t) return null;
    const n = Number(t.replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : NaN;
}

export default function Inhoud({ onderdelen, artikelen, herlaad, melding }: Props) {
    const [bezig, setBezig] = useState<string | null>(null);
    const [nieuw, setNieuw] = useState(false);

    async function doe(sleutel: string, fn: () => Promise<{ error: string } | { data: unknown }>, gelukt: string) {
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

    const box = artikelen.find((a) => a.slug === KERST_SLUG.box);
    const vega = artikelen.find((a) => a.slug === KERST_SLUG.vega);
    const volgende = onderdelen.reduce((m, o) => Math.max(m, o.volgorde), 0) + 10;

    return (
        <>
            <div className="panel">
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
                    <div className="ws-sectie-kop">Prijzen</div>
                    <div className="ws-onderschrift" style={{ marginTop: 2 }}>
                        Een proeverij met een prijs staat binnen een minuut op het bestelformulier van de site; leeg = niet te bestellen. De klant kiest zelf hoeveel.
                    </div>
                </div>
                <div className="ws-tabel-rij" style={{ gridTemplateColumns: 'minmax(160px,1fr) minmax(200px,1.4fr)', cursor: 'default' }}>
                    <div><div style={{ fontWeight: 500 }}>Kerst-Box</div><div className="kr-zacht" style={{ fontSize: 12 }}>per persoon · vanaf {box?.minimum ?? 2} personen</div></div>
                    <div className="ws-onderschrift">
                        {box?.prijs_cents != null ? euroKerst(box.prijs_cents) : 'geen prijs'}{vega ? ` · vegetarisch ${vega.prijs_cents != null ? euroKerst(vega.prijs_cents) : 'geen prijs'}${vega.actief ? '' : ' (uit: vega staat dan in de opmerking)'}` : ''}
                        <span className="kr-zacht"> — aanpassen in Webshop → Artikelen</span>
                    </div>
                </div>
                <ProeverijRij soort="bier" titel="Bierproeverij" per="per persoon" artikel={artikelen.find((a) => a.slug === KERST_SLUG.bier)} bezig={bezig} doe={doe} />
                <ProeverijRij soort="wijn" titel="Wijnproeverij" per="per 2 personen" artikel={artikelen.find((a) => a.slug === KERST_SLUG.wijn)} bezig={bezig} doe={doe} />
            </div>

            <div className="panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                    <div>
                        <div className="ws-sectie-kop">Wat er per persoon in de doos zit</div>
                        <div className="ws-onderschrift" style={{ marginTop: 2 }}>Leeg of 0 bij vega = zit niet in de vegetarische doos. Het Overzicht rekent hiermee de kilo&apos;s uit.</div>
                    </div>
                    {!nieuw && <button type="button" className="btn btn-ghost" onClick={() => setNieuw(true)}><Plus size={14} /> Onderdeel</button>}
                </div>
                <div className="ws-tabel-kop kr-ond-grid">
                    <span>Onderdeel</span><span>Soort</span><span>Eenheid</span><span className="kr-getal">Per persoon</span><span className="kr-getal">Per pers. vega</span><span className="kr-getal">Volgorde</span><span />
                </div>
                {onderdelen.length === 0 && !nieuw && <div className="ws-leeg" style={{ padding: 20 }}>Nog niets ingevuld. Begin met het vlees: bijvoorbeeld &quot;Bavette&quot;, 100 gram per persoon.</div>}
                {onderdelen.map((o) => <OnderdeelRij key={o.id} o={o} bezig={bezig} doe={doe} />)}
                {nieuw && (
                    <OnderdeelRij o={{ id: '', naam: '', soort: 'vlees', eenheid: 'gram', per_persoon: null, per_persoon_vega: null, volgorde: volgende }} bezig={bezig} doe={doe} klaar={() => setNieuw(false)} />
                )}
            </div>
        </>
    );
}

function ProeverijRij({ soort, titel, per, artikel, bezig, doe }: {
    soort: 'bier' | 'wijn'; titel: string; per: string; artikel: ArtikelRij | undefined; bezig: string | null;
    doe: (s: string, fn: () => Promise<{ error: string } | { data: unknown }>, g: string) => Promise<boolean | undefined>;
}) {
    const [prijs, setPrijs] = useState(euroInvoer(artikel?.prijs_cents));
    const opDeSite = Boolean(artikel?.actief && artikel.prijs_cents != null);
    const gewijzigd = prijs !== euroInvoer(artikel?.prijs_cents);
    function bewaar() {
        const c = centenUit(prijs);
        if (Number.isNaN(c)) return void doe('x', async () => ({ error: 'Geen geldig bedrag. Bijvoorbeeld: 7,50' }), '');
        void doe(`prijs:${soort}`, () => zetProeverijPrijs({ soort, prijs_cents: c }), c == null ? `${titel} staat uit` : `${titel}: ${euroKerst(c as number)}`);
    }
    return (
        <div className="ws-tabel-rij" style={{ gridTemplateColumns: 'minmax(160px,1fr) minmax(200px,1.4fr)', cursor: 'default' }}>
            <div>
                <div style={{ fontWeight: 500 }}>{titel}</div>
                <div className="kr-zacht" style={{ fontSize: 12 }}>{per}</div>
            </div>
            <div className="kr-acties">
                <span style={{ color: 'var(--muted)' }}>€</span>
                <input inputMode="decimal" value={prijs} placeholder="prijs volgt" onChange={(e) => setPrijs(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') bewaar(); }}
                    style={{ width: 110, height: 34, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)' }} aria-label={`Prijs ${titel}`} />
                <button type="button" className="btn btn-ghost" disabled={!gewijzigd || bezig !== null} onClick={bewaar}>Opslaan</button>
                <span className={`pill ${opDeSite ? 'pill-green' : 'pill-amber'}`}>{opDeSite ? 'Op de site' : 'Niet te bestellen'}</span>
            </div>
        </div>
    );
}

function OnderdeelRij({ o, bezig, doe, klaar }: {
    o: KerstOnderdeel; bezig: string | null;
    doe: (s: string, fn: () => Promise<{ error: string } | { data: unknown }>, g: string) => Promise<boolean | undefined>;
    klaar?: () => void;
}) {
    const confirm = useConfirm();
    const tekst = (n: number | null) => (n == null ? '' : String(n).replace('.', ','));
    const [naam, setNaam] = useState(o.naam);
    const [soort, setSoort] = useState(o.soort);
    const [eenheid, setEenheid] = useState(o.eenheid);
    const [pp, setPp] = useState(tekst(o.per_persoon));
    const [ppVega, setPpVega] = useState(tekst(o.per_persoon_vega));
    const [volgorde, setVolgorde] = useState(String(o.volgorde));
    const isNieuw = !o.id;
    const gewijzigd = isNieuw || naam !== o.naam || soort !== o.soort || eenheid !== o.eenheid || pp !== tekst(o.per_persoon) || ppVega !== tekst(o.per_persoon_vega) || volgorde !== String(o.volgorde);
    const veld = { height: 34, padding: '0 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', width: '100%' } as const;

    async function bewaar() {
        const a = getalUit(pp);
        const b = getalUit(ppVega);
        if (Number.isNaN(a) || Number.isNaN(b)) return void doe('x', async () => ({ error: 'Vul een getal in, bijvoorbeeld 100 of 12,5.' }), '');
        const ok = await doe(`ond:${o.id || 'nieuw'}`, () => bewaarOnderdeel({
            id: o.id || null, naam, soort, eenheid, per_persoon: a, per_persoon_vega: b, volgorde: Math.max(0, Math.floor(Number(volgorde) || 0)),
        }), isNieuw ? `${naam} toegevoegd` : `${naam} bijgewerkt`);
        if (ok && klaar) klaar();
    }

    return (
        <div className="ws-tabel-rij kr-ond-grid" style={{ cursor: 'default' }} onKeyDown={(e) => { if (e.key === 'Enter' && gewijzigd) void bewaar(); }}>
            <input style={veld} value={naam} placeholder="Bavette" onChange={(e) => setNaam(e.target.value)} aria-label="Naam" autoFocus={isNieuw} />
            <input style={veld} value={soort} placeholder="vlees" onChange={(e) => setSoort(e.target.value)} aria-label="Soort" list="kr-soorten" />
            <select style={veld} value={eenheid} onChange={(e) => setEenheid(e.target.value as KerstOnderdeel['eenheid'])} aria-label="Eenheid">
                <option value="gram">gram</option><option value="stuk">stuk</option><option value="ml">ml</option>
            </select>
            <input style={{ ...veld, textAlign: 'right' }} inputMode="decimal" value={pp} placeholder="—" onChange={(e) => setPp(e.target.value)} aria-label="Per persoon" />
            <input style={{ ...veld, textAlign: 'right' }} inputMode="decimal" value={ppVega} placeholder="—" onChange={(e) => setPpVega(e.target.value)} aria-label="Per persoon vegetarisch" />
            <input style={{ ...veld, textAlign: 'right' }} inputMode="numeric" value={volgorde} onChange={(e) => setVolgorde(e.target.value)} aria-label="Volgorde" />
            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                {gewijzigd ? (
                    <button type="button" className="btn btn-brand" style={{ padding: '0 10px' }} disabled={bezig !== null || !naam.trim()} onClick={() => void bewaar()}>{isNieuw ? 'Voeg toe' : 'Opslaan'}</button>
                ) : (
                    <button type="button" className="btn btn-ghost btn-icon" aria-label={`${o.naam} verwijderen`} disabled={bezig !== null}
                        onClick={async () => {
                            if (await confirm({ title: `${o.naam} verwijderen?`, confirmText: 'Verwijderen', danger: true })) await doe(`del:${o.id}`, () => verwijderOnderdeel({ id: o.id }), `${o.naam} verwijderd`);
                        }}><Trash2 size={14} /></button>
                )}
                {isNieuw && klaar && <button type="button" className="btn btn-ghost" onClick={klaar}>×</button>}
            </div>
            <datalist id="kr-soorten"><option value="vlees" /><option value="vis" /><option value="vega" /><option value="saus" /><option value="zuur" /><option value="side" /><option value="brood" /><option value="crunch" /></datalist>
        </div>
    );
}
