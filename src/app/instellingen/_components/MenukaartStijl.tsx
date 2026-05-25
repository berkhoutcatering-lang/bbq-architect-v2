'use client';

/**
 * MenukaartStijl — tenant-brand-cascade voor menukaart-templates in /instellingen.
 *
 * Wat het doet:
 *   - Toont 10 thumbnails van alle enabled templates uit registry
 *   - Toont 2 color-pickers (Brand-kleur = accent, Achtergrond = bg)
 *   - Pre-selecteert huidige settings.menukaart_template_id + overrides
 *   - Submit roept saveTenantBrandOverrides() server action aan
 *
 * Cascade-effect:
 *   - Deze stijl propageert als DEFAULT naar elke nieuwe offerte van deze tenant
 *   - Bestaande offertes met eigen menukaart_overrides blijven hun custom-layer houden
 *   - Cascade order: template-default → settings.menukaart_overrides (deze) → offerte.menukaart_overrides
 *
 * Validatie:
 *   - Server action doet allow-list check tegen template.allowList
 *   - Lege color-string → override wordt verwijderd (terug naar template-default)
 *
 * Spec: bucket B P0-1.
 */

import { useState, useTransition, useEffect, useMemo } from 'react';
import { Check, Loader2, Save, RotateCcw, Palette } from 'lucide-react';
import { listEnabledTemplates, DEFAULT_TEMPLATE_ID, type Overrides } from '@/lib/menukaart/registry';
import { ThumbnailFor } from '@/components/menukaart/templates/Thumbnails';
import { saveTenantBrandOverrides } from '@/app/offertes/[id]/menukaart-editor/actions';
import { useToast } from '@/components/Toast';

type Props = {
    initialTemplateId: string | null;
    initialOverrides: Overrides;
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export default function MenukaartStijl({ initialTemplateId, initialOverrides }: Props) {
    const showToast = useToast();
    const templates = useMemo(() => listEnabledTemplates(), []);

    const [templateId, setTemplateId] = useState<string>(initialTemplateId ?? DEFAULT_TEMPLATE_ID);
    const [accent, setAccent] = useState<string>(initialOverrides.accent ?? '');
    const [bg, setBg] = useState<string>(initialOverrides.bg ?? '');
    const [isPending, startTransition] = useTransition();

    /* Re-sync wanneer settings vers ingeladen worden (bv. na tab-return) */
    useEffect(() => {
        setTemplateId(initialTemplateId ?? DEFAULT_TEMPLATE_ID);
        setAccent(initialOverrides.accent ?? '');
        setBg(initialOverrides.bg ?? '');
    }, [initialTemplateId, initialOverrides.accent, initialOverrides.bg]);

    const activeTemplate = templates.find(t => t.id === templateId) ?? templates[0];
    const accentPreview = accent.trim() || activeTemplate.defaults.accent;

    const isDirty =
        templateId !== (initialTemplateId ?? DEFAULT_TEMPLATE_ID) ||
        accent !== (initialOverrides.accent ?? '') ||
        bg !== (initialOverrides.bg ?? '');

    const accentValid = !accent.trim() || HEX_RE.test(accent.trim());
    const bgValid = !bg.trim() || HEX_RE.test(bg.trim());
    const canSave = isDirty && accentValid && bgValid && !isPending;

    function handleSave() {
        /* Behoud bestaande overrides (brandName, eventTitle, etc.), wijzig alleen
           wat in deze UI staat. Lege string → key verwijderen, terug naar default. */
        const next: Overrides = { ...initialOverrides };
        const accentTrim = accent.trim();
        const bgTrim = bg.trim();
        if (accentTrim) next.accent = accentTrim;
        else delete next.accent;
        if (bgTrim) next.bg = bgTrim;
        else delete next.bg;

        startTransition(async () => {
            const result = await saveTenantBrandOverrides(templateId, next);
            if ('error' in result) {
                showToast('Opslaan mislukt: ' + result.error, 'error');
                return;
            }
            showToast('Menukaart-stijl opgeslagen — nieuwe offertes krijgen deze look', 'success');
        });
    }

    function handleReset() {
        setTemplateId(initialTemplateId ?? DEFAULT_TEMPLATE_ID);
        setAccent(initialOverrides.accent ?? '');
        setBg(initialOverrides.bg ?? '');
    }

    return (
        <div className="panel" style={{ marginBottom: 20 }}>
            <div className="panel-head">
                <h3>
                    <Palette size={14} className="mr-1.5" style={{ color: 'var(--brand)' }} />
                    Menukaart-stijl
                </h3>
            </div>
            <div className="panel-body">
                <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.5 }}>
                    Kies een sjabloon en je merkkleuren — deze stijl wordt automatisch toegepast op de menukaart van <strong style={{ color: 'var(--text)' }}>elke nieuwe offerte</strong>. Per offerte kun je later nog finetunen via de menukaart-editor.
                </p>

                {/* Template gallery — 10 thumbnails in een grid */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                        gap: 10,
                        marginBottom: 22,
                    }}
                    role="radiogroup"
                    aria-label="Kies menukaart-sjabloon"
                >
                    {templates.map(t => {
                        const Thumb = ThumbnailFor(t.id);
                        const isActive = t.id === templateId;
                        return (
                            <button
                                key={t.id}
                                type="button"
                                role="radio"
                                aria-checked={isActive}
                                aria-label={`Sjabloon ${t.name} — ${t.description}`}
                                onClick={() => setTemplateId(t.id)}
                                style={{
                                    background: 'var(--card-solid, var(--card))',
                                    border: isActive ? '2px solid var(--brand)' : '1px solid var(--border)',
                                    borderRadius: 'var(--radius-md, 8px)',
                                    padding: 0,
                                    overflow: 'hidden',
                                    cursor: 'pointer',
                                    position: 'relative',
                                    textAlign: 'left',
                                    color: 'var(--text)',
                                    boxShadow: isActive ? '0 0 0 1px var(--brand)55' : 'none',
                                    transition: 'transform .15s, box-shadow .15s, border-color .15s',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    minHeight: 156,
                                }}
                                onMouseEnter={e => { if (!isActive) e.currentTarget.style.transform = 'translateY(-2px)'; }}
                                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
                            >
                                {isActive && (
                                    <div
                                        style={{
                                            position: 'absolute',
                                            top: 6,
                                            right: 6,
                                            zIndex: 2,
                                            width: 20,
                                            height: 20,
                                            borderRadius: '50%',
                                            background: 'var(--brand)',
                                            color: '#fff',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                        aria-hidden
                                    >
                                        <Check size={12} strokeWidth={3} />
                                    </div>
                                )}
                                <div style={{ height: 110, overflow: 'hidden', background: '#fff' }}>
                                    <Thumb brandPrimary={accentPreview} />
                                </div>
                                <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border)' }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{t.name}</div>
                                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                                        {t.paper === 'square' ? '21×21 cm' : 'A4 staand'}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* 2 color-pickers — accent + bg */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                        gap: 16,
                        marginBottom: 16,
                    }}
                >
                    <ColorField
                        label="Brand-kleur"
                        sub="Accent / koppen / streep"
                        value={accent}
                        placeholder={activeTemplate.defaults.accent}
                        onChange={setAccent}
                        valid={accentValid}
                    />
                    <ColorField
                        label="Achtergrond"
                        sub="Papier-tint van de menukaart"
                        value={bg}
                        placeholder={activeTemplate.defaults.bg}
                        onChange={setBg}
                        valid={bgValid}
                    />
                </div>

                {/* Action bar */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: 8,
                        paddingTop: 12,
                        borderTop: '1px solid var(--border)',
                    }}
                >
                    {isDirty && (
                        <button
                            type="button"
                            onClick={handleReset}
                            disabled={isPending}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                background: 'transparent',
                                border: '1px solid var(--border)',
                                borderRadius: 8,
                                padding: '8px 12px',
                                color: 'var(--muted)',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: isPending ? 'wait' : 'pointer',
                                minHeight: 36,
                            }}
                        >
                            <RotateCcw size={12} /> Annuleren
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={!canSave}
                        className="btn btn-brand"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '8px 16px',
                            opacity: canSave ? 1 : 0.5,
                            cursor: canSave ? 'pointer' : 'not-allowed',
                            minHeight: 36,
                        }}
                    >
                        {isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Stijl opslaan
                    </button>
                </div>
            </div>
        </div>
    );
}

