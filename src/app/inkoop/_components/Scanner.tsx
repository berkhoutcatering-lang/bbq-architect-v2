'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    Upload, FileText, ImageIcon, Camera, X, Loader2, CheckCircle2,
    AlertCircle, Trash2, Sparkles,
} from 'lucide-react';
import { useToast } from '@/components/Toast';
import { ACCEPTED_EXTENSIONS, isAccepted, isPdf, isHeic, imageToDataUrl, shortName } from '../_lib/imageHelpers';
import { pdfFileToImages } from '../_lib/pdfToImages';
import { parseActions } from '@/lib/ai-actions';
import { resizeImage } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

type JobStatus = 'queued' | 'reading' | 'extracting' | 'ready' | 'error' | 'verwerkt';

interface ExtractedItem {
    naam: string;
    aantal: number;
    prijs: number;
    eenheid: string;
}

interface ExtractedSummary {
    winkel?: string;
    datum?: string;
    totaal?: number;
    items: ExtractedItem[];
    rawActions: unknown[];
    cleanText: string;
}

interface ScanJob {
    id: string;
    file: File;
    status: JobStatus;
    progress?: string;
    error?: string;
    images?: string[];   // data URLs (1 voor image, n voor PDF-pages)
    summary?: ExtractedSummary;
    /* Voor "Verwerk alles" houden we de image-b64 vast die we naar /api/bon-process sturen. */
    primaryImageB64?: string;
}

interface ScannerProps {
    leveranciers: Array<{ id: number | string; naam: string }>;
    /* Wanneer een file is verwerkt → callback zodat parent UI kan refreshen
       (bv. om de archief-tab counters bij te werken). */
    onJobVerwerkt?: (job: ScanJob) => void;
}

const MAX_FILES_PER_BATCH = 10;

