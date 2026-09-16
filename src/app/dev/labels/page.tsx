'use client';

/**
 * /dev/labels — de labels nakijken zonder Zebra. Zelfde idee als /dev/sticker.
 *
 * Drie dingen kun je hier:
 *   1. de ZPL van elke template zien op elke labelmaat;
 *   2. een voorbeeld laten tekenen via Labelary (externe dienst, alleen dev,
 *      alleen als je erop klikt — de tekst van het label gaat dan naar hen);
 *   3. de mock-printer laten falen (papier op na N) en zien wat de printlaag
 *      dan meldt — zonder database, puur de service.
 */

import { useMemo, useState } from 'react';
import { notFound } from 'next/navigation';
import { productielabel, type ProductielabelData } from '@/lib/labelprinter/templates/productielabel';
import { loslabel } from '@/lib/labelprinter/templates/loslabel';
import { testlabel } from '@/lib/labelprinter/templates/testlabel';
import { voerPrintJobUit } from '@/lib/labelprinter/service';
import { MockTransport } from '@/lib/labelprinter/transports/mock';
import { STANDAARD_LABEL, type LabelFormaat, type PrinterConfig, type PrintUitkomst } from '@/lib/labelprinter/types';
import { label as zplLabel } from '@/lib/labelprinter/zpl';

const FORMATEN: Array<{ naam: string; formaat: LabelFormaat }> = [
    { naam: '60 × 40 mm · 203 dpi (nu in de printer)', formaat: STANDAARD_LABEL },
    { naam: '102 × 76 mm · 203 dpi', formaat: { breedte_mm: 102, hoogte_mm: 76, dpi: 203 } },
    { naam: '50 × 30 mm · 203 dpi', formaat: { breedte_mm: 50, hoogte_mm: 30, dpi: 203 } },
];

const VOORBEELD: ProductielabelData = {
    naam: 'Pulled pork', inhoud: '1,00 kg', productiedatum: '2026-09-16', tht: '2026-12-16',
    partijnummer: 'PP-20260916-01', unitNr: 7, unitTotaal: 12, bewaaradvies: '≤ -18 °C',
    allergenen: ['gluten', 'soja'], qrUrl: 'https://bbq-architect-v2.vercel.app/scan/8f3a1c2e-1111-2222-3333-444455556666',
    eenheidCode: 'PP-20260916-01-007',
};

const MOCK_PRINTER: PrinterConfig = {
    id: 'dev', naam: 'Mock ZQ630 Plus', transport: 'mock', device_uid: 'mock-zq630', model: null,
    dpi: 203, label_breedte_mm: 60, label_hoogte_mm: 40, actief: true,
};

export default function LabelsSpeeltuin() {
    if (process.env.NODE_ENV === 'production') notFound();
    return <Speeltuin />;
}