function ColorField({
    label,
    sub,
    value,
    placeholder,
    onChange,
    valid,
}: {
    label: string;
    sub: string;
    value: string;
    placeholder: string;
    onChange: (v: string) => void;
    valid: boolean;
}) {
    /* Native color-input verwacht altijd geldige hex; bij lege string vallen we
       terug op de placeholder zodat de swatch-preview de template-default toont. */
    const colorVal = HEX_RE.test(value.trim()) ? value.trim() : placeholder;

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{label}</label>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{sub}</div>
                </div>
                {value.trim() && (
                    <button
                        type="button"
                        onClick={() => onChange('')}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--muted)',
                            fontSize: 11,
                            cursor: 'pointer',
                            padding: 0,
                            textDecoration: 'underline',
                        }}
                    >
                        Terug naar template
                    </button>
                )}
            </div>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'stretch',
                    gap: 0,
                    border: `1px solid ${valid ? 'var(--border)' : '#ef4444'}`,
                    borderRadius: 8,
                    overflow: 'hidden',
                    background: 'var(--bg)',
                }}
            >
                <input
                    type="color"
                    value={colorVal}
                    onChange={e => onChange(e.target.value)}
                    aria-label={`${label} swatch`}
                    style={{
                        width: 44,
                        height: 36,
                        border: 'none',
                        padding: 0,
                        margin: 0,
                        background: 'transparent',
                        cursor: 'pointer',
                    }}
                />
                <input
                    type="text"
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder={placeholder + ' (template-default)'}
                    aria-label={`${label} hex`}
                    style={{
                        flex: 1,
                        border: 'none',
                        background: 'transparent',
                        padding: '0 10px',
                        fontSize: 13,
                        fontFamily: 'var(--font-mono, monospace)',
                        color: 'var(--text)',
                        minWidth: 0,
                        outline: 'none',
                    }}
                />
            </div>
            {!valid && (
                <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>
                    Gebruik #RRGGBB-formaat (bv. #FF6B00)
                </div>
            )}
        </div>
    );
}
