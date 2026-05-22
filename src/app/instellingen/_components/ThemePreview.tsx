'use client';

import { useState } from 'react';
import { Calendar, ChefHat, ShoppingBag, FileText, Settings, Bell, Check } from 'lucide-react';
import type { ThemePreset } from '@/lib/themes';

type PreviewTab = 'app' | 'portaal' | 'pdf' | 'mobile';

interface Props {
    preset: ThemePreset;
    bedrijfsnaam?: string;
}

const TAB_LABELS: Record<PreviewTab, string> = {
    app: 'Sidebar + hubcard',
    portaal: 'Klantportaal',
    pdf: 'Offerte-PDF',
    mobile: 'Mobiel',
};

export default function ThemePreview({ preset, bedrijfsnaam }: Props) {
    const [tab, setTab] = useState<PreviewTab>('app');
    const { tokens } = preset;

    return (
        <div
            data-theme-preview={preset.id}
            style={{
                borderRadius: 12,
                background: 'var(--card)',
                border: '1px solid var(--border)',
                overflow: 'hidden',
                display: 'grid',
                gridTemplateRows: 'auto 1fr',
                position: 'sticky',
                top: 16,
            }}
        >
            {/* Tab-strip */}
            <div role="tablist" aria-label="Preview-modus" style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--card-solid, var(--card))', flexWrap: 'wrap' }}>
                {(Object.keys(TAB_LABELS) as PreviewTab[]).map((t) => {
                    const active = tab === t;
                    return (
                        <button
                            key={t}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => setTab(t)}
                            style={{
                                flex: '1 1 auto',
                                padding: '10px 12px',
                                background: 'transparent',
                                border: 'none',
                                borderBottom: active ? '2px solid var(--brand-primary)' : '2px solid transparent',
                                color: active ? 'var(--text)' : 'var(--muted)',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                                minHeight: 44,
                            }}
                        >
                            {TAB_LABELS[t]}
                        </button>
                    );
                })}
            </div>

            {/* Preview-canvas — toont het preset zelf via scoped tokens */}
            <div
                style={{
                    padding: 16,
                    background: 'color-mix(in oklch, var(--bg), transparent 70%)',
                    minHeight: 420,
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'center',
                }}
            >
                {tab === 'app' && <AppShellPreview tokens={tokens} bedrijfsnaam={bedrijfsnaam} />}
                {tab === 'portaal' && <PortaalPreview tokens={tokens} bedrijfsnaam={bedrijfsnaam} />}
                {tab === 'pdf' && <PdfPreview tokens={tokens} bedrijfsnaam={bedrijfsnaam} />}
                {tab === 'mobile' && <MobilePreview tokens={tokens} bedrijfsnaam={bedrijfsnaam} />}
            </div>
        </div>
    );
}

/* ─── Sub-previews ─── */

