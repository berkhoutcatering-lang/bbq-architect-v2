/**
 * BonkSnippet — zoekresultaat-row met ts_headline snippet.
 *
 * Design DNA uit Claude archief-kistje.jsx:68-123.
 * Breadcrumb (leverancier · datum · bedrag) + snippet met <mark>-highlights +
 * tag-pills + chevron. Click opent BonPreview.
 *
 * Snippet komt server-side van ts_headline() (zie search_bonnen_ranked RPC)
 * met StartSel=<mark>,StopSel=</mark>. We renderen via dangerouslySetInnerHTML
 * na DOMPurify-sanitization — alleen <mark> tags blijven, rest gestript.
 */
'use client';

import { ChevronRight, Calendar } from 'lucide-react';
import type { BonRow } from '@/lib/dal/bonnen';
import { BonReceiptThumb } from './BonReceiptThumb';
import { sanitizeSnippet } from './sanitizeSnippet';

interface Props {
    bon: BonRow;
    onClick?: () => void;
}

export function BonkSnippet({ bon, onClick }: Props) {
    const fmtEur = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });
    const fmtDate = (d: string | null) =>
        d ? new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

    const fileType: 'pdf' | 'image' = bon.file_mime?.includes('pdf') ? 'pdf' : 'image';
    const snippetHtml = bon.snippet ? sanitizeSnippet(bon.snippet) : null;

    return (
        <button
            type="button"
            onClick={onClick}
            className="ar-search-row flex w-full cursor-pointer items-start gap-3.5 rounded-[12px] border border-transparent p-3.5 text-left transition-colors hover:border-[var(--border)] hover:bg-white/[0.02]"
        >
            <div className="h-[68px] w-[54px] flex-shrink-0">
                <BonReceiptThumb
                    supplier={bon.leverancier_naam ?? bon.winkel ?? '—'}
                    type={fileType}
                    amount={Number(bon.totaal_bedrag ?? 0)}
                />
            </div>

            <div className="min-w-0 flex-1">
                {/* Breadcrumb */}
                <div className="mb-1 flex items-center gap-1.5 text-[12px]">
                    <span className="font-semibold text-[var(--text)]">
                        {bon.leverancier_naam ?? bon.winkel ?? 'Onbekend'}
                    </span>
                    <span className="text-[var(--muted-light)]">·</span>
                    <span className="text-[var(--muted)]">{fmtDate(bon.datum)}</span>
                    <span className="text-[var(--muted-light)]">·</span>
                    <span className="font-mono font-medium tabular-nums text-[var(--text)]">
                        {fmtEur.format(Number(bon.totaal_bedrag ?? 0))}
                    </span>
                </div>

                {/* Snippet met server-side <mark> highlights */}
                {snippetHtml ? (
                    <div
                        className="line-clamp-2 text-[12px] leading-[1.5] text-[var(--muted)]"
                        // Inhoud is server-generated ts_headline output, daarna door DOMPurify gehaald.
                        // Alleen <mark>-tags toegestaan. Geen scripts, geen styles.
                        dangerouslySetInnerHTML={{ __html: '…' + snippetHtml }}
                    />
                ) : bon.notities ? (
                    <div className="line-clamp-2 text-[12px] leading-[1.5] text-[var(--muted)]">
                        {bon.notities}
                    </div>
                ) : null}

                {/* Tag-pills + event-koppeling */}
                {(bon.tags?.length || bon.hasEvent) && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                        {bon.tags?.slice(0, 3).map((t) => (
                            <span
                                key={t}
                                className="rounded-[4px] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--muted)]"
                                style={{ background: 'rgba(130,130,130,.08)' }}
                            >
                                {t}
                            </span>
                        ))}
                        {bon.hasEvent && (
                            <span
                                className="inline-flex items-center gap-0.5 rounded-[4px] px-1.5 py-0.5 text-[9px] font-semibold"
                                style={{
                                    background: 'rgba(196,163,90,.1)',
                                    color: 'var(--brand-gold)',
                                }}
                            >
                                <Calendar size={9} />
                                {bon.hasEvent}
                            </span>
                        )}
                    </div>
                )}
            </div>

            <ChevronRight size={14} className="mt-1 flex-shrink-0 text-[var(--muted-light)]" />
        </button>
    );
}
