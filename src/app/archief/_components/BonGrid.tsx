'use client';
/**
 * BonGrid — kaarten-weergave van het Bonnenkistje.
 *
 * Elke kaart toont de échte eerste pagina van de factuur (BonDocThumb),
 * de naam met een koppel-stipje (groen = leverancierskaart, amber = nog
 * niet), datum + bedrag, categorie en één status. Snelle acties (Open
 * factuur / Koppel / Details) verschijnen bij aanwijzen; op een telefoon
 * staan ze altijd (aanwijzen bestaat daar niet).
 *
 * Geen masonry, geen houtnerf, geen nep-bonnetjes meer: een gewone grid
 * met gelijke kaarten leest rustiger en scrollt sneller.
 */

import { Check, FileText, Link2, Loader2 } from 'lucide-react';
import { useState } from 'react';
import type { BonRow } from '@/lib/dal/bonnen';
import { BonDocThumb } from './BonDocThumb';
import { getBonStatusVisual } from '../_lib/statusMap';
import { fmtEur, fmtDate } from './format';

export interface BonCardActions {
    onOpenFile: (bon: BonRow) => Promise<void>;
    onKoppel: (bon: BonRow) => Promise<void>;
}

interface Props extends BonCardActions {
    bonnen: BonRow[];
    selectedIds: number[];
    onSelect: (id: number) => void;
    onBonClick: (bon: BonRow) => void;
}

export function BonGrid({ bonnen, selectedIds, onSelect, onBonClick, onOpenFile, onKoppel }: Props) {
    if (bonnen.length === 0) {
        return (
            <div className="py-16 text-center text-[13px] text-[var(--muted)]">
                Geen bonnen gevonden met deze filters.
            </div>
        );
    }
    return (
        <div className="bk-grid">
            {bonnen.map((bon) => (
                <BonCard
                    key={bon.id}
                    bon={bon}
                    selected={selectedIds.includes(bon.id)}
                    onSelect={() => onSelect(bon.id)}
                    onClick={() => onBonClick(bon)}
                    onOpenFile={onOpenFile}
                    onKoppel={onKoppel}
                />
            ))}
        </div>
    );
}

export function bonFileKind(bon: BonRow): 'pdf' | 'image' | 'email' | 'none' {
    if (bon.source === 'email' && !bon.file_path && !bon.image_url) return 'email';
    if (!bon.file_path && !bon.image_url) return 'none';
    if (bon.file_mime?.startsWith('image/')) return 'image';
    if (bon.image_url && !bon.file_path && !bon.image_url.startsWith('data:application/pdf')) return 'image';
    return 'pdf';
}

function BonCard({
    bon, selected, onSelect, onClick, onOpenFile, onKoppel,
}: { bon: BonRow; selected: boolean; onSelect: () => void; onClick: () => void } & BonCardActions) {
    const status = getBonStatusVisual(bon);
    const kind = bonFileKind(bon);
    const hasFile = kind === 'pdf' || kind === 'image';
    const naam = bon.leverancier_naam ?? bon.winkel ?? '—';
    const gekoppeld = !!bon.leverancier_id;
    const kanKoppelen = !gekoppeld && (bon.winkel?.trim().length ?? 0) >= 2 && !bon.locked_at;
    const catLabel = bon.categorie ?? bon.rgs_category_label ?? null;
    const [busy, setBusy] = useState<'open' | 'koppel' | null>(null);

    const run = async (what: 'open' | 'koppel', fn: () => Promise<void>) => {
        setBusy(what);
        try { await fn(); } finally { setBusy(null); }
    };

    return (
        <article
            className={`bk-card bk-card--${status.display}${kanKoppelen ? ' bk-card--los' : ''}${selected ? ' bk-card--selected' : ''}`}
            role="button"
            tabIndex={0}
            onClick={onClick}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
            aria-label={`${naam}, ${fmtDate(bon.datum)}, ${fmtEur(bon.totaal_bedrag)}`}
        >
            <span className="bk-card__stripe" aria-hidden="true" />

            <button
                type="button"
                className="bk-card__select"
                onClick={(e) => { e.stopPropagation(); onSelect(); }}
                aria-label={selected ? 'Deselecteer' : 'Selecteer'}
                aria-pressed={selected}
            >
                {selected && <Check size={12} strokeWidth={3} />}
            </button>

            <div className="bk-card__doc">
                <BonDocThumb bonId={bon.id} hasFile={hasFile} alt={`Factuur ${naam}`} />
                <span className="bk-card__tag">
                    {kind === 'pdf' ? 'PDF · p.1' : kind === 'image' ? 'Foto' : kind === 'email' ? 'E-mail' : 'Geen bestand'}
                </span>
                <div className="bk-card__quick">
                    {kanKoppelen && (
                        <button
                            type="button"
                            className="bk-btn bk-btn--amber bk-btn--sm"
                            disabled={busy !== null}
                            onClick={(e) => { e.stopPropagation(); void run('koppel', () => onKoppel(bon)); }}
                        >
                            {busy === 'koppel' ? <Loader2 size={12} className="bh-spin" /> : <Link2 size={12} />} Koppel leverancier
                        </button>
                    )}
                    {hasFile && (
                        <button
                            type="button"
                            className="bk-btn bk-btn--sm bk-btn--glass"
                            disabled={busy !== null}
                            onClick={(e) => { e.stopPropagation(); void run('open', () => onOpenFile(bon)); }}
                        >
                            {busy === 'open' ? <Loader2 size={12} className="bh-spin" /> : <FileText size={12} />} Open {kind === 'image' ? 'bon' : 'factuur'}
                        </button>
                    )}
                    {!kanKoppelen && (
                        <button type="button" className="bk-btn bk-btn--sm bk-btn--glass" onClick={(e) => { e.stopPropagation(); onClick(); }}>
                            Details
                        </button>
                    )}
                </div>
            </div>

            <div className="bk-card__body">
                <div className="bk-card__name">
                    <span
                        className={`bk-dot ${gekoppeld ? 'bk-dot--ok' : 'bk-dot--los'}`}
                        title={gekoppeld ? 'Gekoppeld aan een leverancierskaart' : 'Nog geen leverancierskaart'}
                    />
                    <span className="bk-card__n" title={naam}>{naam}</span>
                    {!gekoppeld && <span className="bk-card__los">geen kaart</span>}
                </div>
                <div className="bk-card__meta">
                    <span className="bk-card__date">{fmtDate(bon.datum)}</span>
                    <span className="bk-card__eur">{fmtEur(bon.totaal_bedrag)}</span>
                </div>
                <div className="bk-card__foot">
                    <span className={`bk-card__cat${catLabel ? '' : ' bk-card__cat--none'}`} title={catLabel ?? undefined}>
                        {catLabel ?? 'nog geen categorie'}
                    </span>
                    <span className={`bk-st bk-st--${status.display}`}>{status.label}</span>
                </div>
            </div>
        </article>
    );
}
