'use client';

/**
 * Instellingen — hoe de kassa op de website werkt. Ontwerp: artboard 08.
 * Plan §3.4. De schakelaar bovenaan is de noodknop en slaat meteen op.
 */
import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import Button from '@/components/Button';
import { leesEuro, toonEuro } from '../_lib/vakjes';
import { werkInstellingenBij } from '../actions';

type Melding = (tekst: string, soort?: 'success' | 'error' | 'info') => void;

export interface InstellingenRij {
    verzendkosten_cents: number | null;
    gratis_verzenden_vanaf_cents: number | null;
    verzendkosten_btw_pct: number;
    reservering_minuten: number;
    offerte_geldig_minuten: number;
    nummer_prefix: string;
    nummer_jaar: number | null;
    nummer_laatste: number;
    kassa_open: boolean;
    site_url: string | null;
    /* Sinterklaas S5/S7. */
    reservering_bedrag_cents: number | null;
    qr_basis_url: string | null;
}

const STANDAARD: InstellingenRij = { verzendkosten_cents: null, gratis_verzenden_vanaf_cents: null, verzendkosten_btw_pct: 21, reservering_minuten: 30, offerte_geldig_minuten: 15, nummer_prefix: 'HB', nummer_jaar: null, nummer_laatste: 0, kassa_open: false, site_url: null, reservering_bedrag_cents: null, qr_basis_url: null };

