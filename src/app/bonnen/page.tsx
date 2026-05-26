/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
/**
 * /bonnen — Bucket E P0-1 unified bon-scanner entry-point.
 *
 * Eén route die de 3 oude flows vervangt:
 *   - /inkoop bon-scan       → leeft hier, vereenvoudigd
 *   - BonAddSheet            → blijft als modal in /geld/boekhouder, post naar
 *                              dezelfde /api/bonnen/extract
 *   - ScanFab field-mode     → blijft mobile FAB, redirect hierheen na shot
 *
 * Op deze pagina:
 *   1. MultiFormatDropZone (drag-drop, paste, camera, picker)
 *   2. Extract-results sectie: per geüploade bon een preview-card met items
 *   3. Acties: → /archief openen, of meteen weer een nieuwe scan
 */

import React, { useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import PageSection from '@/components/PageSection';
import PageGuideNote from '@/components/PageGuideNote';
import { useToast } from '@/components/Toast';
import MultiFormatDropZone, {
    type ExtractResult,
} from '@/app/bonnen/_components/MultiFormatDropZone';
import { fmt } from '@/lib/utils';
import { ArrowRight, Check, Archive, ExternalLink } from 'lucide-react';

interface CompletedExtract {
    id: string;
    file_name: string;
    result: ExtractResult;
}

export default function BonnenPage() {
    const showToast = useToast();
    const [completed, setCompleted] = useState<CompletedExtract[]>([]);

    function handleExtracted(result: ExtractResult, originalFile: File) {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setCompleted(prev => [{ id, file_name: originalFile.name, result }, ...prev]);

        const lev = result.bon_preview.leverancier_naam || 'onbekende leverancier';
        const totaal = result.bon_preview.totaal_bedrag;
        const itemCount = result.items_with_suggestions.length;
        showToast({
            message: `${lev} — ${itemCount} regel${itemCount === 1 ? '' : 's'} · ${fmt(totaal)}`,
            type: 'success',
            title: 'Bon uitgelezen',
        });
    }

    function handleDuplicate(dup: any, originalFile: File) {
        showToast({
            message: `${originalFile.name} stond al in je archief${dup.duplicate_winkel ? ` (${dup.duplicate_winkel}` + (dup.duplicate_datum ? `, ${dup.duplicate_datum})` : ')') : ''}.`,
            type: 'warning',
            title: 'Deze bon staat al',
            action: {
                label: 'Open bon',
                onClick: () => {
                    window.location.href = `/archief?bon=${dup.duplicate_bon_id}`;
                },
            },
        });
    }

    function handleError(message: string) {
        /* Format-fouten van de extract-route (415 unsupported_mime) komen hier.
           Mensentaal: geen "415 status" of "unsupported_mime", gewoon de uitleg. */
        showToast({
            message: message.toLowerCase().includes('format')
                ? message
                : `Bon uitlezen mislukt: ${message}`,
            type: 'error',
            title: 'Format niet ondersteund',
        });
    }

    return (
        <div className="container" style={{ paddingBottom: 80 }}>
            <PageHeader
                title="Bonnen scannen"
                description="Drop foto's, PDFs, screenshots of UBL-XML. Wij lezen ze uit en zetten ze klaar voor je archief."
                actions={
                    <Link
                        href="/archief"
                        className="btn btn-ghost"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                        <Archive size={16} /> Open archief
                    </Link>
                }
            />

            <PageGuideNote
                id="bonnen"
                accent="#FFBF00"
                intro="Sleep meerdere bestanden tegelijk, plak een screenshot met Cmd+V, of gebruik de camera op je telefoon."
                actions={[
                    { lead: 'PDF en foto', text: '— Haiku leest de bon binnen 6 seconden uit.' },
                    { lead: 'UBL-XML', text: '— gratis verwerkt, geen AI-call nodig.' },
                    { lead: 'Cmd+V', text: '— plak een screenshot direct vanaf je klembord.' },
                ]}
            />

            <PageSection>
                <MultiFormatDropZone
                    onExtracted={handleExtracted}
                    onDuplicate={handleDuplicate}
                    onError={handleError}
                    maxBatch={14}
                    variant="page"
                />
            </PageSection>

            {completed.length > 0 && (
                <PageSection>
                    <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
                        Net gescand ({completed.length})
                    </h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {completed.map(c => (
                            <ResultCard key={c.id} entry={c} />
                        ))}
                    </div>
                </PageSection>
            )}
        </div>
    );
}

function ResultCard({ entry }: { entry: CompletedExtract }) {
    const r = entry.result;
    const lev = r.bon_preview.leverancier_naam || '(onbekend)';
    const datum = r.bon_preview.datum || '—';
    const matchedCount = r.items_with_suggestions.filter(i => i.inventory_id != null).length;

    /* UBL = source_type 'ubl_xml' → toon gratis-badge. */
    const isUbl = r.source_type === 'ubl_xml';

    return (
        <div
            style={{
                padding: 16,
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--card, rgba(30,30,34,.5))',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    marginBottom: 12,
                    flexWrap: 'wrap',
                }}
            >
                <div
                    style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: 'rgba(34,197,94,.12)',
                        color: 'var(--green)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                    }}
                    aria-hidden="true"
                >
                    <Check size={20} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>
                        {lev}{' '}
                        <span
                            style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}
                        >
                            · {datum}
                        </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{entry.file_name}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {isUbl && (
                        <Badge color="var(--purple, #a78bfa)" label="UBL · gratis" />
                    )}
                    {!isUbl && (
                        <Badge
                            color="var(--brand)"
                            label={`${r.ocr_engine} · ${(r.ai_cost_eur_cents / 100).toFixed(3)}€`}
                        />
                    )}
                    <Badge
                        color={r.confidence >= 0.85 ? 'var(--green)' : 'var(--amber)'}
                        label={`${Math.round(r.confidence * 100)}%`}
                    />
                </div>
            </div>

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: 12,
                    marginBottom: 12,
                }}
            >
                <Stat label="Totaal" value={fmt(r.bon_preview.totaal_bedrag)} />
                <Stat label="Netto" value={fmt(r.bon_preview.netto_bedrag)} />
                <Stat label="BTW 9%" value={fmt(r.bon_preview.btw_laag_bedrag)} />
                <Stat label="BTW 21%" value={fmt(r.bon_preview.btw_hoog_bedrag)} />
                <Stat
                    label="Regels"
                    value={`${r.items_with_suggestions.length} · ${matchedCount} gematcht`}
                />
            </div>

            <details>
                <summary
                    style={{
                        cursor: 'pointer',
                        fontSize: 12,
                        color: 'var(--muted)',
                        marginBottom: 8,
                    }}
                >
                    Toon regels ({r.items_with_suggestions.length})
                </summary>
                <ul
                    style={{
                        listStyle: 'none',
                        padding: 0,
                        margin: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                    }}
                >
                    {r.items_with_suggestions.slice(0, 50).map((it, i) => (
                        <li
                            key={i}
                            style={{
                                display: 'flex',
                                gap: 8,
                                padding: '4px 0',
                                fontSize: 13,
                                color: 'var(--text)',
                            }}
                        >
                            <span style={{ flex: 1 }}>
                                {it.naam}
                                {it.inventory_naam && (
                                    <span
                                        style={{
                                            fontSize: 11,
                                            color: 'var(--green)',
                                            marginLeft: 6,
                                        }}
                                    >
                                        → {it.inventory_naam}
                                    </span>
                                )}
                            </span>
                            <span style={{ color: 'var(--muted)' }}>
                                {it.aantal} {it.unit}
                            </span>
                            <span style={{ minWidth: 70, textAlign: 'right' }}>
                                {fmt(it.totaal)}
                            </span>
                        </li>
                    ))}
                </ul>
            </details>

            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <Link
                    href="/archief"
                    className="btn btn-brand"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        minHeight: 36,
                    }}
                >
                    Bevestig in archief <ArrowRight size={14} />
                </Link>
                <Link
                    href="/geld/boekhouder"
                    className="btn btn-ghost"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        minHeight: 36,
                    }}
                >
                    Naar boekhouder <ExternalLink size={14} />
                </Link>
            </div>
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div
                style={{
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '.05em',
                    color: 'var(--muted)',
                    marginBottom: 2,
                }}
            >
                {label}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{value}</div>
        </div>
    );
}

function Badge({ color, label }: { color: string; label: string }) {
    return (
        <span
            style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '3px 8px',
                borderRadius: 999,
                background: `color-mix(in srgb, ${color} 14%, transparent)`,
                color,
                whiteSpace: 'nowrap',
            }}
        >
            {label}
        </span>
    );
}
