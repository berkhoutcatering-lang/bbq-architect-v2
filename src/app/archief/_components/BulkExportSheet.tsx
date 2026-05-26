/**
 * BulkExportSheet — modal voor boekhouder-pakket export (Pillar #4 / P0.11).
 *
 * Design DNA uit Claude archief-modals.jsx:70-133.
 * Toont selected-bonnen lijst + BTW-split summary + ZIP-export trigger.
 *
 * Server-call: POST /api/archief/bulk-export met { bonIds }.
 * Returnt ZIP-stream die direct als download wordt aangeboden.
 */
'use client';

import { useState } from 'react';
import { FileArchive, X, Download } from 'lucide-react';
import type { BonRow } from '@/lib/dal/bonnen';
import { fmtEur, fmtDateShort } from './format';

interface Props {
    open: boolean;
    onClose: () => void;
    selectedBonnen: BonRow[];
}

export function BulkExportSheet({ open, onClose, selectedBonnen }: Props) {
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!open) return null;

    const total = selectedBonnen.reduce((s, b) => s + Number(b.totaal_bedrag ?? 0), 0);
    const btw9 = selectedBonnen.reduce((s, b) => s + Number(b.btw_laag_bedrag ?? 0), 0);
    const btw21 = selectedBonnen.reduce((s, b) => s + Number(b.btw_hoog_bedrag ?? 0), 0);

    const doExport = async () => {
        setExporting(true);
        setError(null);
        try {
            const res = await fetch('/api/archief/bulk-export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bonIds: selectedBonnen.map((b) => b.id) }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({ error: 'export mislukt' }));
                throw new Error(data.error ?? 'Export mislukt');
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `bonnenkistje-${new Date().toISOString().slice(0, 10)}.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Onbekende fout');
        } finally {
            setExporting(false);
        }
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-export-title"
            className="fixed inset-0 z-[9998] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(6px)' }}
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="max-h-[85vh] w-[580px] max-w-[90vw] overflow-auto rounded-[16px] border"
                style={{
                    background: 'var(--bg-elevated)',
                    borderColor: 'var(--border)',
                    boxShadow: '0 24px 60px rgba(0,0,0,.5)',
                    animation: 'fadeInUp .3s ease both',
                }}
            >
                {/* Header */}
                <div
                    className="flex items-center gap-3 border-b px-6 py-5"
                    style={{ borderColor: 'var(--border)' }}
                >
                    <div
                        className="flex h-9 w-9 items-center justify-center rounded-[10px] border"
                        style={{
                            background: 'rgba(196,163,90,.12)',
                            borderColor: 'rgba(196,163,90,.25)',
                        }}
                    >
                        <FileArchive size={18} style={{ color: 'var(--brand-gold)' }} />
                    </div>
                    <div className="flex-1">
                        <h2 id="bulk-export-title" className="text-[16px] font-semibold">
                            Boekhouder-pakket samenstellen
                        </h2>
                        <p className="text-[12px] text-[var(--muted)]">
                            {selectedBonnen.length} {selectedBonnen.length === 1 ? 'bon' : 'bonnen'} geselecteerd
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Sluiten"
                        className="text-[var(--muted)] hover:text-[var(--text)]"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Selected bonnen lijst */}
                <div className="max-h-[280px] overflow-y-auto px-6 py-4">
                    {selectedBonnen.map((bon) => (
                        <div
                            key={bon.id}
                            className="flex items-center gap-3 border-b py-2 text-[12px]"
                            style={{ borderColor: 'rgba(130,130,130,.06)' }}
                        >
                            <span className="flex-1">
                                {bon.leverancier_naam ?? bon.winkel ?? '—'} · {fmtDateShort(bon.datum)}
                            </span>
                            <span className="font-mono tabular-nums text-[var(--muted)]">
                                {fmtEur(Number(bon.totaal_bedrag ?? 0))}
                            </span>
                        </div>
                    ))}
                </div>

                {/* BTW summary */}
                <div
                    className="grid grid-cols-3 gap-3 border-t px-6 py-4"
                    style={{ background: 'rgba(130,130,130,.03)', borderColor: 'var(--border)' }}
                >
                    <div>
                        <div className="mb-1 text-[10px] font-bold uppercase tracking-[.12em] text-[var(--muted)]">
                            Bonnen
                        </div>
                        <div
                            className="font-semibold tabular-nums"
                            style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}
                        >
                            {selectedBonnen.length}
                        </div>
                    </div>
                    <div>
                        <div className="mb-1 text-[10px] font-bold uppercase tracking-[.12em] text-[var(--muted)]">
                            Totaal
                        </div>
                        <div className="font-mono text-[18px] font-semibold tabular-nums">
                            {fmtEur(total)}
                        </div>
                    </div>
                    <div>
                        <div className="mb-1 text-[10px] font-bold uppercase tracking-[.12em] text-[var(--muted)]">
                            BTW split
                        </div>
                        <div className="font-mono text-[12px] tabular-nums text-[var(--muted)]">
                            <div>9%: {fmtEur(btw9)}</div>
                            <div>21%: {fmtEur(btw21)}</div>
                        </div>
                    </div>
                </div>

                {/* Error message */}
                {error && (
                    <div className="px-6 pt-3 text-[12px] text-red-400" role="alert">
                        {error}
                    </div>
                )}

                {/* Footer */}
                <div className="flex justify-end gap-2 px-6 py-4">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={exporting}
                        className="rounded-[10px] px-4 py-2 text-[13px] font-semibold text-[var(--text)] transition hover:bg-white/[0.05] disabled:opacity-50"
                    >
                        Annuleren
                    </button>
                    <button
                        type="button"
                        onClick={doExport}
                        disabled={exporting || selectedBonnen.length === 0}
                        className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--brand)] px-4 py-2 text-[13px] font-semibold text-black transition hover:bg-[var(--brand-hover)] disabled:opacity-50"
                    >
                        <Download size={14} />
                        {exporting ? 'Exporteren…' : 'ZIP + index.csv exporteren'}
                    </button>
                </div>
            </div>
        </div>
    );
}
