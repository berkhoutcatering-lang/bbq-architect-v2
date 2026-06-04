'use client';

/**
 * AiFotoPromptDialog — Rechter-drawer met 3 paden bij foto-keuze.
 *
 * Sam wil geen image-gen-API (kosten + provider-lock-in). Workflow:
 *  1. Foto uploaden  → triggert bestaand file-input via callback
 *  2. AI maakt prompt → POST /api/gerechten/regenerate-prompt → toont
 *                       English prompt in textarea + Copy + "Open Poe"
 *  3. Sla op zonder foto → sluit dialog, parent laat foto_url leeg
 *                          (kaart krijgt gang-gradient fallback)
 *
 * AI-pad vereist een opgeslagen gerecht (regenerate-prompt route eist `id`).
 * Voor een nieuw gerecht (gerechtId=null) is de knop disabled met hint.
 *
 * Spiegel het bestaande mr-drawer-patroon (memory feedback_drawer_over_center_modal):
 * rechter-paneel, scrim, ESC sluit, 560px desktop / full mobile.
 */

import { useEffect, useState, type CSSProperties } from 'react';
import {
    X, Upload, Sparkles, Copy, ExternalLink, ImageOff, Loader2,
} from 'lucide-react';

interface Props {
    open: boolean;
    onClose: () => void;
    /** ID van bestaand gerecht. null = nieuw gerecht; AI-pad disabled. */
    gerechtId: number | string | null;
    /** Naam van het gerecht (alleen voor display). */
    gerechtNaam?: string;
    /** Triggert parent's verborgen file-input voor upload-flow. */
    onUploadClick: () => void;
    /** Optioneel: callback bij "Sla op zonder foto". Default = alleen sluiten. */
    onSkipPhoto?: () => void;
}

type Step = 'choose' | 'prompt';