function AppShellPreview({ tokens, bedrijfsnaam }: { tokens: ThemePreset['tokens']; bedrijfsnaam?: string }) {
    const muted = `color-mix(in oklch, ${tokens.text}, transparent 55%)`;
    const border = `color-mix(in oklch, ${tokens.text}, transparent 88%)`;
    return (
        <div
            style={{
                width: '100%',
                maxWidth: 480,
                background: tokens.bg,
                color: tokens.text,
                borderRadius: 10,
                overflow: 'hidden',
                display: 'grid',
                gridTemplateColumns: '64px 1fr',
                minHeight: 380,
                fontFamily: 'system-ui, sans-serif',
            }}
        >
            {/* Sidebar rail */}
            <aside style={{ background: tokens.secondary, borderRight: `1px solid ${border}`, padding: '12px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: tokens.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: tokens.card, fontWeight: 800, fontSize: 13 }}>
                    {(bedrijfsnaam || 'BB')[0]?.toUpperCase()}
                </div>
                <div style={{ height: 1, width: '100%', background: border }} aria-hidden />
                {[Calendar, ChefHat, ShoppingBag, FileText, Settings].map((Icon, i) => (
                    <span
                        key={i}
                        style={{
                            width: 36, height: 36, borderRadius: 8,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            background: i === 1 ? `color-mix(in oklch, ${tokens.primary}, transparent 80%)` : 'transparent',
                            color: i === 1 ? tokens.primary : muted,
                        }}
                    >
                        <Icon size={16} aria-hidden />
                    </span>
                ))}
            </aside>

            {/* Main content */}
            <main style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{ fontSize: 9, color: muted, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>Menu</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: tokens.text }}>Gerechten</div>
                    </div>
                    <span style={{ width: 28, height: 28, borderRadius: 8, background: `color-mix(in oklch, ${tokens.primary}, transparent 85%)`, color: tokens.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Bell size={13} aria-hidden />
                    </span>
                </div>

                {/* Hubcard */}
                <div
                    style={{
                        padding: 12,
                        borderRadius: 10,
                        background: tokens.card,
                        border: `1px solid ${border}`,
                        display: 'grid',
                        gap: 8,
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ padding: '2px 6px', borderRadius: 4, background: tokens.primary, color: tokens.card, fontSize: 9, fontWeight: 800, letterSpacing: '.04em' }}>OFFERTE</span>
                        <span style={{ padding: '2px 6px', borderRadius: 4, border: `1px solid ${tokens.accent}`, color: tokens.accent, fontSize: 9, fontWeight: 700 }}>Concept</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: tokens.text }}>BBQ-feest Brouwerstraat 12</div>
                    <div style={{ fontSize: 11, color: muted }}>14 juni · 45 gasten · €1.847</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                        <button type="button" disabled style={{ padding: '6px 12px', borderRadius: 6, background: tokens.primary, color: tokens.card, border: 'none', fontSize: 11, fontWeight: 700, cursor: 'default' }}>
                            <Check size={11} aria-hidden style={{ verticalAlign: '-2px', marginRight: 4 }} />
                            Accepteren
                        </button>
                        <button type="button" disabled style={{ padding: '6px 12px', borderRadius: 6, background: 'transparent', color: tokens.text, border: `1px solid ${border}`, fontSize: 11, fontWeight: 600, cursor: 'default' }}>
                            Aanpassen
                        </button>
                    </div>
                </div>

                {/* Lijst items */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0, borderRadius: 8, border: `1px solid ${border}`, background: tokens.card, overflow: 'hidden' }}>
                    {['Pulled pork sandwich', 'BBQ-saus huisgemaakt', 'Coleslaw'].map((label, i, arr) => (
                        <div key={label} style={{ padding: '8px 12px', borderBottom: i < arr.length - 1 ? `1px solid ${border}` : 'none', display: 'flex', justifyContent: 'space-between', fontSize: 11, color: tokens.text }}>
                            <span>{label}</span>
                            <span style={{ color: muted }}>€{(8.5 + i * 0.95).toFixed(2)}</span>
                        </div>
                    ))}
                </div>
            </main>
        </div>
    );
}

