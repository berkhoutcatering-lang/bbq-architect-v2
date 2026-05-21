'use client';

/**
 * AI-Coach paneel (UI-only voor S4-fase-1).
 *
 * S4-fase-2 koppelt dit aan POST /api/menukaart-editor/suggest met Claude
 * Sonnet 4.6 + tool-use (set_color, set_font, set_size, etc.). De diff-lijst
 * shape past nu al bij de tool-call response zodat fase-2 niets hoeft te
 * herontwerpen.
 */

import { Sparkles, Palette, Type, Image as ImageIcon, Check } from 'lucide-react';
import type { ReactNode } from 'react';

export type DiffType = 'kleur' | 'typo' | 'logo' | 'deco' | 'text';
export type DiffStatus = 'open' | 'applied' | 'skipped';

export type Diff = {
    id: string;
    type: DiffType;
    label: string;
    fromSwatch?: string;
    fromText?: string;
    toSwatch?: string;
    toText?: string;
    status: DiffStatus;
    /** De daadwerkelijke override-keys + values die `applied` triggert. */
    apply: Record<string, unknown>;
};

const SAMPLE_PROMPTS = [
    'Maak donkerder met goud-accent',
    'Strakker, minder decoratie',
    'Iets warmer en groffer',
    'Letters 2 punten kleiner',
];

function DiffIcon({ type }: { type: DiffType }) {
    const Icon = type === 'kleur' ? Palette : type === 'typo' ? Type : type === 'logo' ? ImageIcon : Sparkles;
    return <Icon size={14} />;
}

type Props = {
    state: 'idle' | 'loading' | 'result';
    prompt: string;
    onPromptChange: (s: string) => void;
    onSubmit: () => void;
    onCancel: () => void;
    summary?: string;
    diffs?: Diff[];
    onApplyOne?: (id: string) => void;
    onSkipOne?: (id: string) => void;
    onApplyAll?: () => void;
    onDiscardAll?: () => void;
};

export default function AICoach({
    state, prompt, onPromptChange, onSubmit, onCancel,
    summary, diffs = [], onApplyOne, onSkipOne, onApplyAll, onDiscardAll,
}: Props) {
    if (state === 'idle') return <IdleView prompt={prompt} onPromptChange={onPromptChange} onSubmit={onSubmit} />;
    if (state === 'loading') return <LoadingView prompt={prompt} onCancel={onCancel} />;
    return <ResultView summary={summary} diffs={diffs} onApplyOne={onApplyOne} onSkipOne={onSkipOne} onApplyAll={onApplyAll} onDiscardAll={onDiscardAll} />;
}

function IdleView({ prompt, onPromptChange, onSubmit }: { prompt: string; onPromptChange: (s: string) => void; onSubmit: () => void }) {
    return (
        <div className="mke-ai">
            <textarea
                className="mke-ai-textarea"
                placeholder="Beschrijf wat je wil veranderen…"
                value={prompt}
                onChange={e => onPromptChange(e.target.value)}
            />
            <div className="mke-ai-chips">
                {SAMPLE_PROMPTS.map(p => (
                    <button key={p} className="mke-ai-chip" onClick={() => onPromptChange(p)} type="button">
                        &ldquo;{p}&rdquo;
                    </button>
                ))}
            </div>
            <button
                className="mke-ai-submit"
                onClick={onSubmit}
                disabled={prompt.trim().length === 0}
                type="button"
            >
                <Sparkles size={15} /> Voorstel maken
            </button>
            <Note />
        </div>
    );
}

function LoadingView({ prompt, onCancel }: { prompt: string; onCancel: () => void }) {
    return (
        <div className="mke-ai">
            <div style={{ padding: '8px 10px', background: 'var(--mke-bg)', borderRadius: 'var(--mke-radius)', border: '1px solid var(--mke-border)', fontSize: 12, color: 'var(--mke-muted)' }}>
                &ldquo;{prompt}&rdquo;
            </div>
            <div className="mke-ai-loading">
                <div className="mke-spinner" />
                <div className="mke-ai-loading-text">AI denkt na… ~8s</div>
                <button className="mke-ai-cancel" onClick={onCancel} type="button">Annuleren</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="mke-skel" style={{ width: '85%' }} />
                <div className="mke-skel" style={{ width: '60%' }} />
                <div className="mke-skel" style={{ width: '72%' }} />
            </div>
        </div>
    );
}

function ResultView({
    summary, diffs, onApplyOne, onSkipOne, onApplyAll, onDiscardAll,
}: {
    summary?: string; diffs: Diff[];
    onApplyOne?: (id: string) => void; onSkipOne?: (id: string) => void;
    onApplyAll?: () => void; onDiscardAll?: () => void;
}) {
    return (
        <div className="mke-ai">
            {summary && <div className="mke-ai-summary">{summary}</div>}
            <div className="mke-diffs">
                {diffs.map(d => <DiffRow key={d.id} diff={d} onApply={() => onApplyOne?.(d.id)} onSkip={() => onSkipOne?.(d.id)} />)}
            </div>
            {diffs.length > 0 && (
                <div className="mke-diff-footer">
                    <button className="mke-btn-primary" onClick={onApplyAll} type="button">Alles toepassen</button>
                    <button className="mke-btn-ghost" onClick={onDiscardAll} type="button">Alles weggooien</button>
                </div>
            )}
        </div>
    );
}

function DiffRow({ diff, onApply, onSkip }: { diff: Diff; onApply: () => void; onSkip: () => void }) {
    return (
        <div className="mke-diff">
            <div className={`mke-diff-icon ${diff.type}`}><DiffIcon type={diff.type} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div className="mke-diff-label">{diff.label}</div>
                <div className="mke-diff-change">
                    {diff.fromSwatch && <span className="mke-diff-swatch" style={{ background: diff.fromSwatch }} />}
                    {diff.fromText && <span>{diff.fromText}</span>}
                    <span className="arrow">→</span>
                    {diff.toSwatch && <span className="mke-diff-swatch" style={{ background: diff.toSwatch }} />}
                    {diff.toText && <span>{diff.toText}</span>}
                </div>
            </div>
            <div className="mke-diff-actions">
                {diff.status === 'applied' ? (
                    <button className="mke-diff-accept applied" disabled type="button">
                        <Check size={11} style={{ marginRight: 2 }} /> Toegepast
                    </button>
                ) : diff.status === 'skipped' ? (
                    <button className="mke-diff-skip skipped" disabled type="button">Overgeslagen</button>
                ) : (
                    <>
                        <button className="mke-diff-accept" onClick={onApply} type="button">Toepassen</button>
                        <button className="mke-diff-skip" onClick={onSkip} type="button">Overslaan</button>
                    </>
                )}
            </div>
        </div>
    );
}

function Note() {
    return (
        <div style={{ fontSize: 11, color: 'var(--mke-muted-light)', textAlign: 'center', padding: '4px 0' }}>
            AI-voorstel komt in S4-fase-2. Voor nu kan je alles handmatig tweaken in de Eigenschappen-tab.
        </div>
    );
}