export default function AiFotoPromptDialog({
    open, onClose, gerechtId, gerechtNaam, onUploadClick, onSkipPhoto,
}: Props) {
    const [step, setStep] = useState<Step>('choose');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [prompt, setPrompt] = useState<string>('');
    const [copied, setCopied] = useState(false);

    /* Reset bij sluiten/heropenen zodat de dialog niet half-state opent. */
    useEffect(() => {
        if (!open) {
            const t = setTimeout(() => {
                setStep('choose');
                setError(null);
                setPrompt('');
                setCopied(false);
            }, 300);
            return () => clearTimeout(t);
        }
        return undefined;
    }, [open]);

    /* ESC sluit de dialog (volgt mr-drawer convention). */
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    const requestPrompt = async () => {
        if (!gerechtId) {
            setError('Sla het gerecht eerst op om AI een foto-prompt te laten maken.');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const r = await fetch('/api/gerechten/regenerate-prompt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: gerechtId }),
            });
            const data = await r.json();
            if (!r.ok) {
                setError(data.error || 'Onbekende fout');
                return;
            }
            setPrompt(data.foto_prompt || '');
            setStep('prompt');
        } catch (e) {
            setError((e as Error).message || 'Netwerk-fout');
        } finally {
            setLoading(false);
        }
    };

    const copyPrompt = async () => {
        try {
            await navigator.clipboard.writeText(prompt);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* clipboard kan blocked zijn in iframe / oudere browsers; user selecteert handmatig */
        }
    };

    const handleUpload = () => {
        onClose();
        onUploadClick();
    };

    const handleSkip = () => {
        onClose();
        onSkipPhoto?.();
    };

    return (
        <>
            <div className="mr-drawer-scrim" onClick={onClose} role="presentation" />
            <div
                className="mr-drawer mr-drawer-edit"
                role="dialog"
                aria-modal="true"
                aria-labelledby="ai-foto-dialog-title"
            >
                <div className="mr-drawer-header">
                    <div className="mr-drawer-header-info" style={{ padding: 0 }}>
                        <div style={{
                            fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase',
                            color: 'var(--brand, #c4a35a)', fontWeight: 700, marginBottom: 4,
                        }}>
                            Foto
                        </div>
                        <h2
                            id="ai-foto-dialog-title"
                            style={{
                                margin: 0,
                                fontFamily: 'var(--font-display, Georgia, serif)',
                                fontStyle: 'italic', fontSize: 22, fontWeight: 500,
                            }}
                        >
                            {step === 'choose' ? 'Wil je een foto?' : 'AI heeft een prompt gemaakt'}
                        </h2>
                        {gerechtNaam && (
                            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                                voor {gerechtNaam}
                            </div>
                        )}
                    </div>
                    <button className="mr-drawer-close" onClick={onClose} aria-label="Sluit">
                        <X size={18} />
                    </button>
                </div>

                <div className="mr-drawer-content" style={{ padding: '24px' }}>
                    {step === 'choose' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <OptionCard
                                onClick={handleUpload}
                                title="Foto uploaden"
                                subtitle="Vanaf je telefoon, camera-rol of computer"
                                icon={<Upload size={18} color="#22c55e" />}
                                iconBg="rgba(34,197,94,.12)"
                                iconBorder="rgba(34,197,94,.3)"
                            />
                            <OptionCard
                                onClick={requestPrompt}
                                disabled={loading || !gerechtId}
                                title="AI maakt een foto-prompt"
                                subtitle={
                                    !gerechtId
                                        ? 'Sla het gerecht eerst op'
                                        : 'Engelse beschrijving om te plakken in Poe, Sora of Nano Banana'
                                }
                                icon={loading
                                    ? <Loader2 size={18} className="animate-spin" color="#c4a35a" />
                                    : <Sparkles size={18} color="#c4a35a" />
                                }
                                iconBg="rgba(196,163,90,.12)"
                                iconBorder="rgba(196,163,90,.3)"
                                tooltip={!gerechtId ? 'Sla het gerecht eerst op' : undefined}
                            />
                            <OptionCard
                                onClick={handleSkip}
                                title="Sla op zonder foto"
                                subtitle="Het gerecht krijgt een gang-getinte tegel als visual"
                                icon={<ImageOff size={18} color="var(--muted)" />}
                                iconBg="rgba(148,163,184,.12)"
                                iconBorder="rgba(148,163,184,.28)"
                            />

                            {error && (
                                <div style={{
                                    padding: '10px 12px', borderRadius: 8, fontSize: 12,
                                    background: 'rgba(239,68,68,.08)',
                                    border: '1px solid rgba(239,68,68,.25)',
                                    color: '#fca5a5', marginTop: 4,
                                }}>
                                    {error}
                                </div>
                            )}
                        </div>
                    )}

                    {step === 'prompt' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
                                Kopieer deze prompt en plak hem in een image-generator
                                zoals <strong style={{ color: 'var(--text)' }}>Poe</strong>,
                                {' '}<strong style={{ color: 'var(--text)' }}>Sora</strong> of
                                {' '}<strong style={{ color: 'var(--text)' }}>Nano Banana</strong>.
                                Bewaar de gegenereerde foto en upload &rsquo;m hierna via &ldquo;Foto uploaden&rdquo;.
                            </div>

                            <textarea
                                readOnly
                                value={prompt}
                                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                                style={{
                                    width: '100%', minHeight: 260, padding: 12,
                                    fontSize: 12,
                                    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                                    border: '1px solid var(--border)', borderRadius: 8,
                                    background: 'var(--bg-subtle, rgba(255,255,255,.02))',
                                    color: 'var(--text)', lineHeight: 1.5, resize: 'vertical',
                                }}
                            />

                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                <button
                                    type="button"
                                    onClick={copyPrompt}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                        padding: '8px 14px', borderRadius: 8, border: 'none',
                                        background: copied ? '#22c55e' : 'var(--brand, #c4a35a)',
                                        color: '#1a1a1e', fontSize: 13, fontWeight: 600,
                                        cursor: 'pointer', minHeight: 36,
                                        transition: 'background .15s',
                                    }}
                                >
                                    <Copy size={13} /> {copied ? 'Gekopieerd!' : 'Kopieer prompt'}
                                </button>
                                <a
                                    href="https://poe.com/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                        padding: '8px 14px', borderRadius: 8,
                                        border: '1px solid var(--border)',
                                        background: 'transparent', color: 'var(--text)',
                                        fontSize: 13, fontWeight: 600, textDecoration: 'none',
                                        minHeight: 36,
                                    }}
                                >
                                    <ExternalLink size={13} /> Open Poe
                                </a>
                                <div style={{ flex: 1 }} />
                                <button
                                    type="button"
                                    onClick={() => setStep('choose')}
                                    style={{
                                        padding: '8px 12px', borderRadius: 8,
                                        border: '1px solid var(--border)',
                                        background: 'transparent', color: 'var(--muted)',
                                        fontSize: 12, fontWeight: 500, cursor: 'pointer',
                                        minHeight: 36,
                                    }}
                                >
                                    Terug
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

/* ─── OptionCard — 3 keuze-knoppen in choose-step ──────────────── */

interface OptionCardProps {
    onClick: () => void;
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    iconBg: string;
    iconBorder: string;
    disabled?: boolean;
    tooltip?: string;
}

function OptionCard({
    onClick, title, subtitle, icon, iconBg, iconBorder, disabled, tooltip,
}: OptionCardProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={tooltip}
            style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                padding: '14px 16px', minHeight: 70,
                border: '1px solid var(--border)', borderRadius: 12,
                background: 'transparent',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1,
                textAlign: 'left' as const,
                transition: 'border-color .15s, background .15s',
                fontFamily: 'inherit',
                color: 'var(--text)',
            }}
            onMouseEnter={(e) => {
                if (!disabled) {
                    e.currentTarget.style.borderColor = 'var(--brand, #c4a35a)';
                    e.currentTarget.style.background = 'rgba(196,163,90,.04)';
                }
            }}
            onMouseLeave={(e) => {
                if (!disabled) {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.background = 'transparent';
                }
            }}
        >
            <div style={iconCircleStyle(iconBg, iconBorder)}>{icon}</div>
            <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    {subtitle}
                </div>
            </div>
        </button>
    );
}

function iconCircleStyle(bg: string, border: string): CSSProperties {
    return {
        width: 40, height: 40, borderRadius: 12, flexShrink: 0,
        background: bg, border: `1px solid ${border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    };
}