function Speeltuin() {
    const [formaatIdx, setFormaatIdx] = useState(0);
    const [template, setTemplate] = useState<'productie' | 'los' | 'test'>('productie');
    const [naam, setNaam] = useState(VOORBEELD.naam);
    const [voorbeeld, setVoorbeeld] = useState<string | null>(null);
    const [voorbeeldFout, setVoorbeeldFout] = useState<string | null>(null);
    const [papierOpNa, setPapierOpNa] = useState<number>(7);
    const [uitkomst, setUitkomst] = useState<PrintUitkomst | null>(null);
    const [verstuurd, setVerstuurd] = useState<string[]>([]);

    const formaat = FORMATEN[formaatIdx].formaat;

    const render = useMemo(() => {
        if (template === 'productie') return productielabel.render({ ...VOORBEELD, naam }, formaat);
        if (template === 'los') return loslabel.render({ naam, datum: '2026-09-16', tht: '2027-03-01', notitie: 'doos 2 van 3', wie: 'Mathijs' }, formaat);
        return testlabel.render({ printerNaam: 'Keuken Tramstraat', moment: '16-09-2026 14:03' }, formaat);
    }, [template, naam, formaat]);

    async function toonVoorbeeld() {
        setVoorbeeld(null);
        setVoorbeeldFout(null);
        const dpmm = formaat.dpi === 300 ? '12dpmm' : '8dpmm';
        const inch = `${(formaat.breedte_mm / 25.4).toFixed(2)}x${(formaat.hoogte_mm / 25.4).toFixed(2)}`;
        try {
            const res = await fetch(`https://api.labelary.com/v1/printers/${dpmm}/labels/${inch}/0/`, {
                method: 'POST', headers: { Accept: 'image/png', 'Content-Type': 'application/x-www-form-urlencoded' }, body: render.zpl,
            });
            if (!res.ok) throw new Error(`Labelary antwoordde ${res.status}: ${await res.text()}`);
            const blob = await res.blob();
            setVoorbeeld(URL.createObjectURL(blob));
        } catch (e) {
            setVoorbeeldFout(e instanceof Error ? e.message : 'Voorbeeld mislukt');
        }
    }

    async function simuleer() {
        const t = new MockTransport({ papierOpNa: papierOpNa > 0 ? papierOpNa : null });
        const labels = Array.from({ length: 12 }, (_, i) => ({
            eenheidId: `eenheid-${String(i + 1).padStart(3, '0')}`,
            zpl: zplLabel({ breedte: 480, hoogte: 320 }, [`^FO10,10^A0N,30,27^FDlabel ${i + 1}^FS`]),
        }));
        const u = await voerPrintJobUit(labels, t, MOCK_PRINTER, { bundelGrootte: 4 });
        setUitkomst(u);
        setVerstuurd(t.verstuurd);
    }

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-6 text-[var(--text)]">
            <h1 className="text-lg font-semibold">Labels — speeltuin (alleen dev)</h1>

            <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <div className="field">
                        <label>Template</label>
                        <select value={template} onChange={(e) => setTemplate(e.target.value as typeof template)}>
                            <option value="productie">Productielabel</option>
                            <option value="los">Los label</option>
                            <option value="test">Testlabel</option>
                        </select>
                    </div>
                    <div className="field">
                        <label>Labelmaat</label>
                        <select value={formaatIdx} onChange={(e) => setFormaatIdx(Number(e.target.value))}>
                            {FORMATEN.map((f, i) => <option key={f.naam} value={i}>{f.naam}</option>)}
                        </select>
                    </div>
                    {template !== 'test' && (
                        <div className="field">
                            <label>Naam</label>
                            <input value={naam} onChange={(e) => setNaam(e.target.value)} />
                        </div>
                    )}
                    {render.waarschuwingen.length > 0 && (
                        <ul className="text-[12px] text-[var(--amber)] list-disc pl-4">
                            {render.waarschuwingen.map((w) => <li key={w}>{w}</li>)}
                        </ul>
                    )}
                    <button className="btn btn-brand btn-sm" onClick={() => void toonVoorbeeld()}>Voorbeeld tekenen (Labelary, extern)</button>
                    {voorbeeldFout && <p className="text-[12px] text-[var(--red)]">{voorbeeldFout}</p>}
                    {voorbeeld && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={voorbeeld} alt="Voorbeeld van het label" style={{ width: 340, border: '1px solid var(--border)', background: '#fff' }} />
                    )}
                </div>
                <div>
                    <p className="text-[12px] text-[var(--muted)] mb-1">ZPL ({render.zpl.length} tekens)</p>
                    <pre className="text-[11px] whitespace-pre-wrap break-all p-3 rounded-lg border border-[var(--border)] bg-[var(--card)] max-h-[420px] overflow-auto">{render.zpl.replace(/\^/g, '\n^').trim()}</pre>
                </div>
            </div>

            <hr className="border-[var(--border)]" />

            <div>
                <h2 className="text-[14px] font-semibold mb-2">Mock-printer: 12 labels, papier op na N</h2>
                <div className="flex items-end gap-3 mb-3">
                    <div className="field" style={{ maxWidth: 160 }}>
                        <label>Papier op na (0 = nooit)</label>
                        <input type="number" min={0} max={12} value={papierOpNa} onChange={(e) => setPapierOpNa(Number(e.target.value))} />
                    </div>
                    <button className="btn btn-brand" onClick={() => void simuleer()}>Simuleer printjob</button>
                </div>
                {uitkomst && (
                    <div className="text-[13px] space-y-1">
                        <p>Status: <b>{uitkomst.status}</b> · geprint: {uitkomst.geprintAantal}/12 · bundels verstuurd: {verstuurd.length}</p>
                        <p>Zeker geprint: {uitkomst.geprintEenheidIds.join(', ') || '—'}</p>
                        <p>Onzeker (controleer): {uitkomst.onzekerEenheidIds.join(', ') || '—'}</p>
                        <p>Fout: {uitkomst.foutCode ?? '—'} {uitkomst.foutmelding ? `· ${uitkomst.foutmelding}` : ''}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
