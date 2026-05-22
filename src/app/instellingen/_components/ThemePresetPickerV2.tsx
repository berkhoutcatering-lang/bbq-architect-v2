'use client';

import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { PRESETS, matchPresetByTokens, type ThemePreset } from '@/lib/themes';
import ThemePresetCard from './ThemePresetCard';
import ThemePreview from './ThemePreview';

interface FormShape {
    brand_background?: string;
    brand_primary?: string;
    brand_accent?: string;
    brand_card?: string;
    brand_text?: string;
    brand_secondary?: string;
    bedrijfsnaam?: string;
}

interface Props {
    form: FormShape;
    onApply: (preset: ThemePreset) => void;
}

export default function ThemePresetPickerV2({ form, onApply }: Props) {
    // Welke preset matcht de huidige saved settings? (kan undefined zijn bij custom kleuren)
    const activePreset = useMemo(
        () => matchPresetByTokens(form.brand_background, form.brand_primary),
        [form.brand_background, form.brand_primary],
    );

    // Preview start op de actieve preset, of bij de eerste preset als de gebruiker custom-colors heeft.
    const [previewPresetId, setPreviewPresetId] = useState<string>(activePreset?.id ?? PRESETS[0].id);
    const previewPreset = useMemo(
        () => PRESETS.find((p) => p.id === previewPresetId) ?? PRESETS[0],
        [previewPresetId],
    );

    const isPreviewActive = activePreset?.id === previewPreset.id;

    return (
        <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
                Klik op een thema rechts om links te zien hoe het in de app, op het klantportaal, in de offerte-PDF en mobiel oogt.
                Pas pas toe als je tevreden bent — dan kun je het optioneel doorduwen naar je sjablonen.
            </div>

            <div className="theme-picker-v2-grid">
                {/* LEFT: Live preview, sticky */}
                <div>
                    <ThemePreview preset={previewPreset} bedrijfsnaam={form.bedrijfsnaam} />
                </div>

                {/* RIGHT: 8 preset cards */}
                <div style={{ display: 'grid', gap: 12 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                        {PRESETS.map((preset) => (
                            <ThemePresetCard
                                key={preset.id}
                                preset={preset}
                                isActive={activePreset?.id === preset.id}
                                isPreviewing={previewPresetId === preset.id}
                                bedrijfsnaam={form.bedrijfsnaam}
                                onPreview={setPreviewPresetId}
                            />
                        ))}
                    </div>

                    {/* Apply CTA */}
                    <div
                        style={{
                            padding: 12,
                            borderRadius: 10,
                            background: 'color-mix(in oklch, var(--brand-primary), transparent 92%)',
                            border: '1px solid color-mix(in oklch, var(--brand-primary), transparent 75%)',
                            display: 'grid',
                            gap: 8,
                        }}
                    >
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                            {isPreviewActive ? 'Dit is je huidige huisstijl' : `Klaar voor "${previewPreset.naam}"?`}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>
                            Toepassen wijzigt je huisstijl-instellingen. Je krijgt daarna de keuze om de kleuren ook in je bestaande offertes en facturen door te zetten.
                        </div>
                        <button
                            type="button"
                            onClick={() => onApply(previewPreset)}
                            disabled={isPreviewActive}
                            className="btn btn-brand"
                            style={{ justifyContent: 'center', minHeight: 40, fontSize: 13, fontWeight: 700, opacity: isPreviewActive ? 0.55 : 1, cursor: isPreviewActive ? 'default' : 'pointer' }}
                            aria-label={isPreviewActive ? 'Dit thema is al actief' : `Pas ${previewPreset.naam} toe op huisstijl`}
                        >
                            <Sparkles size={14} aria-hidden />
                            {isPreviewActive ? 'Al actief' : `Pas ${previewPreset.naam} toe`}
                        </button>
                    </div>
                </div>
            </div>

            <div style={{ padding: 10, borderRadius: 8, background: 'rgba(196,163,90,.08)', border: '1px solid rgba(196,163,90,.2)', fontSize: 11, color: 'var(--muted)' }}>
                <strong style={{ color: 'var(--text)' }}>Belangrijk:</strong> rood/groen waarschuwingen (lage voorraad, bevestigd) blijven altijd hun betekenis houden — die veranderen niet mee met het gekozen thema.
            </div>
        </div>
    );
}
