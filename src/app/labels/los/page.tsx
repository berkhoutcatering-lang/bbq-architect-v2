'use client';

/**
 * /labels/los — een los label: "Suiker" op een doos, "Ui gesneden" op een bak.
 *
 * Dit is bewust de énige plek waar je een aantal invult. Een los label hangt
 * aan niets: geen partij, geen voorraad, geen QR. Wat je print wordt wel
 * bewaard (printjob met de tekst erop), zodat je later ziet wat er is gemaakt.
 * Voor productie (12 kg → 12 zakken) bestaat dit scherm niet: daar bepaalt
 * de partij het aantal.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Minus, Plus, Printer, Tag } from 'lucide-react';
import Button from '@/components/Button';
import MetallicCard from '@/components/MetallicCard';
import { useToast } from '@/components/Toast';
import { printLabels, usePrinters, werkstationPrinter, kiesPrinterVoorDitApparaat, type PrintResultaat } from '@/lib/labelprinter/client';
import { MAX_LOSSE_LABELS } from '@/lib/labelprinter/render';

function vandaag(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const SNEL = ['Suiker', 'Bloem', 'Zout', 'Rub', 'Saus', 'Ui gesneden', 'Bouillon', 'Marinade'];

export default function LosLabelPagina() {
    const showToast = useToast();
    const { printers, laden } = usePrinters();
    const [printerId, setPrinterId] = useState<string | null>(null);
    const [naam, setNaam] = useState('');
    const [datum, setDatum] = useState(vandaag());
    const [tht, setTht] = useState('');
    const [notitie, setNotitie] = useState('');
    const [aantal, setAantal] = useState(1);
    const [bezig, setBezig] = useState(false);
    const [resultaat, setResultaat] = useState<PrintResultaat | null>(null);

    const actief = useMemo(() => printers.filter((p) => p.actief), [printers]);
    useEffect(() => {
        if (printerId || laden) return;
        const p = werkstationPrinter(printers);
        if (p) setPrinterId(p.id);
    }, [printers, laden, printerId]);

    const kanPrinten = !!printerId && naam.trim().length > 0 && !bezig;

    async function print() {
        if (!printerId) return;
        setBezig(true);
        setResultaat(null);
        try {
            const r = await printLabels({
                soort: 'los_label', printerId, naam: naam.trim(), datum,
                tht: tht || null, notitie: notitie.trim() || null, aantal,
            });
            setResultaat(r);
            if (r.uitkomst.status === 'success') showToast(`${aantal} label${aantal === 1 ? '' : 's'} geprint`, 'success');
            else showToast(r.tekst ?? 'Printen mislukt', 'error');
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Printen mislukt', 'error');
        } finally {
            setBezig(false);
        }
    }

    return (
        <div className="max-w-xl mx-auto px-4 py-6">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 rounded-xl" style={{ background: 'linear-gradient(135deg, var(--brand)15, var(--brand)08)', border: '1px solid var(--brand)20' }}>
                    <Tag size={20} className="text-[var(--brand)]" />
                </div>
                <div>
                    <h1 className="text-lg font-semibold text-[var(--text)]">Los label</h1>
                    <p className="text-[12px] text-[var(--muted)]">Voor een doos of bak. Telt niet mee in voorraad.</p>
                </div>
            </div>

            {!laden && actief.length === 0 && (
                <MetallicCard className="p-5 mb-4" hover={false}>
                    <p className="text-[14px] text-[var(--text)] mb-1">Nog geen printer gekoppeld</p>
                    <p className="text-[12px] text-[var(--muted)] mb-3">Koppel eerst de Zebra bij Instellingen → Printers.</p>
                    <Link href="/instellingen/printers"><Button size="sm" icon={<Printer size={14} />}>Naar printers</Button></Link>
                </MetallicCard>
            )}

            <MetallicCard className="p-5 mb-4" hover={false}>
                <div className="field mb-4">
                    <label>Wat staat erop?</label>
                    <input
                        value={naam}
                        onChange={(e) => setNaam(e.target.value)}
                        placeholder="Suiker"
                        maxLength={60}
                        autoFocus
                        style={{ fontSize: 22, minHeight: 56 }}
                    />
                </div>
                <div className="flex flex-wrap gap-2 mb-5">
                    {SNEL.map((s) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => setNaam(s)}
                            className="px-3 py-2 rounded-full text-[13px] border border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:border-[var(--brand)] min-h-[44px]"
                        >
                            {s}
                        </button>
                    ))}
                </div>

                <div className="form-grid">
                    <div className="field"><label>Datum</label><input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} /></div>
                    <div className="field"><label>THT (optioneel)</label><input type="date" value={tht} onChange={(e) => setTht(e.target.value)} /></div>
                    <div className="field full"><label>Notitie (optioneel)</label><input value={notitie} onChange={(e) => setNotitie(e.target.value)} placeholder="bv. doos 2 van 3" maxLength={120} /></div>
                </div>

                <div className="flex items-center justify-between mt-5">
                    <div>
                        <p className="text-[12px] text-[var(--muted)] mb-1">Aantal exemplaren</p>
                        <div className="flex items-center gap-2">
                            <button type="button" aria-label="Minder" onClick={() => setAantal((a) => Math.max(1, a - 1))} className="w-12 h-12 rounded-lg border border-[var(--border)] bg-[var(--card)] flex items-center justify-center"><Minus size={18} /></button>
                            <span className="text-2xl font-light w-12 text-center text-[var(--text)]">{aantal}</span>
                            <button type="button" aria-label="Meer" onClick={() => setAantal((a) => Math.min(MAX_LOSSE_LABELS, a + 1))} className="w-12 h-12 rounded-lg border border-[var(--border)] bg-[var(--card)] flex items-center justify-center"><Plus size={18} /></button>
                        </div>
                    </div>
                    {actief.length > 1 && (
                        <div className="field" style={{ minWidth: 200 }}>
                            <label>Printer</label>
                            <select value={printerId ?? ''} onChange={(e) => { setPrinterId(e.target.value || null); kiesPrinterVoorDitApparaat(e.target.value || null); }}>
                                <option value="">Kies…</option>
                                {actief.map((p) => <option key={p.id} value={p.id}>{p.naam}</option>)}
                            </select>
                        </div>
                    )}
                </div>
            </MetallicCard>

            <Button size="touch" className="w-full" icon={<Printer size={20} />} loading={bezig} disabled={!kanPrinten} onClick={() => void print()}>
                {aantal === 1 ? 'Print label' : `Print ${aantal} labels`}
            </Button>

            {resultaat && (
                <MetallicCard className="p-4 mt-4" hover={false} accent={resultaat.uitkomst.status === 'success' ? 'var(--green)' : 'var(--red)'}>
                    <p className="text-[14px] text-[var(--text)]">
                        {resultaat.uitkomst.status === 'success'
                            ? `✓ ${resultaat.uitkomst.geprintAantal} label${resultaat.uitkomst.geprintAantal === 1 ? '' : 's'} geprint`
                            : `✗ ${resultaat.tekst} (${resultaat.uitkomst.geprintAantal} van ${aantal} geprint)`}
                    </p>
                    {resultaat.waarschuwingen.length > 0 && (
                        <ul className="mt-2 text-[12px] text-[var(--amber)] list-disc pl-4">
                            {resultaat.waarschuwingen.map((w) => <li key={w}>{w}</li>)}
                        </ul>
                    )}
                </MetallicCard>
            )}
        </div>
    );
}
