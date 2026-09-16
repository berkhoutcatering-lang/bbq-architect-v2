'use client';

/**
 * /voorraad/partijen — elke productie als partij: wat, hoeveel eenheden, wat
 * er nog op voorraad ligt en hoeveel labels er zijn geprint. Per partij een
 * lade met de eenheden en de printgeschiedenis; herprint per eenheid.
 *
 * Herprinten verandert nooit voorraad: het is een nieuwe printjob met
 * soort=herprint en een audit-regel — meer niet.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Printer, RefreshCw, Tag } from 'lucide-react';
import Button from '@/components/Button';
import MetallicCard from '@/components/MetallicCard';
import SlideOverPanel from '@/components/SlideOverPanel';
import { useToast } from '@/components/Toast';
import { printLabels, usePrinters, werkstationPrinter } from '@/lib/labelprinter/client';
import { formatInhoud, normaliseerEenheid } from '@/lib/productie/eenheden';
import { datumKort } from '@/lib/labelprinter/templates/index';

interface PartijRegel {
    id: string; partijnummer: string; component_naam: string | null; geproduceerde_hoeveelheid: number; eenheid: string;
    verpakking_grootte: number; verpakking_eenheid: string; aantal_eenheden: number; productiedatum: string; tht: string | null;
    status: string; op_voorraad: number; labels_geprint: number; created_at: string;
}
interface Eenheid {
    id: string; volgnummer: number; code: string; inhoud: number; eenheid: string; status: string;
    label_geprint_at: string | null; label_print_count: number;
}
interface Detail {
    partij: PartijRegel & { bewaaradvies: string | null };
    eenheden: Eenheid[];
    component: { name: string; allergenen: string[] } | null;
    event: { id: number; name: string; date: string } | null;
    personeel: { naam: string } | null;
    printJobs: Array<{ id: string; soort: string; status: string; aantal_labels: number; geprint_aantal: number; created_at: string; foutmelding: string | null; eenheid_ids: string[] }>;
}

const STATUS_TEKST: Record<string, string> = { op_voorraad: 'op voorraad', verbruikt: 'verbruikt', afgeschreven: 'afgeschreven', verkocht: 'verkocht' };

export default function PartijenPagina() {
    const showToast = useToast();
    const { printers } = usePrinters();
    const printer = useMemo(() => werkstationPrinter(printers), [printers]);
    const [partijen, setPartijen] = useState<PartijRegel[]>([]);
    const [laden, setLaden] = useState(true);
    const [open, setOpen] = useState<string | null>(null);
    const [detail, setDetail] = useState<Detail | null>(null);
    const [gekozen, setGekozen] = useState<Set<string>>(new Set());
    const [bezig, setBezig] = useState(false);

    const laad = useCallback(async () => {
        setLaden(true);
        try {
            const res = await fetch('/api/productie/partijen?limit=100', { cache: 'no-store' });
            const json = await res.json();
            if (res.ok) setPartijen(json.partijen ?? []);
        } finally { setLaden(false); }
    }, []);
    useEffect(() => { void laad(); }, [laad]);

    const laadDetail = useCallback(async (id: string) => {
        const res = await fetch(`/api/productie/partij/${id}`, { cache: 'no-store' });
        const json = await res.json();
        if (res.ok) setDetail(json as Detail);
    }, []);
    useEffect(() => { setDetail(null); setGekozen(new Set()); if (open) void laadDetail(open); }, [open, laadDetail]);

    async function print(eenheidIds: string[] | null, soort: 'partij_labels' | 'herprint') {
        if (!open) return;
        if (!printer) { showToast('Geen printer voor dit apparaat — kies er een bij Instellingen → Printers', 'error'); return; }
        setBezig(true);
        try {
            const r = soort === 'herprint'
                ? await printLabels({ soort: 'herprint', printerId: printer.id, eenheidIds: eenheidIds ?? [] })
                : await printLabels({ soort: 'partij_labels', printerId: printer.id, partijId: open, eenheidIds });
            if (r.uitkomst.status === 'success') showToast(`${r.uitkomst.geprintAantal} label${r.uitkomst.geprintAantal === 1 ? '' : 's'} geprint`, 'success');
            else showToast(r.tekst ?? 'Printen mislukt', 'error');
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Printen mislukt', 'error');
        } finally {
            setBezig(false);
            setGekozen(new Set());
            await laadDetail(open);
            await laad();
        }
    }

    const ontbrekend = detail?.eenheden.filter((e) => !e.label_geprint_at) ?? [];

    return (
        <div style={{ padding: '16px 32px 40px' }}>
            <div className="flex items-center justify-between mb-5">
                <div>
                    <h1 className="text-lg font-semibold text-[var(--text)]">Partijen</h1>
                    <p className="text-[12px] text-[var(--muted)]">Elke productie: eenheden, voorraad en labels. Herprinten verandert nooit voorraad.</p>
                </div>
                <button onClick={() => void laad()} className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-[var(--muted)] hover:text-[var(--text)] bg-[var(--card)] border border-[var(--border)] rounded-lg">
                    <RefreshCw size={13} className={laden ? 'animate-spin' : ''} /> Vernieuwen
                </button>
            </div>

            {!laden && partijen.length === 0 && (
                <MetallicCard className="p-6 text-center" hover={false}>
                    <Tag size={28} className="mx-auto mb-2 text-[var(--muted)]" />
                    <p className="text-[14px] text-[var(--text)]">Nog geen partijen</p>
                    <p className="text-[12px] text-[var(--muted)]">Zodra je op het kookbord of de tablet een productie afmaakt met sticker, staat hij hier.</p>
                </MetallicCard>
            )}

            <div className="space-y-2">
                {partijen.map((p) => (
                    <MetallicCard key={p.id} className="p-4" hover onClick={() => setOpen(p.id)}>
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="font-mono text-[13px] text-[var(--brand)]">{p.partijnummer}</span>
                            <span className="text-[14px] font-medium text-[var(--text)]">{p.component_naam ?? '—'}</span>
                            <span className="text-[12px] text-[var(--muted)]">{p.aantal_eenheden} × {formatInhoud(Number(p.verpakking_grootte), normaliseerEenheid(p.verpakking_eenheid) ?? 'kg')} · gemaakt {datumKort(p.productiedatum)}{p.tht ? ` · THT ${datumKort(p.tht)}` : ''}</span>
                            <span className="ml-auto text-[12px] text-[var(--muted)]">{p.op_voorraad}/{p.aantal_eenheden} op voorraad</span>
                            <span className={`text-[12px] ${p.labels_geprint >= p.aantal_eenheden ? 'text-emerald-400' : 'text-[var(--amber)]'}`}>{p.labels_geprint}/{p.aantal_eenheden} labels</span>
                            {p.status !== 'vrijgegeven' && <span className="text-[12px] text-[var(--red)]">{p.status}</span>}
                        </div>
                    </MetallicCard>
                ))}
            </div>

            <SlideOverPanel isOpen={!!open} onClose={() => setOpen(null)} title={detail?.partij.partijnummer ?? 'Partij'} subtitle={detail?.component?.name ?? ''} width="lg">
                {!detail ? <p className="text-[13px] text-[var(--muted)] p-4">Laden…</p> : (
                    <div className="p-4 space-y-5">
                        <div className="text-[13px] text-[var(--muted)] space-y-1">
                            <p>{detail.partij.geproduceerde_hoeveelheid} {detail.partij.eenheid} gemaakt op {datumKort(detail.partij.productiedatum)}{detail.partij.tht ? ` · THT ${datumKort(detail.partij.tht)}` : ' · geen THT'}{detail.partij.bewaaradvies ? ` · bewaren ${detail.partij.bewaaradvies}` : ''}</p>
                            {detail.event && <p>Event: {detail.event.name} ({datumKort(detail.event.date)})</p>}
                            {detail.personeel && <p>Door: {detail.personeel.naam}</p>}
                            {detail.component?.allergenen.length ? <p>Allergenen: {detail.component.allergenen.join(', ')}</p> : null}
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {ontbrekend.length > 0 && <Button size="sm" icon={<Printer size={14} />} loading={bezig} onClick={() => void print(ontbrekend.map((e) => e.id), 'partij_labels')}>Print ontbrekende {ontbrekend.length}</Button>}
                            {gekozen.size > 0 && <Button size="sm" variant="gold" icon={<Printer size={14} />} loading={bezig} onClick={() => void print([...gekozen], 'herprint')}>Herprint {gekozen.size} label{gekozen.size === 1 ? '' : 's'}</Button>}
                        </div>

                        <div>
                            <h3 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)] mb-2">Eenheden — tik om te selecteren voor herprint</h3>
                            <ul className="grid grid-cols-2 gap-2">
                                {detail.eenheden.map((e) => {
                                    const aan = gekozen.has(e.id);
                                    return (
                                        <li key={e.id}>
                                            <button type="button" onClick={() => setGekozen((g) => { const n = new Set(g); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n; })}
                                                className={`w-full text-left p-3 rounded-lg border text-[12px] ${aan ? 'border-[var(--brand)] bg-[rgba(255,191,0,.08)]' : 'border-[var(--border)] bg-[var(--card)]'}`}>
                                                <div className="flex justify-between"><span className="font-mono text-[var(--text)]">{e.code}</span><span className="text-[var(--muted)]">{formatInhoud(Number(e.inhoud), normaliseerEenheid(e.eenheid) ?? 'kg')}</span></div>
                                                <div className="flex justify-between mt-1 text-[11px]">
                                                    <span className={e.status === 'op_voorraad' ? 'text-emerald-400' : 'text-[var(--muted)]'}>{STATUS_TEKST[e.status] ?? e.status}</span>
                                                    <span className={e.label_geprint_at ? 'text-[var(--muted)]' : 'text-[var(--amber)]'}>{e.label_geprint_at ? `label ×${e.label_print_count}` : 'geen label'}</span>
                                                </div>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>

                        <div>
                            <h3 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)] mb-2">Printgeschiedenis</h3>
                            {detail.printJobs.length === 0 ? <p className="text-[12px] text-[var(--muted)]">Nog niets geprint.</p> : (
                                <ul className="divide-y divide-[var(--border)] text-[12px]">
                                    {detail.printJobs.map((j) => (
                                        <li key={j.id} className="py-2 flex justify-between gap-3">
                                            <span className="text-[var(--text)]">{new Date(j.created_at).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · {j.soort === 'herprint' ? 'herprint' : 'labels'} · {j.eenheid_ids.length} stuks</span>
                                            <span className={j.status === 'success' ? 'text-emerald-400' : j.status === 'failed' ? 'text-[var(--red)]' : 'text-[var(--muted)]'}>{j.status === 'success' ? `${j.geprint_aantal}/${j.aantal_labels} geprint` : j.status === 'failed' ? `mislukt na ${j.geprint_aantal}${j.foutmelding ? ` — ${j.foutmelding}` : ''}` : 'onbekend'}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                )}
            </SlideOverPanel>
        </div>
    );
}
