'use client';

/**
 * AI-Coach paneel — gekoppeld aan POST /api/menukaart-editor/suggest met
 * Claude Sonnet 4.6 + tool-use (S4 fase-2).
 *
 * Tools: set_color, set_font, set_size, set_weight, set_logo_position,
 * toggle_decoration. Server filtert no-op diffs (Pillar #1) en checkt
 * allow-list (Pillar #2). Rate-limit 10/u per tenant + cost-tracking
 * (Pillar #3).
 */

import { Sparkles, Palette, Type, Image as ImageIcon, Check } from 'lucide-react';

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
    state: 'idle' | 'loading' | 'result' | 'error';
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
    errorMessage?: string;
    costCents?: number;
    rateLimitRemaining?: number;
};

export default function AICoach({
    state, prompt, onPromptChange, onSubmit, onCancel,
    summary, diffs = [], onApplyOne, onSkipOne, onApplyAll, onDiscardAll,
    errorMessage, costCents, rateLimitRemaining,
}: Props) {
    if (state === 'loading') return <LoadingView prompt={prompt} onCancel={onCancel} />;
    if (state === 'error') return (
        <PromptInput
            prompt={prompt}
            onPromptChange={onPromptChange}
            onSubmit={onSubmit}
            rateLimitRemaining={rateLimitRemaining}
            submitLabel="Opnieuw proberen"
            errorMessage={errorMessage}
        />
    );
    if (state === 'result') return (
        <ResultView
            prompt={prompt}
            onPromptChange={onPromptChange}
            onSubmit={onSubmit}
            summary={summary}
            diffs={diffs}
            costCents={costCents}
            rateLimitRemaining={rateLimitRemaining}
            onApplyOne={onApplyOne}
            onSkipOne={onSkipOne}
            onApplyAll={onApplyAll}
            onDiscardAll={onDiscardAll}
        />
    );
    return (
        <PromptInput
            prompt={prompt}
            onPromptChange={onPromptChange}
            onSubmit={onSubmit}
            rateLimitRemaining={rateLimitRemaining}
        />
    );
}

/**
 * Gedeelde input-block voor idle / error / result-states. Door dezelfde
 * component te hergebruiken kan de gebruiker ALTIJD een nieuwe vraag stellen,
 * ook nadat een voorstel binnen is — geen "vastgelopen na 1 vraag" bug meer.
 */
function PromptInput({
    prompt, onPromptChange, onSubmit, rateLimitRemaining,
    submitLabel = 'Voorstel maken', errorMessage, compact = false,
}: {
    prompt: string;
    onPromptChange: (s: string) => void;
    onSubmit: () => void;
    rateLimitRemaining?: number;
    submitLabel?: string;
    errorMessage?: string;
    compact?: boolean;
}) {
    return (
        <div className="mke-ai" style={compact ? { paddingBottom: 4 } : undefined}>
            {errorMessage && (
                <div style={{ padding: '12px', background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 'var(--mke-radius)', fontSize: 12, color: '#fca5a5', lineHeight: 1.5 }}>
                    {errorMessage}
                </div>
            )}
            <textarea
                className="mke-ai-textarea"
                placeholder={compact ? 'Vraag iets anders…' : 'Beschrijf wat je wil veranderen…'}
                value={prompt}
                onChange={e => onPromptChange(e.target.value)}
                rows={compact ? 2 : undefined}
            />
            {!compact && (
                <div className="mke-ai-chips">
                    {SAMPLE_PROMPTS.map(p => (
                        <button key={p} className="mke-ai-chip" onClick={() => onPromptChange(p)} type="button">
                            &ldquo;{p}&rdquo;
                        </button>
                    ))}
                </div>
            )}
            <button
                className="mke-ai-submit"
                onClick={onSubmit}
                disabled={prompt.trim().length === 0}
                type="button"
            >
                <Sparkles size={15} /> {submitLabel}
            </button>
            {!compact && (
                <div style={{ fontSize: 10, color: 'var(--mke-muted-light)', textAlign: 'center', padding: '4px 0', display: 'flex', justifyContent: 'space-between' }}>
                    <span>~€0.003 per voorstel</span>
                    {typeof rateLimitRemaining === 'number' && <span>{rateLimitRemaining}/10 dit minuut</span>}
                </div>
            )}
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
    prompt, onPromptChange, onSubmit,
    summary, diffs, costCents, rateLimitRemaining,
    onApplyOne, onSkipOne, onApplyAll, onDiscardAll,
}: {
    prompt: string;
    onPromptChange: (s: string) => void;
    onSubmit: () => void;
    summary?: string; diffs: Diff[];
    costCents?: number; rateLimitRemaining?: number;
    onApplyOne?: (id: string) => void; onSkipOne?: (id: string) => void;
    onApplyAll?: () => void; onDiscardAll?: () => void;
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* Nieuwe vraag-input ALTIJD bovenaan zodat je oneindig kan
                tweaken zonder eerst diffs te accepteren/weggooien. */}
            <PromptInput
                prompt={prompt}
                onPromptChange={onPromptChange}
                onSubmit={onSubmit}
                rateLimitRemaining={rateLimitRemaining}
                submitLabel="Nieuw voorstel maken"
                compact
            />
            <div style={{ borderTop: '1px solid var(--mke-border)' }} />
            <div className="mke-ai">
                {summary && <div className="mke-ai-summary">{summary}</div>}
                {diffs.length === 0 ? (
                    <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--mke-muted)', fontSize: 12, background: 'var(--mke-bg)', border: '1px solid var(--mke-border)', borderRadius: 'var(--mke-radius)' }}>
                        Niks om voor te stellen — je menukaart staat al strak voor deze vraag.
                        <div style={{ marginTop: 8 }}>
                            <button className="mke-ai-cancel" onClick={onDiscardAll} type="button">Wis voorstel</button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="mke-diffs">
                            {diffs.map(d => <DiffRow key={d.id} diff={d} onApply={() => onApplyOne?.(d.id)} onSkip={() => onSkipOne?.(d.id)} />)}
                        </div>
                        <div className="mke-diff-footer">
                            <button className="mke-btn-primary" onClick={onApplyAll} type="button">Alles toepassen</button>
                            <button className="mke-btn-ghost" onClick={onDiscardAll} type="button">Alles weggooien</button>
                        </div>
                    </>
                )}
                <div style={{ fontSize: 10, color: 'var(--mke-muted-light)', textAlign: 'center', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{typeof costCents === 'number' ? `€${(costCents / 100).toFixed(3)} kosten` : ''}</span>
                    {typeof rateLimitRemaining === 'number' && <span>{rateLimitRemaining}/10 dit minuut</span>}
                </div>
            </div>
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