export default function Scanner({ leveranciers, onJobVerwerkt }: ScannerProps) {
    const [jobs, setJobs] = useState<ScanJob[]>([]);
    const [dragOver, setDragOver] = useState(false);
    const [processingAll, setProcessingAll] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const showToast = useToast();

    const addFiles = useCallback(async function (files: FileList | File[]) {
        const list = Array.from(files);
        const accepted = list.filter(isAccepted);
        const rejected = list.length - accepted.length;
        if (rejected > 0) {
            showToast(`${rejected} bestand${rejected === 1 ? '' : 'en'} overgeslagen (verkeerd type)`, 'info');
        }
        if (accepted.length === 0) return;

        const available = MAX_FILES_PER_BATCH - jobs.length;
        const toQueue = accepted.slice(0, Math.max(0, available));
        if (toQueue.length < accepted.length) {
            showToast(`Max ${MAX_FILES_PER_BATCH} per batch — eerste ${toQueue.length} toegevoegd`, 'info');
        }

        const newJobs: ScanJob[] = toQueue.map(function (file) {
            return { id: crypto.randomUUID(), file, status: 'queued' };
        });
        setJobs(function (prev) { return [...prev, ...newJobs]; });

        /* Verwerk elke file sequentieel zodat we de gebruiker zien-progress
           geven; parallel zou de Claude vision API-rate-limit raken. */
        for (const job of newJobs) {
            await processJob(job.id, job.file);
        }
    }, [jobs.length, showToast]);

    async function processJob(id: string, file: File) {
        function patch(p: Partial<ScanJob>) {
            setJobs(function (prev) { return prev.map(function (j) { return j.id === id ? { ...j, ...p } : j; }); });
        }

        try {
            patch({ status: 'reading', progress: 'Voorbereiden' });

            if (isHeic(file)) {
                patch({ status: 'error', error: 'HEIC nog niet ondersteund — export als JPG vanaf je iPhone (Instellingen → Camera → Indelingen → Meest compatibel)' });
                return;
            }

            /* Convert input → array van JPEG data-URLs. PDF kan meerdere pages
               geven, image precies één. */
            let images: string[];
            if (isPdf(file)) {
                patch({ progress: 'PDF renderen…' });
                images = await pdfFileToImages(file, { maxPages: 10, maxDim: 2000 });
                if (images.length === 0) {
                    patch({ status: 'error', error: 'Geen pages gevonden in PDF' });
                    return;
                }
                patch({ progress: `${images.length} pages` });
            } else {
                patch({ progress: 'Foto optimaliseren…' });
                const raw = await imageToDataUrl(file);
                const resized = await resizeImage(raw, 1920, 2560, 0.92);
                images = [resized];
            }

            patch({ status: 'extracting', progress: 'AI leest factuur…', images, primaryImageB64: images[0] });

            /* Bouw de chat-call. Voor PDFs met meerdere pages sturen we ze als
               aparte image-blocks in dezelfde user-turn. Hergebruikt /api/chat
               zoals de single-file flow — geen nieuwe endpoint nodig. */
            const userContent: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail: 'high' } }> = [
                {
                    type: 'text',
                    text: 'Lees deze bon of factuur regel voor regel van boven naar beneden. Voor ELKE productregel maak je één ACTION-blok. Sla geen regel over. Als er meerdere pages zijn behoort alles tot dezelfde bon — niet apart. Begin direct met het eerste <<<ACTION>>> blok.',
                },
                ...images.map(function (b64) {
                    return { type: 'image_url' as const, image_url: { url: b64, detail: 'high' as const } };
                }),
            ];

            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pageContext: '/inkoop',
                    contextData: { leveranciers },
                    messages: [{ role: 'user', content: userContent }],
                }),
            });
            const json = await res.json();
            if (json.error) {
                patch({ status: 'error', error: json.error });
                return;
            }
            const content: string = (json.choices?.[0]?.message?.content) || '';
            if (!content) {
                patch({ status: 'error', error: 'AI gaf geen tekst terug — bon te wazig?' });
                return;
            }
            const { actions, cleanText } = parseActions(content);
            if (!Array.isArray(actions) || actions.length === 0) {
                patch({ status: 'error', error: 'Geen items herkend' });
                return;
            }

            const summary = buildSummary(actions, cleanText);
            patch({ status: 'ready', progress: `${summary.items.length} items`, summary });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            patch({ status: 'error', error: msg });
        }
    }

    function removeJob(id: string) {
        setJobs(function (prev) { return prev.filter(function (j) { return j.id !== id; }); });
    }

    function clearAll() {
        setJobs([]);
    }

    async function processAllReady() {
        const ready = jobs.filter(function (j) { return j.status === 'ready' && j.summary; });
        if (ready.length === 0) return;
        setProcessingAll(true);

        for (const job of ready) {
            try {
                const res = await fetch('/api/bon-process', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        raw_analysis: job.summary?.rawActions,
                        winkel: job.summary?.winkel,
                        datum: job.summary?.datum,
                        totaal_bedrag: job.summary?.totaal,
                    }),
                });
                const body = await res.json();
                if (!res.ok || !body.success) {
                    setJobs(function (prev) {
                        return prev.map(function (j) {
                            return j.id === job.id ? { ...j, status: 'error' as JobStatus, error: body.error || 'Verwerken mislukt' } : j;
                        });
                    });
                    continue;
                }

                /* Archiveer image in storage zodat het in het archief vindbaar is.
                   Bucket 'bonnen' kan ontbreken — niet-fataal, we tonen success. */
                if (job.primaryImageB64) {
                    try {
                        const fileName = `bon_${Date.now()}_${job.id.slice(0, 8)}.jpg`;
                        const blob = await (await fetch(job.primaryImageB64)).blob();
                        await supabase.storage.from('bonnen').upload(fileName, blob);
                    } catch { /* niet-fataal */ }
                }

                setJobs(function (prev) {
                    return prev.map(function (j) {
                        return j.id === job.id ? { ...j, status: 'verwerkt' as JobStatus, progress: 'In voorraad geboekt' } : j;
                    });
                });
                onJobVerwerkt?.(job);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                setJobs(function (prev) {
                    return prev.map(function (j) {
                        return j.id === job.id ? { ...j, status: 'error' as JobStatus, error: msg } : j;
                    });
                });
            }
        }
        setProcessingAll(false);
        showToast('Batch verwerkt', 'success');
    }

    /* Paste-handler globaal op het paneel — werkt voor screenshot-clipboard. */
    useEffect(function () {
        function onPaste(e: ClipboardEvent) {
            const files = e.clipboardData?.files;
            if (!files || files.length === 0) return;
            const accepted = Array.from(files).filter(isAccepted);
            if (accepted.length === 0) return;
            e.preventDefault();
            addFiles(accepted);
        }
        window.addEventListener('paste', onPaste);
        return function () { window.removeEventListener('paste', onPaste); };
    }, [addFiles]);

    const readyCount = jobs.filter(function (j) { return j.status === 'ready'; }).length;
    const verwerktCount = jobs.filter(function (j) { return j.status === 'verwerkt'; }).length;
    const inProgressCount = jobs.filter(function (j) { return j.status === 'reading' || j.status === 'extracting'; }).length;

    return (
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
            {/* Drop-zone — Lars-friendly: min 200px hoog, grote tekst, duidelijke states. */}
            <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
                }}
                style={{
                    minHeight: 220,
                    padding: 32,
                    borderRadius: 16,
                    border: `2px dashed ${dragOver ? '#FFBF00' : 'var(--border)'}`,
                    background: dragOver ? 'rgba(255,191,0,.06)' : 'rgba(255,255,255,.02)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    transition: 'border-color .15s, background .15s',
                    marginBottom: 18,
                }}
            >
                <Upload size={36} style={{ color: dragOver ? '#FFBF00' : 'var(--muted)', marginBottom: 12 }} />
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 300, color: 'var(--text)', marginBottom: 6 }}>
                    {dragOver ? 'Loslaten' : 'Sleep bonnen hierheen'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20, maxWidth: 460 }}>
                    PDF, foto, screenshot — alles tegelijk. Plakken met ⌘V werkt ook.
                    Maximum {MAX_FILES_PER_BATCH} per batch.
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        style={primaryBtnStyle}
                    >
                        <FileText size={14} /> Kies bestanden
                    </button>
                    <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        style={ghostBtnStyle}
                    >
                        <Camera size={14} /> Foto maken
                    </button>
                </div>
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={ACCEPTED_EXTENSIONS}
                    style={{ display: 'none' }}
                    onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
                />
                <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
                />
            </div>

            {/* Batch-paneel — verschijnt alleen als er jobs zijn. */}
            {jobs.length > 0 && (
                <div style={{
                    background: 'rgba(255,255,255,.02)',
                    border: '1px solid var(--border)',
                    borderRadius: 14,
                    overflow: 'hidden',
                }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '14px 18px', borderBottom: '1px solid var(--border)',
                        flexWrap: 'wrap', gap: 12,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <strong style={{ fontFamily: 'Outfit, sans-serif', fontSize: 15, fontWeight: 400, color: 'var(--text)' }}>
                                Batch
                            </strong>
                            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                                {jobs.length} {jobs.length === 1 ? 'bon' : 'bonnen'}
                                {inProgressCount > 0 && ` · ${inProgressCount} bezig`}
                                {readyCount > 0 && ` · ${readyCount} klaar`}
                                {verwerktCount > 0 && ` · ${verwerktCount} verwerkt`}
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={clearAll} style={ghostBtnSmStyle}>
                                <Trash2 size={11} /> Wissen
                            </button>
                            <button
                                onClick={processAllReady}
                                disabled={processingAll || readyCount === 0}
                                style={{
                                    ...primaryBtnSmStyle,
                                    opacity: processingAll || readyCount === 0 ? 0.4 : 1,
                                    cursor: processingAll || readyCount === 0 ? 'not-allowed' : 'pointer',
                                }}
                            >
                                {processingAll
                                    ? <><Loader2 size={11} className="animate-spin" /> Verwerken…</>
                                    : <><Sparkles size={11} /> Verwerk alles ({readyCount})</>}
                            </button>
                        </div>
                    </div>

                    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                        {jobs.map(function (job) {
                            return (
                                <li key={job.id} style={{
                                    display: 'grid',
                                    gridTemplateColumns: '32px 1fr auto 26px',
                                    gap: 12, alignItems: 'center',
                                    padding: '12px 18px',
                                    borderTop: '1px solid var(--border)',
                                }}>
                                    <JobIcon status={job.status} />
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {shortName(job.file)}
                                        </div>
                                        <div style={{ fontSize: 11, color: job.status === 'error' ? '#ef4444' : 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {job.error || job.progress || statusLabel(job.status)}
                                        </div>
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                                        {job.summary?.totaal != null
                                            ? `€${job.summary.totaal.toFixed(2)}`
                                            : `${Math.round(job.file.size / 1024)} KB`}
                                    </div>
                                    <button
                                        onClick={() => removeJob(job.id)}
                                        aria-label="Verwijder uit batch"
                                        style={iconBtnStyle}
                                    ><X size={12} /></button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}

function JobIcon({ status }: { status: JobStatus }) {
    const wrap: React.CSSProperties = {
        width: 32, height: 32, borderRadius: 8,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
    };
    if (status === 'queued') return <div style={{ ...wrap, background: 'rgba(255,255,255,.04)', color: 'var(--muted)' }}><ImageIcon size={14} /></div>;
    if (status === 'reading' || status === 'extracting') return <div style={{ ...wrap, background: 'rgba(255,191,0,.08)', color: '#FFBF00' }}><Loader2 size={14} className="animate-spin" /></div>;
    if (status === 'ready') return <div style={{ ...wrap, background: 'rgba(16,185,129,.08)', color: '#10b981' }}><CheckCircle2 size={14} /></div>;
    if (status === 'verwerkt') return <div style={{ ...wrap, background: 'rgba(16,185,129,.12)', color: '#10b981' }}><CheckCircle2 size={14} /></div>;
    return <div style={{ ...wrap, background: 'rgba(239,68,68,.08)', color: '#ef4444' }}><AlertCircle size={14} /></div>;
}

function statusLabel(s: JobStatus): string {
    switch (s) {
        case 'queued': return 'Wachten';
        case 'reading': return 'Bestand lezen';
        case 'extracting': return 'AI extracteert';
        case 'ready': return 'Klaar voor verwerken';
        case 'verwerkt': return 'In voorraad geboekt';
        case 'error': return 'Fout';
    }
}

/* Reductie van extractie-output (parseActions) naar samenvatting per bon.
   parseActions levert process_receipt-actions; eerste action heeft de hele
   bon-context (winkel/datum/totaal); items zitten in action.data.items[]. */
function buildSummary(actions: unknown[], cleanText: string): ExtractedSummary {
    const items: ExtractedItem[] = [];
    let winkel: string | undefined;
    let datum: string | undefined;
    let totaal: number | undefined;

    for (const a of actions) {
        if (typeof a !== 'object' || a === null) continue;
        const action = a as { data?: { winkel?: string; datum?: string; totaal_bedrag?: number; items?: unknown[] } };
        const data = action.data || {};
        if (!winkel && data.winkel) winkel = data.winkel;
        if (!datum && data.datum) datum = data.datum;
        if (totaal == null && typeof data.totaal_bedrag === 'number') totaal = data.totaal_bedrag;
        for (const it of (data.items || [])) {
            if (typeof it !== 'object' || it === null) continue;
            const item = it as { naam?: string; aantal?: number; prijs?: number; eenheid?: string };
            if (!item.naam) continue;
            items.push({
                naam: item.naam,
                aantal: item.aantal ?? 1,
                prijs: item.prijs ?? 0,
                eenheid: item.eenheid ?? 'stks',
            });
        }
    }

    return { winkel, datum, totaal, items, rawActions: actions, cleanText };
}

const primaryBtnStyle: React.CSSProperties = {
    padding: '11px 20px', borderRadius: 8,
    background: '#FFBF00', color: '#000',
    border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6,
    minHeight: 44,
};
const ghostBtnStyle: React.CSSProperties = {
    padding: '11px 20px', borderRadius: 8,
    background: 'transparent', color: 'var(--text)',
    border: '1px solid var(--border)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6,
    minHeight: 44,
};
const primaryBtnSmStyle: React.CSSProperties = {
    padding: '7px 12px', borderRadius: 7,
    background: '#FFBF00', color: '#000',
    border: 'none', fontSize: 11, fontWeight: 700,
    display: 'inline-flex', alignItems: 'center', gap: 6,
    minHeight: 32, cursor: 'pointer',
};
const ghostBtnSmStyle: React.CSSProperties = {
    padding: '7px 12px', borderRadius: 7,
    background: 'transparent', color: 'var(--muted)',
    border: '1px solid var(--border)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6,
    minHeight: 32,
};
const iconBtnStyle: React.CSSProperties = {
    width: 26, height: 26, borderRadius: 6,
    background: 'transparent', border: 'none',
    color: 'var(--muted)', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};