function PortaalPreview({ tokens, bedrijfsnaam }: { tokens: ThemePreset['tokens']; bedrijfsnaam?: string }) {
    const muted = `color-mix(in oklch, ${tokens.text}, transparent 55%)`;
    const subtle = `color-mix(in oklch, ${tokens.text}, transparent 92%)`;
    return (
        <div
            style={{
                width: '100%',
                maxWidth: 360,
                minHeight: 380,
                background: `linear-gradient(180deg, ${tokens.secondary} 0%, ${tokens.bg} 100%)`,
                color: tokens.text,
                borderRadius: 12,
                padding: 18,
                fontFamily: 'system-ui, sans-serif',
            }}
        >
            {/* Brand header */}
            <div style={{ textAlign: 'center', marginBottom: 18 }}>
                <div style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 44, height: 44, borderRadius: 12, marginBottom: 8,
                    background: `linear-gradient(135deg, ${tokens.primary}22, ${tokens.primary}11)`,
                    border: `1px solid color-mix(in oklch, ${tokens.primary}, transparent 75%)`,
                    fontSize: 20,
                }}>🔥</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: tokens.text }}>{bedrijfsnaam || 'Jouw bedrijf'}</div>
            </div>

            {/* Lampion-effect main card (kopie pattern uit /q/[id]:244-251) */}
            <div style={{
                background:
                    `radial-gradient(140% 60% at 50% 0%, color-mix(in oklch, ${tokens.primary}, transparent 80%), transparent 65%), ` +
                    `radial-gradient(120% 45% at 50% 100%, color-mix(in oklch, ${tokens.primary}, transparent 90%), transparent 55%), ` +
                    subtle,
                border: `1px solid color-mix(in oklch, ${tokens.text}, transparent 92%)`,
                borderRadius: 12,
                overflow: 'hidden',
                boxShadow: `inset 0 1px 0 0 color-mix(in oklch, ${tokens.text}, transparent 88%), inset 0 0 24px 0 color-mix(in oklch, ${tokens.primary}, transparent 88%)`,
            }}>
                <div style={{ padding: '14px 16px', borderBottom: `1px solid color-mix(in oklch, ${tokens.text}, transparent 92%)`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <div style={{ fontSize: 9, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '.1em' }}>Offerte 2026-0042</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: tokens.text, marginTop: 4 }}>Jansen Familie</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: tokens.primary, lineHeight: 1 }}>€1.847</div>
                        <div style={{ fontSize: 9, color: muted, marginTop: 2 }}>incl. 9% BTW</div>
                    </div>
                </div>
                <div style={{ padding: '10px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 10 }}>
                    <div>
                        <div style={{ color: muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em' }}>Datum</div>
                        <div style={{ color: tokens.text, fontWeight: 600 }}>14 juni</div>
                    </div>
                    <div>
                        <div style={{ color: muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em' }}>Gasten</div>
                        <div style={{ color: tokens.text, fontWeight: 600 }}>45 pers.</div>
                    </div>
                </div>
            </div>

            <button type="button" disabled style={{
                marginTop: 16, width: '100%', padding: '12px 16px', borderRadius: 10,
                background: tokens.primary, color: tokens.card, border: 'none',
                fontSize: 13, fontWeight: 700, cursor: 'default',
                boxShadow: `0 8px 20px -6px color-mix(in oklch, ${tokens.primary}, transparent 50%)`,
            }}>
                Accepteer & onderteken
            </button>
        </div>
    );
}

function PdfPreview({ tokens, bedrijfsnaam }: { tokens: ThemePreset['tokens']; bedrijfsnaam?: string }) {
    // PDF gebruikt altijd witte achtergrond met brand-color accenten — onafhankelijk van dark/light mode
    return (
        <div
            style={{
                width: '100%',
                maxWidth: 320,
                aspectRatio: '210 / 297',
                background: '#ffffff',
                color: '#1a1a1a',
                borderRadius: 4,
                padding: 18,
                fontFamily: 'system-ui, sans-serif',
                fontSize: 9,
                boxShadow: '0 1px 2px rgba(0,0,0,.06), 0 12px 28px -10px rgba(0,0,0,.25)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
            }}
        >
            {/* Brand-bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `2px solid ${tokens.primary}`, paddingBottom: 6 }}>
                <div>
                    <div style={{ fontWeight: 800, fontSize: 11, color: '#1a1a1a' }}>{bedrijfsnaam || 'Jouw bedrijf'}</div>
                    <div style={{ fontSize: 7, color: '#666' }}>Catering & event services</div>
                </div>
                <div style={{ width: 28, height: 28, borderRadius: 6, background: `${tokens.primary}22`, border: `1px solid ${tokens.primary}55`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>🔥</div>
            </div>

            <div>
                <div style={{ fontSize: 7, color: '#999', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>Offerte</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: tokens.primary, lineHeight: 1.1 }}>2026-0042</div>
                <div style={{ fontSize: 8, color: '#444', marginTop: 2 }}>Jansen Familie · 14 juni 2026 · 45 gasten</div>
            </div>

            {/* Items-tabel mock */}
            <div style={{ border: '1px solid #e7e3da', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ background: `${tokens.primary}14`, padding: '5px 8px', display: 'grid', gridTemplateColumns: '1fr 40px 50px', fontSize: 7, fontWeight: 700, color: '#444', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    <span>Omschrijving</span>
                    <span style={{ textAlign: 'right' }}>Aantal</span>
                    <span style={{ textAlign: 'right' }}>Totaal</span>
                </div>
                {['Pulled pork sandwich', 'BBQ-saus huisgemaakt', 'Coleslaw'].map((label, i, arr) => (
                    <div key={label} style={{ padding: '5px 8px', display: 'grid', gridTemplateColumns: '1fr 40px 50px', fontSize: 8, borderTop: i === 0 ? 'none' : '1px solid #f1ede4' }}>
                        <span style={{ color: '#1a1a1a' }}>{label}</span>
                        <span style={{ textAlign: 'right', color: '#666' }}>45×</span>
                        <span style={{ textAlign: 'right', color: '#1a1a1a', fontWeight: 600 }}>€{((i + 1) * 280).toFixed(2)}</span>
                    </div>
                ))}
            </div>

            <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', borderTop: `2px solid ${tokens.primary}`, paddingTop: 6 }}>
                <span style={{ fontWeight: 700, color: '#444' }}>Totaal incl. BTW</span>
                <span style={{ fontWeight: 800, color: tokens.primary, fontSize: 11 }}>€1.847,00</span>
            </div>
        </div>
    );
}

function MobilePreview({ tokens, bedrijfsnaam }: { tokens: ThemePreset['tokens']; bedrijfsnaam?: string }) {
    const muted = `color-mix(in oklch, ${tokens.text}, transparent 55%)`;
    const border = `color-mix(in oklch, ${tokens.text}, transparent 88%)`;
    return (
        <div
            style={{
                width: 220,
                aspectRatio: '9 / 16',
                background: tokens.bg,
                color: tokens.text,
                borderRadius: 18,
                border: `8px solid ${tokens.secondary}`,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                fontFamily: 'system-ui, sans-serif',
                boxShadow: '0 16px 28px -12px rgba(0,0,0,.35)',
            }}
        >
            {/* Notch */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 0', background: tokens.secondary }}>
                <span style={{ width: 40, height: 4, borderRadius: 2, background: tokens.card }} aria-hidden />
            </div>

            {/* Header */}
            <div style={{ padding: '8px 12px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 22, height: 22, borderRadius: 6, background: tokens.primary, color: tokens.card, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11 }}>
                        {(bedrijfsnaam || 'BB')[0]?.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: tokens.text }}>{bedrijfsnaam || 'Jouw bedrijf'}</span>
                </div>
                <span style={{ width: 22, height: 22, borderRadius: 6, background: `color-mix(in oklch, ${tokens.primary}, transparent 85%)`, color: tokens.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Bell size={11} aria-hidden />
                </span>
            </div>

            {/* Body */}
            <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '.08em' }}>Vandaag</div>
                <div style={{ padding: 10, borderRadius: 8, background: tokens.card, border: `1px solid ${border}`, display: 'grid', gap: 4 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: tokens.text }}>BBQ Brouwerstraat 12</div>
                    <div style={{ fontSize: 9, color: muted }}>45 gasten · €1.847</div>
                    <span style={{ padding: '2px 6px', borderRadius: 4, background: tokens.primary, color: tokens.card, fontSize: 8, fontWeight: 800, alignSelf: 'flex-start' }}>OFFERTE</span>
                </div>
                <div style={{ padding: 10, borderRadius: 8, background: tokens.card, border: `1px solid ${border}`, display: 'grid', gap: 4 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: tokens.text }}>De Boer Feest</div>
                    <div style={{ fontSize: 9, color: muted }}>120 gasten · €4.250</div>
                    <span style={{ padding: '2px 6px', borderRadius: 4, border: `1px solid ${tokens.accent}`, color: tokens.accent, fontSize: 8, fontWeight: 700, alignSelf: 'flex-start' }}>Concept</span>
                </div>
            </div>

            {/* Bottom tab */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderTop: `1px solid ${border}`, background: tokens.secondary }}>
                {[Calendar, ChefHat, ShoppingBag, Settings].map((Icon, i) => (
                    <button key={i} type="button" disabled style={{
                        padding: '8px 0', background: 'transparent', border: 'none', cursor: 'default',
                        color: i === 0 ? tokens.primary : muted,
                        display: 'inline-flex', justifyContent: 'center',
                    }}>
                        <Icon size={14} aria-hidden />
                    </button>
                ))}
            </div>
        </div>
    );
}
