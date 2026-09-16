'use client';

/**
 * Instellingen → Printers. Hier koppel je de Zebra één keer; daarna weet de
 * keuken hem. Alles wat hier gebeurt loopt via de printerlaag
 * (src/lib/labelprinter) — deze pagina kent geen Bluetooth of ZPL.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
    ArrowLeft, Bluetooth, CheckCircle2, ChevronDown, ChevronUp, Loader2, Plus, Printer, RefreshCw,
    Search, Tag, Trash2, XCircle, FlaskConical, Smartphone,
} from 'lucide-react';
import MetallicCard from '@/components/MetallicCard';
import Button from '@/components/Button';
import { useToast } from '@/components/Toast';
import {
    gekozenPrinterId, kiesPrinterVoorDitApparaat, printLabels, usePrinters, vraagStatus,
} from '@/lib/labelprinter/client';
import { BrowserPrintTransport } from '@/lib/labelprinter/transports/browserPrint';
import type { GevondenPrinter, PrinterConfig, PrinterStatus } from '@/lib/labelprinter/types';
import { FOUT_TEKST, PrinterFout } from '@/lib/labelprinter/types';

const IS_DEV = process.env.NODE_ENV !== 'production';

const STAPPEN = [
    { kop: 'Zet de printer aan en koppel hem in Android', tekst: 'Instellingen → Bluetooth → zoek "ZQ630" of "XXZ…" → koppelen. Eén keer per tablet.' },
    { kop: 'Installeer Zebra Browser Print op de tablet', tekst: 'Download de Android-app van zebra.com (Support → Browser Print). Sta "onbekende bronnen" toe voor de installatie. De app draait daarna op de achtergrond en start mee bij het opstarten.' },
    { kop: 'Kies in de Browser Print-app de standaardprinter', tekst: 'Open de app → menu → Discover Printers (Bluetooth Discovery aan) → tik op de ZQ630 Plus → Default.' },
    { kop: 'Sta deze website toe', tekst: 'Bij de eerste printopdracht vraagt de app of deze site de printer mag gebruiken. Kies "Allow". Daarna staat hij in Accepted Hosts.' },
    { kop: 'Zoek hieronder de printer en koppel hem', tekst: 'Klik "Zoek printers", kies de ZQ630 Plus, controleer de labelmaat (nu 60 × 40 mm) en print een testlabel. Staat het kader netjes op de rand, dan klopt alles.' },
];

export default function PrintersPagina() {
    const showToast = useToast();
    const { printers, laden, fout, herlaad } = usePrinters();
    const [uitleg, setUitleg] = useState(false);
    const [gevonden, setGevonden] = useState<GevondenPrinter[] | null>(null);
    const [zoeken, setZoeken] = useState(false);
    const [zoekFout, setZoekFout] = useState<string | null>(null);
    const [ditApparaat, setDitApparaat] = useState<string | null>(null);
    const [jobs, setJobs] = useState<Array<Record<string, unknown>>>([]);

    useEffect(() => { setDitApparaat(gekozenPrinterId()); }, []);

    const laadJobs = useCallback(async () => {
        try {
            const res = await fetch('/api/labels/jobs?limit=12', { cache: 'no-store' });
            const json = await res.json();
            if (res.ok) setJobs(json.jobs ?? []);
        } catch { /* lijst is informatief */ }
    }, []);
    useEffect(() => { void laadJobs(); }, [laadJobs]);

    async function zoek() {
        setZoeken(true);
        setZoekFout(null);
        setGevonden(null);
        try {
            const t = new BrowserPrintTransport();
            const lijst = await t.zoek();
            /* De standaardprinter van de app hoort er altijd bij, ook als
               discovery hem (nog) niet ziet. */
            const std = await t.standaard().catch(() => null);
            const alles = std && !lijst.some((p) => p.uid === std.uid) ? [std, ...lijst] : lijst;
            setGevonden(alles);
            if (alles.length === 0) setZoekFout('Browser Print draait, maar ziet geen printer. Staat de ZQ630 aan en is hij in de app als standaard gekozen?');
        } catch (e) {
            setZoekFout(e instanceof PrinterFout ? FOUT_TEKST[e.code] : (e instanceof Error ? e.message : 'Zoeken mislukt'));
        } finally {
            setZoeken(false);
        }
    }

    async function koppel(g: GevondenPrinter | null, transport: 'browser_print' | 'mock') {
        const body = {
            naam: g ? (g.naam || 'Zebra ZQ630 Plus') : 'Mock-printer (ontwikkeling)',
            transport,
            device_uid: g?.uid ?? (transport === 'mock' ? 'mock-zq630' : null),
            model: g?.model ?? (transport === 'mock' ? 'ZQ630 Plus (mock)' : null),
            dpi: 203, label_breedte_mm: 60, label_hoogte_mm: 40,
        };
        const res = await fetch('/api/labels/printers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const json = await res.json();
        if (!res.ok) { showToast(json.error ?? 'Koppelen mislukt', 'error'); return; }
        showToast(`${body.naam} gekoppeld`, 'success');
        if (!gekozenPrinterId()) { kiesPrinterVoorDitApparaat(json.printer.id); setDitApparaat(json.printer.id); }
        setGevonden(null);
        await herlaad();
    }

    return (
        <>
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <Link href="/instellingen/integraties" className="p-2 rounded-lg hover:bg-[var(--card)] transition-colors" aria-label="Terug naar integraties">
                        <ArrowLeft size={18} className="text-[var(--muted)]" />
                    </Link>
                    <div>
                        <h2 className="text-lg font-semibold text-[var(--text)]">Labelprinters</h2>
                        <p className="text-[12px] text-[var(--muted)]">Zebra ZQ630 Plus via Bluetooth, met de Zebra Browser Print-app op de tablet</p>
                    </div>
                </div>
                <button onClick={() => { void herlaad(); void laadJobs(); }} className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-[var(--muted)] hover:text-[var(--text)] bg-[var(--card)] border border-[var(--border)] rounded-lg transition-colors">
                    <RefreshCw size={13} className={laden ? 'animate-spin' : ''} /> Vernieuwen
                </button>
            </div>

            {/* Uitleg */}
            <MetallicCard className="mb-6" hover={false} accent="var(--brand)">
                <button className="w-full flex items-center justify-between p-4 text-left" onClick={() => setUitleg((v) => !v)}>
                    <span className="flex items-center gap-3">
                        <Bluetooth size={18} className="text-[var(--brand)]" />
                        <span className="text-[14px] font-medium text-[var(--text)]">Zo koppel je de Zebra (eenmalig per tablet)</span>
                    </span>
                    {uitleg ? <ChevronUp size={16} className="text-[var(--muted)]" /> : <ChevronDown size={16} className="text-[var(--muted)]" />}
                </button>
                {uitleg && (
                    <ol className="px-4 pb-4 space-y-3">
                        {STAPPEN.map((s, i) => (
                            <li key={s.kop} className="flex gap-3">
                                <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--brand)] text-black text-[12px] font-semibold flex items-center justify-center">{i + 1}</span>
                                <div>
                                    <p className="text-[13px] font-medium text-[var(--text)]">{s.kop}</p>
                                    <p className="text-[12px] text-[var(--muted)]">{s.tekst}</p>
                                </div>
                            </li>
                        ))}
                    </ol>
                )}
            </MetallicCard>

            {/* Zoeken / koppelen */}
            <MetallicCard className="p-4 mb-6" hover={false}>
                <div className="flex flex-wrap items-center gap-3">
                    <Button variant="brand" icon={zoeken ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} onClick={() => void zoek()} disabled={zoeken}>
                        Zoek printers
                    </Button>
                    {IS_DEV && (
                        <Button variant="ghost" icon={<FlaskConical size={16} />} onClick={() => void koppel(null, 'mock')}>
                            Mock-printer toevoegen (dev)
                        </Button>
                    )}
                    <span className="text-[12px] text-[var(--muted)]">Zoekt via de Browser Print-app op dít apparaat.</span>
                </div>
                {zoekFout && <p className="mt-3 text-[13px] text-[var(--red)]">{zoekFout}</p>}
                {gevonden && gevonden.length > 0 && (
                    <ul className="mt-4 space-y-2">
                        {gevonden.map((g) => {
                            const alGekoppeld = printers.some((p) => p.device_uid === g.uid);
                            return (
                                <li key={g.uid} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-[var(--border)] bg-[var(--card)]">
                                    <div className="min-w-0">
                                        <p className="text-[13px] font-medium text-[var(--text)] truncate">{g.naam || 'Zebra-printer'}</p>
                                        <p className="text-[11px] text-[var(--muted)] truncate">{g.verbinding} · {g.uid}</p>
                                    </div>
                                    {alGekoppeld
                                        ? <span className="text-[12px] text-emerald-400 flex items-center gap-1"><CheckCircle2 size={14} /> Al gekoppeld</span>
                                        : <Button size="sm" icon={<Plus size={14} />} onClick={() => void koppel(g, 'browser_print')}>Koppel</Button>}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </MetallicCard>

            {/* Gekoppelde printers */}
            {fout && <p className="text-[13px] text-[var(--red)] mb-4">{fout}</p>}
            {!laden && printers.length === 0 && (
                <MetallicCard className="p-6 mb-6 text-center" hover={false}>
                    <Printer size={28} className="mx-auto mb-2 text-[var(--muted)]" />
                    <p className="text-[14px] text-[var(--text)]">Nog geen printer gekoppeld</p>
                    <p className="text-[12px] text-[var(--muted)]">Doorloop de stappen hierboven en klik dan op “Zoek printers”.</p>
                </MetallicCard>
            )}
            <div className="space-y-4 mb-8">
                {printers.map((p) => (
                    <PrinterKaart
                        key={p.id}
                        printer={p}
                        isDitApparaat={ditApparaat === p.id}
                        kiesDitApparaat={() => { kiesPrinterVoorDitApparaat(p.id); setDitApparaat(p.id); showToast(`${p.naam} is nu de printer van dit apparaat`, 'success'); }}
                        naWijziging={() => { void herlaad(); void laadJobs(); }}
                    />
                ))}
            </div>

            {/* Laatste printopdrachten */}
            {jobs.length > 0 && (
                <MetallicCard className="p-4" hover={false}>
                    <h3 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)] mb-3">Laatste printopdrachten</h3>
                    <ul className="divide-y divide-[var(--border)]">
                        {jobs.map((j) => <JobRegel key={String(j.id)} job={j} printers={printers} />)}
                    </ul>
                </MetallicCard>
            )}
        </>
    );
}

/* ── Eén printer ─────────────────────────────────────────────────────────── */

function PrinterKaart({ printer, isDitApparaat, kiesDitApparaat, naWijziging }: {
    printer: PrinterConfig;
    isDitApparaat: boolean;
    kiesDitApparaat: () => void;
    naWijziging: () => void;
}) {
    const showToast = useToast();
    const [status, setStatus] = useState<PrinterStatus | null>(null);
    const [bezig, setBezig] = useState<'status' | 'test' | 'opslaan' | 'weg' | null>(null);
    const [bewerk, setBewerk] = useState(false);
    const [form, setForm] = useState({
        naam: printer.naam, dpi: printer.dpi, label_breedte_mm: printer.label_breedte_mm, label_hoogte_mm: printer.label_hoogte_mm,
    });

    async function checkStatus() {
        setBezig('status');
        const s = await vraagStatus(printer);
        setStatus(s);
        setBezig(null);
        /* Bewaar informatief op de printer; fouten hier zijn niet erg. */
        void fetch(`/api/labels/printers/${printer.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ laatste_status: { online: s.online, papierOp: s.papierOp, klepOpen: s.klepOpen, pauze: s.pauze, fout: s.fout, omschrijving: s.omschrijving } }),
        }).catch(() => undefined);
    }

    async function testlabel() {
        setBezig('test');
        try {
            const r = await printLabels({ soort: 'testlabel', printerId: printer.id });
            if (r.uitkomst.status === 'success') showToast('Testlabel geprint — staat het kader op de rand?', 'success');
            else showToast(r.tekst ?? 'Testlabel mislukt', 'error');
            if (r.uitkomst.printerStatus) setStatus(r.uitkomst.printerStatus);
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Testlabel mislukt', 'error');
        } finally {
            setBezig(null);
            naWijziging();
        }
    }

    async function opslaan() {
        setBezig('opslaan');
        const res = await fetch(`/api/labels/printers/${printer.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ naam: form.naam, dpi: Number(form.dpi), label_breedte_mm: Number(form.label_breedte_mm), label_hoogte_mm: Number(form.label_hoogte_mm) }),
        });
        const json = await res.json();
        setBezig(null);
        if (!res.ok) { showToast(json.error ?? 'Opslaan mislukt', 'error'); return; }
        showToast('Printer bijgewerkt', 'success');
        setBewerk(false);
        naWijziging();
    }

    async function verwijder() {
        if (!confirm(`${printer.naam} ontkoppelen? De printgeschiedenis blijft bewaard.`)) return;
        setBezig('weg');
        const res = await fetch(`/api/labels/printers/${printer.id}`, { method: 'DELETE' });
        setBezig(null);
        if (!res.ok) { showToast('Ontkoppelen mislukt', 'error'); return; }
        if (gekozenPrinterId() === printer.id) kiesPrinterVoorDitApparaat(null);
        showToast('Printer ontkoppeld', 'success');
        naWijziging();
    }

    const transportTekst = printer.transport === 'browser_print' ? 'Browser Print (Bluetooth)' : printer.transport === 'mock' ? 'Mock (ontwikkeling)' : 'Web Bluetooth';

    return (
        <MetallicCard className="overflow-hidden" hover={false} accent={isDitApparaat ? 'var(--brand)' : undefined}>
            <div className="flex items-start gap-4 p-4">
                <div className="p-2.5 rounded-xl shrink-0" style={{ background: 'linear-gradient(135deg, var(--brand)15, var(--brand)08)', border: '1px solid var(--brand)20' }}>
                    {printer.transport === 'mock' ? <FlaskConical size={20} className="text-[var(--brand)]" /> : <Printer size={20} className="text-[var(--brand)]" />}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h4 className="text-[14px] font-medium text-[var(--text)]">{printer.naam}</h4>
                        {!printer.actief && <span className="text-[11px] text-[var(--muted)]">inactief</span>}
                        {isDitApparaat && <span className="text-[11px] font-medium text-[var(--brand)] flex items-center gap-1"><Smartphone size={12} /> Printer van dit apparaat</span>}
                    </div>
                    <p className="text-[12px] text-[var(--muted)]">
                        {transportTekst} · {printer.label_breedte_mm} × {printer.label_hoogte_mm} mm · {printer.dpi} dpi
                        {printer.device_uid ? ` · ${printer.device_uid}` : ''}
                    </p>
                    {status && (
                        <p className={`mt-1 text-[12px] flex items-center gap-1.5 ${status.online && !status.fout ? 'text-emerald-400' : 'text-[var(--red)]'}`}>
                            {status.online && !status.fout ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                            {status.omschrijving}
                        </p>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap gap-2 px-4 pb-4">
                <Button size="sm" variant="ghost" loading={bezig === 'status'} onClick={() => void checkStatus()}>Status</Button>
                <Button size="sm" variant="brand" icon={<Tag size={14} />} loading={bezig === 'test'} onClick={() => void testlabel()}>Testlabel</Button>
                {!isDitApparaat && <Button size="sm" variant="ghost" icon={<Smartphone size={14} />} onClick={kiesDitApparaat}>Gebruik op dit apparaat</Button>}
                <Button size="sm" variant="ghost" onClick={() => setBewerk((v) => !v)}>{bewerk ? 'Sluit' : 'Labelmaat & naam'}</Button>
                <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} loading={bezig === 'weg'} onClick={() => void verwijder()}>Ontkoppel</Button>
            </div>

            {bewerk && (
                <div className="px-4 pb-4">
                    <div className="form-grid">
                        <div className="field"><label>Naam</label><input value={form.naam} onChange={(e) => setForm({ ...form, naam: e.target.value })} /></div>
                        <div className="field"><label>Resolutie</label>
                            <select value={form.dpi} onChange={(e) => setForm({ ...form, dpi: Number(e.target.value) })}>
                                <option value={203}>203 dpi (ZQ630 Plus)</option>
                                <option value={300}>300 dpi</option>
                            </select>
                        </div>
                        <div className="field"><label>Labelbreedte (mm)</label><input type="number" step="0.5" min={20} max={120} value={form.label_breedte_mm} onChange={(e) => setForm({ ...form, label_breedte_mm: Number(e.target.value) })} /></div>
                        <div className="field"><label>Labelhoogte (mm)</label><input type="number" step="0.5" min={10} max={300} value={form.label_hoogte_mm} onChange={(e) => setForm({ ...form, label_hoogte_mm: Number(e.target.value) })} /></div>
                    </div>
                    <p className="text-[11px] text-[var(--muted)] mt-2 mb-3">Andere rol erin? Pas hier de maat aan en print een testlabel. De ZQ630 Plus kan rollen van 51 tot 112 mm breed.</p>
                    <Button size="sm" loading={bezig === 'opslaan'} onClick={() => void opslaan()}>Opslaan</Button>
                </div>
            )}
        </MetallicCard>
    );
}

/* ── Eén printjob in de lijst ────────────────────────────────────────────── */

const SOORT_TEKST: Record<string, string> = {
    partij_labels: 'Partij-labels', herprint: 'Herprint', los_label: 'Los label', testlabel: 'Testlabel', doos_sticker: 'Doossticker', haccp_sticker: 'HACCP-sticker',
};

function JobRegel({ job, printers }: { job: Record<string, unknown>; printers: PrinterConfig[] }) {
    const status = String(job.status);
    const printer = printers.find((p) => p.id === job.printer_id);
    const data = (job.label_data ?? {}) as Record<string, unknown>;
    const wat = job.soort === 'los_label' && data.naam ? `"${String(data.naam)}"` : soortTekst(job.soort);
    const tijd = new Date(String(job.created_at)).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const kleur = status === 'success' ? 'text-emerald-400' : status === 'failed' ? 'text-[var(--red)]' : 'text-[var(--muted)]';
    const statusTekst = status === 'success' ? `${job.geprint_aantal}/${job.aantal_labels} geprint`
        : status === 'failed' ? `mislukt na ${job.geprint_aantal}/${job.aantal_labels}${job.foutmelding ? ` — ${String(job.foutmelding)}` : ''}`
            : status === 'pending' ? 'onbekend — controleer de printer' : status;
    return (
        <li className="py-2 flex items-center justify-between gap-3 text-[12px]">
            <span className="text-[var(--text)] truncate">{tijd} · {wat}{printer ? ` · ${printer.naam}` : ''}</span>
            <span className={`${kleur} shrink-0`}>{statusTekst}</span>
        </li>
    );
}

function soortTekst(soort: unknown): string {
    return SOORT_TEKST[String(soort)] ?? String(soort);
}