export default function InstellingenPaneel({ instellingen, herlaad, melding }: { instellingen: InstellingenRij | null; herlaad: () => Promise<void>; melding: Melding }) {
    const i = instellingen ?? STANDAARD;
    const [f, setF] = useState({ verzend: toonEuro(i.verzendkosten_cents), gratis: toonEuro(i.gratis_verzenden_vanaf_cents), btw: i.verzendkosten_btw_pct as 0 | 9 | 21, reservering: String(i.reservering_minuten), offerte: String(i.offerte_geldig_minuten), prefix: i.nummer_prefix, site: i.site_url ?? '', reserveringBedrag: toonEuro(i.reservering_bedrag_cents), qr: i.qr_basis_url ?? '' });
    const [open, setOpen] = useState(i.kassa_open);
    const [bezig, setBezig] = useState<'opslaan' | 'kassa' | null>(null);
    useEffect(() => { setOpen(i.kassa_open); }, [i.kassa_open]);

    function lees(kassaOpen: boolean) {
        const verzend = leesEuro(f.verzend);
        const gratis = leesEuro(f.gratis);
        const reserveringBedrag = leesEuro(f.reserveringBedrag);
        if (verzend === undefined || gratis === undefined || reserveringBedrag === undefined) { melding('Dat is geen geldig bedrag.', 'error'); return null; }
        if (reserveringBedrag === 0) { melding('Een reservering van € 0,00 kan niet: laat het veld leeg om reserveren uit te zetten.', 'error'); return null; }
        return {
            kassa_open: kassaOpen, verzendkosten_cents: verzend, gratis_verzenden_vanaf_cents: gratis, verzendkosten_btw_pct: f.btw,
            reservering_minuten: Number(f.reservering), offerte_geldig_minuten: Number(f.offerte), nummer_prefix: f.prefix.trim().toUpperCase(), site_url: f.site.trim() || null,
            reservering_bedrag_cents: reserveringBedrag, qr_basis_url: f.qr.trim() || null,
        };
    }
    async function bewaar(kassaOpen: boolean, wat: 'opslaan' | 'kassa') {
        const input = lees(kassaOpen);
        if (!input) return;
        setBezig(wat);
        try {
            const r = await werkInstellingenBij(input);
            if ('error' in r) { melding(r.error, 'error'); if (wat === 'kassa') setOpen(!kassaOpen); return; }
            melding(wat === 'kassa' ? (kassaOpen ? 'Kassa open — de site neemt orders aan' : 'Kassa dicht — de site neemt geen orders aan') : 'Instellingen opgeslagen', 'success');
            await herlaad();
        } finally { setBezig(null); }
    }

    const jaar = i.nummer_jaar ?? new Date().getFullYear();
    return (
        <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="smoke-card" style={{ padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 18 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 22 }}>{open ? 'Kassa open' : 'Kassa dicht'}</div>
                    <div className="ws-onderschrift" style={{ marginTop: 4 }}>{open ? 'De site neemt orders aan. Zet je hem dicht, dan zien klanten “tijdelijk geen bestellingen”.' : 'De site neemt geen orders aan. Zet hem open zodra je klaar bent.'}</div>
                </div>
                <button type="button" className="ws-schakel ws-schakel-groot" role="switch" aria-checked={open} aria-label="Kassa open" disabled={bezig === 'kassa'} onClick={() => { const n = !open; setOpen(n); void bewaar(n, 'kassa'); }} />
            </div>

            <div className="panel">
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <div className="ws-eyebrow">Verzenden</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div className="field"><label>Verzendkosten</label><input inputMode="decimal" value={f.verzend} onChange={(e) => setF({ ...f, verzend: e.target.value })} placeholder="6,95" /><div className="field-hint">Leeg = verzenden staat uit</div></div>
                        <div className="field"><label>Gratis verzenden vanaf</label><input inputMode="decimal" value={f.gratis} onChange={(e) => setF({ ...f, gratis: e.target.value })} placeholder="50,00" /><div className="field-hint">Leeg = nooit gratis</div></div>
                    </div>
                    <div className="field"><label>Btw op verzendkosten</label><div className="ws-keuze" style={{ maxWidth: 260 }}>{([0, 9, 21] as const).map((p) => <button key={p} type="button" aria-pressed={f.btw === p} onClick={() => setF({ ...f, btw: p })}>{p}%</button>)}</div></div>
                    <div className="ws-lijn" />
                    <div className="ws-eyebrow">Afrekenen</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div className="field"><label>Reserveringsduur (min)</label><input inputMode="numeric" value={f.reservering} onChange={(e) => setF({ ...f, reservering: e.target.value })} /><div className="field-hint">Zo lang houden we een plek vast tijdens het afrekenen (5–240)</div></div>
                        <div className="field"><label>Offerte geldig (min)</label><input inputMode="numeric" value={f.offerte} onChange={(e) => setF({ ...f, offerte: e.target.value })} /><div className="field-hint">Prijs staat vast tot de klant betaalt bij myPOS</div></div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div className="field"><label>Reserveringsbedrag</label><input inputMode="decimal" value={f.reserveringBedrag} onChange={(e) => setF({ ...f, reserveringBedrag: e.target.value })} placeholder="2,50" /><div className="field-hint">Per order: de klant betaalt dit online en de rest in de winkel. Leeg = reserveren uit. Geen toeslag: gaat van het totaal af.</div></div>
                    </div>
                    <div className="ws-lijn" />
                    <div className="ws-eyebrow">Koppeling</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div className="field"><label>Ordernummer</label><input value={f.prefix} onChange={(e) => setF({ ...f, prefix: e.target.value })} /><div className="field-hint">Volgende: {f.prefix.trim().toUpperCase() || 'HB'}-{jaar}-{String(i.nummer_laatste + 1).padStart(4, '0')}</div></div>
                        <div className="field"><label>Site-URL</label><input value={f.site} onChange={(e) => setF({ ...f, site: e.target.value })} placeholder="https://hopbites.nl" /><div className="field-hint">Waar de klant na betalen terugkeert</div></div>
                        <div className="field" style={{ gridColumn: '1 / -1' }}><label>QR-app (Experience)</label><input value={f.qr} onChange={(e) => setF({ ...f, qr: e.target.value })} placeholder="https://experience.hopbites.nl" /><div className="field-hint">Basis-URL voor de QR op het etiket: {(f.qr.trim() || '…').replace(/\/+$/, '')}/sint?artikel=sint-bier-35&order=HB-2026-0042. Leeg = geen QR op het etiket.</div></div>
                    </div>
                </div>
                <div className="mr-drawer-footer" style={{ background: 'transparent' }}>
                    <Button icon={<Save size={14} />} loading={bezig === 'opslaan'} onClick={() => bewaar(open, 'opslaan')}>Opslaan</Button>
                </div>
            </div>
        </div>
    );
}
