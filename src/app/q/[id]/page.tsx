/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect } from 'react';
import { Leaf } from 'lucide-react';
import SignaturePad from '@/components/SignaturePad';
import { useToast } from '@/components/Toast';
import { formatCarbon, SCORE_LABELS } from '@/lib/carbonFootprint';
import QuoteMenukaartSection from '@/components/menukaart/QuoteMenukaartSection';

function formatEuro(n: number) { return '€' + n.toFixed(2).replace('.', ','); }

function formatDate(d: string) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
}

const STATUS_STEPS = [
    { key: 'verzonden', label: 'Offerte ontvangen', icon: '📋' },
    { key: 'geaccepteerd', label: 'Geaccepteerd', icon: '✅' },
    { key: 'betaald', label: 'Betaald', icon: '💰' },
    { key: 'confirmed', label: 'Event bevestigd', icon: '🔥' },
];

function getStepIndex(status: string) {
    if (status === 'betaald') return 2;
    if (status === 'geaccepteerd' || status === 'akkoord' || status === 'goedgekeurd' || status === 'definitief') return 1;
    return 0;
}

/**
 * Schat perceptuele lightness uit een hex-string (sRGB → CIE Y → L*).
 * Gebruikt om light vs dark portal-themes te routeren voor overlay-direction.
 */
function perceivedHexLightness(hex: string): number {
    const h = hex.replace('#', '');
    if (h.length !== 6) return 0.2;
    const num = parseInt(h, 16);
    const r = ((num >> 16) & 0xff) / 255;
    const g = ((num >> 8) & 0xff) / 255;
    const b = (num & 0xff) / 255;
    const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const Y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return Math.cbrt(Y);
}

export default function QuotePage({ params }: { params: Promise<{ id: string }> }) {
    const showToast = useToast();
    const [offer, setOffer] = useState<any>(null);
    const [settings, setSettings] = useState<any>(null);
    const [carbon, setCarbon] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [accepted, setAccepted] = useState(false);

    // Signature state
    const [signStep, setSignStep] = useState(false);
    const [signerName, setSignerName] = useState('');
    const [signatureData, setSignatureData] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(function () {
        async function load() {
            const { id: offerId } = await params;
            if (!offerId) { setError('Offerte niet gevonden.'); setLoading(false); return; }

            const res = await fetch('/api/public-offerte/' + encodeURIComponent(offerId), { cache: 'no-store' });
            const result = await res.json();
            if (!res.ok || !result.offer) {
                setError('Offerte niet gevonden of verlopen.');
                setLoading(false);
                return;
            }
            const data = result.offer;
            setOffer(data);
            setSettings(result.settings ?? null);
            setCarbon(result.carbon ?? null);
            if (['geaccepteerd', 'akkoord', 'betaald', 'goedgekeurd', 'definitief'].includes(data.status)) {
                setAccepted(true);
            }

            setLoading(false);
        }
        load();
    }, [params]);

    /* Client-side signer-name validatie — server doet dezelfde check
       via Zod (Bundel 1: hardening klant-facing portal). Voorkomt
       hopeloze server-roundtrip bij triviale fouten zoals lege naam. */
    function validateSignerName(name: string): string | null {
        const trimmed = name.trim();
        if (trimmed.length < 2) return 'Naam moet minimaal 2 tekens zijn';
        if (trimmed.length > 100) return 'Naam te lang (max 100 tekens)';
        if (/[<>{}]|javascript:|data:|on\w+=/i.test(trimmed)) {
            return 'Naam bevat ongeldige tekens';
        }
        return null;
    }

    async function handleAccept() {
        if (!offer || !signatureData) return;

        const nameError = validateSignerName(signerName);
        if (nameError) {
            showToast(nameError, 'error');
            return;
        }

        setSubmitting(true);

        try {
            const res = await fetch('/api/accept-offerte', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    offerteId: offer.id,
                    publicToken: offer.public_token,
                    signedBy: signerName.trim(),
                    signatureUrl: signatureData,
                }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setAccepted(true);
                setSignStep(false);
            } else if (data.fields) {
                /* Server-side Zod-validation faalde — meest specifieke
                   field-error tonen i.p.v. generieke "Onbekende fout". */
                const firstField = Object.entries(data.fields)[0] as [string, string[] | undefined] | undefined;
                const msg = firstField?.[1]?.[0] || data.error || 'Onbekende fout';
                showToast(msg, 'error');
            } else {
                showToast('Fout bij accepteren: ' + (data.error || 'Onbekende fout'), 'error');
            }
        } catch (e: any) {
            showToast('Fout: ' + (e.message || 'Netwerk fout'), 'error');
        }
        setSubmitting(false);
    }

    /* Detecteer orientation-change tijdens signing — canvas verliest
       stroke-data omdat het opnieuw initialiseert met nieuwe afmetingen.
       Beter waarschuwen + reset dan klant laten denken dat handtekening
       opgeslagen is. Volledige stroke-preservation vergt SignaturePad-
       refactor (apart issue). */
    useEffect(function () {
        if (!signStep) return;
        function onOrient() {
            if (signatureData) {
                showToast('Schermrotatie reset de handtekening — teken opnieuw.', 'info');
                setSignatureData(null);
            }
        }
        window.addEventListener('orientationchange', onOrient);
        return function () { window.removeEventListener('orientationchange', onOrient); };
    }, [signStep, signatureData, showToast]);

    // --- Loading ---
    if (loading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-darker)' }}>
                <div style={{ textAlign: 'center', padding: 20 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(158,120,28,.15)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                        <span style={{ fontSize: 24 }}>🔥</span>
                    </div>
                    <p style={{ color: 'var(--zinc)', fontSize: 14 }}>Offerte laden...</p>
                    {/* Hub 2 P1 — no-JS fallback. Initial HTML toont deze noscript-block
                       voor klanten die JS hebben uitgeschakeld of in een webview zonder
                       JS-support openen. Volledig progressive-enhancement vergt RSC
                       refactor (P2 follow-up). */}
                    <noscript>
                        <div style={{ marginTop: 20, padding: 16, background: 'rgba(255,255,255,.05)', borderRadius: 8, maxWidth: 360, textAlign: 'left', color: 'var(--text)' }}>
                            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>JavaScript vereist</h2>
                            <p style={{ fontSize: 13, color: 'var(--zinc)', lineHeight: 1.5, margin: 0 }}>
                                Deze offerte-pagina werkt met digitale handtekening en iDEAL-betaling — daarvoor is JavaScript nodig. Open de link in een moderne browser (Chrome, Safari, Firefox, Edge) en zet JavaScript aan.
                            </p>
                            <p style={{ fontSize: 12, color: 'var(--zinc)', marginTop: 12, marginBottom: 0 }}>
                                Lukt het niet? Vraag je caterier om een PDF-versie van de offerte.
                            </p>
                        </div>
                    </noscript>
                </div>
            </div>
        );
    }

    // --- Error ---
    if (error || !offer) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-darker)', padding: 20 }}>
                <div style={{ textAlign: 'center', maxWidth: 400 }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>😕</div>
                    <h2 style={{ color: 'var(--text)', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Offerte niet gevonden</h2>
                    <p style={{ color: 'var(--zinc)', fontSize: 14 }}>{error || 'Deze offerte bestaat niet of is verlopen.'}</p>
                </div>
            </div>
        );
    }

    // Parse items
    let items = offer.items;
    if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }
    if (!Array.isArray(items)) items = [];

    // Parse menu selectie
    let menuItems: string[] = [];
    const menuSel = offer.menu_selectie;
    if (Array.isArray(menuSel)) {
        menuSel.forEach(function (sel: any) {
            const naam = sel.gerecht_naam || sel.naam || '';
            if (naam) menuItems.push(naam);
        });
    } else if (menuSel && typeof menuSel === 'object') {
        Object.values(menuSel).forEach(function (arr: any) {
            if (Array.isArray(arr)) {
                arr.forEach(function (sel: any, idx: number) {
                    if (idx % 2 === 0) {
                        const naam = typeof sel === 'string' ? sel : (sel.gerecht_naam || sel.naam || '');
                        if (naam) menuItems.push(naam);
                    }
                });
            }
        });
    }

    // Calculate totals
    const defaultBtw = 9;
    let subtotal = 0;
    items.forEach(function (item: any) { subtotal += (item.qty || 0) * (item.prijs || 0); });

    // Vaste kosten
    let vasteKostenTotal = 0;
    const vasteKosten = offer.vaste_kosten;
    if (Array.isArray(vasteKosten)) {
        vasteKosten.forEach(function (k: any) { vasteKostenTotal += parseFloat(k.bedrag) || 0; });
    }

    const korting = offer.korting || 0;
    const nettoSubtotal = subtotal + vasteKostenTotal - korting;
    const btwBedrag = nettoSubtotal * (defaultBtw / 100);
    const totaal = nettoSubtotal + btwBedrag;

    const companyName = settings?.bedrijfsnaam || 'BBQ Architect';
    const brandColor = (settings as any)?.brand_primary || 'var(--color-accent-gold)';
    const brandLogoUrl = (settings as any)?.logo_url || null;
    const currentStep = getStepIndex(offer.status);

    // ── White-label propagation: portal honors the caterer's chosen theme ──
    // ThemeProvider draait niet op deze publieke route, dus injecteren we
    // de brand-tokens hier als CSS-vars op de outer div. Alle nested code
    // gebruikt `var(--text)` / `var(--card)` / `var(--color-bg-darker)` etc.
    // — die worden door deze inline-style overschreven per tenant.
    const portalBg = (settings as any)?.brand_background || '#0a0a0c';
    const portalCard = (settings as any)?.brand_card || '#1e1e22';
    const portalText = (settings as any)?.brand_text || '#f8f8f8';
    // Detecteer light/dark voor hardcoded `rgba(0/255,…)` overlays
    const isLightPortal = perceivedHexLightness(portalBg) > 0.5;
    // Line/inset surfaces — direction-aware voor de paar overlays die nog inline-style zijn
    const portalLine = isLightPortal
        ? 'color-mix(in oklch, ' + portalText + ', transparent 92%)'
        : 'rgba(255,255,255,0.06)';
    const portalInset = isLightPortal
        ? 'color-mix(in oklch, ' + portalBg + ', black 4%)'
        : 'rgba(0,0,0,0.15)';
    const portalTextColor = portalText;
    const portalSubtleText = isLightPortal
        ? 'color-mix(in oklch, ' + portalText + ' 75%, ' + portalBg + ')'
        : '#e5e7eb';

    // Sticky CTA only appears when offerte not yet accepted AND user has not opened the signature step
    const showStickyCTA = !accepted && !signStep;

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(180deg, ' + portalBg + ' 0%, color-mix(in oklch, ' + portalBg + ', black 8%) 100%)',
            color: portalTextColor,
            fontFamily: "'DM Sans', system-ui, sans-serif",
            padding: 'clamp(16px, 4vw, 28px) var(--space-mobile-edge) calc(' + (showStickyCTA ? 120 : 60) + 'px + env(safe-area-inset-bottom, 0px))',
            // Override CSS-vars zodat geneste code (`var(--text)` etc.) zich aanpast aan de cateraar's theme
            ['--bg' as string]: portalBg,
            ['--text' as string]: portalText,
            ['--card' as string]: portalCard,
            ['--color-bg-darker' as string]: 'color-mix(in oklch, ' + portalBg + ', black 12%)',
            ['--color-bg-deep' as string]: 'color-mix(in oklch, ' + portalBg + ', black 5%)',
            ['--color-text-muted' as string]: portalSubtleText,
            ['--muted' as string]: 'color-mix(in oklch, ' + portalText + ' 55%, ' + portalBg + ')',
            ['--zinc' as string]: 'color-mix(in oklch, ' + portalText + ' 50%, ' + portalBg + ')',
            ['--brand' as string]: brandColor,
            ['--brand-background' as string]: portalBg,
        } as React.CSSProperties}>
            <div style={{ maxWidth: 720, margin: '0 auto' }}>

                {/* Company header */}
                <div style={{ textAlign: 'center', marginBottom: 32, paddingTop: 16 }}>
                    <div style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg, ' + brandColor + '22, ' + brandColor + '11)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, border: '1px solid ' + brandColor + '25', overflow: 'hidden' }}>
                        {brandLogoUrl ? (
                            <img src={brandLogoUrl} alt={companyName} style={{ width: 40, height: 40, objectFit: 'contain' }} />
                        ) : (
                            <span style={{ fontSize: 28 }}>🔥</span>
                        )}
                    </div>
                    <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>{companyName}</h2>
                    {settings?.ondertitel && <p style={{ fontSize: 12, color: 'var(--zinc)', margin: 0 }}>{settings.ondertitel}</p>}
                </div>

                {/* Main card — lampion-effect met klant's brand-kleur */}
                <div style={{
                    background: 'radial-gradient(140% 60% at 50% 0%, ' + brandColor + '1f, transparent 65%), radial-gradient(120% 45% at 50% 100%, ' + brandColor + '12, transparent 55%), ' + portalCard,
                    backdropFilter: 'blur(20px)',
                    border: '1px solid ' + portalLine,
                    borderRadius: 'clamp(14px, 3vw, 20px)',
                    overflow: 'hidden',
                    boxShadow: isLightPortal
                        ? 'inset 0 1px 0 0 rgba(255,255,255,.4), inset 0 0 32px 0 ' + brandColor + '0e, 0 1px 2px rgba(0,0,0,.06), 0 12px 32px -12px rgba(0,0,0,.18)'
                        : 'inset 0 1px 0 0 rgba(255,255,255,.08), inset 0 0 32px 0 ' + brandColor + '14, 0 1px 2px rgba(0,0,0,.2), 0 16px 40px -12px rgba(0,0,0,.5)',
                }}>

                    {/* Header section */}
                    <div style={{ padding: 'clamp(20px, 5vw, 28px) clamp(18px, 4.5vw, 28px) clamp(16px, 4vw, 20px)', borderBottom: '1px solid ' + portalLine }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--zinc)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Offerte {offer.nummer}</div>
                                <h1 style={{ fontSize: 'clamp(20px, 5.5vw, 24px)', fontWeight: 800, color: 'var(--text)', margin: '0 0 6px', lineHeight: 1.2 }}>
                                    {offer.client_naam || 'Klant'}
                                </h1>
                                {offer.client_adres && <p style={{ color: 'var(--zinc)', fontSize: 13, margin: 0 }}>{offer.client_adres}</p>}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 'clamp(22px, 6.5vw, 28px)', fontWeight: 800, color: brandColor, lineHeight: 1 }}>{formatEuro(totaal)}</div>
                                <div style={{ fontSize: 12, color: 'var(--zinc)', marginTop: 4 }}>Inclusief {defaultBtw}% BTW</div>
                            </div>
                        </div>
                    </div>

                    {/* Meta info — 2-cols op phone (grids van 2x2), auto-fit op breder scherm */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 1, background: portalLine }}>
                        {[
                            { label: 'Datum', value: formatDate(offer.datum) },
                            { label: 'Gasten', value: (offer.aantal_gasten || '—') + ' personen' },
                            { label: 'Geldig tot', value: formatDate(offer.geldig_tot) },
                            { label: 'Prijs p.p.', value: offer.aantal_gasten ? formatEuro(totaal / offer.aantal_gasten) : '—' },
                        ].map(function (m) {
                            return (
                                <div key={m.label} style={{ padding: '14px clamp(14px, 4vw, 28px)', background: portalInset }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{m.label}</div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{m.value}</div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Items */}
                    {items.length > 0 && (
                        <div style={{ padding: 'clamp(20px, 5vw, 24px) clamp(18px, 4.5vw, 28px)', borderTop: '1px solid ' + portalLine }}>
                            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--zinc)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Overzicht</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                                {items.map(function (item: any, i: number) {
                                    const lineTotal = (item.qty || 0) * (item.prijs || 0);
                                    return (
                                        <div key={i} style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            padding: '12px 0', borderBottom: i < items.length - 1 ? '1px solid ' + portalLine : 'none',
                                        }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{item.omschrijving || 'Item'}</div>
                                                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{item.qty || 0} x {formatEuro(item.prijs || 0)}</div>
                                            </div>
                                            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{formatEuro(lineTotal)}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Menu items */}
                    {menuItems.length > 0 && (
                        <div style={{ padding: '0 clamp(18px, 4.5vw, 28px) clamp(20px, 5vw, 24px)' }}>
                            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--zinc)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Menu</h3>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {menuItems.map(function (naam, i) {
                                    return (
                                        <span key={i} style={{
                                            padding: '6px 14px', borderRadius: 99,
                                            background: 'rgba(158,120,28,.08)', border: '1px solid rgba(158,120,28,.15)',
                                            color: brandColor, fontSize: 12, fontWeight: 600,
                                        }}>{naam}</span>
                                    );
                                })}
                            </div>

                            {/* Eco-score — 2026 ESG-trend. Toon alleen als server-side
                                de carbon-data heeft kunnen berekenen (matched_count > 0). */}
                            {carbon && carbon.matched_count > 0 && (() => {
                                const meta = (SCORE_LABELS as any)[carbon.score] || { label: '—', color: '#6b7280' };
                                return (
                                    <div style={{
                                        marginTop: 14, padding: '10px 14px', borderRadius: 10,
                                        background: meta.color + '12',
                                        border: '1px solid ' + meta.color + '35',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div style={{
                                                width: 32, height: 32, borderRadius: 8,
                                                background: meta.color + '25', color: meta.color,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 14, fontWeight: 800,
                                            }}>{carbon.score}</div>
                                            <div>
                                                <div style={{ fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--zinc)', fontWeight: 700 }}>
                                                    Duurzaamheid
                                                </div>
                                                <div style={{ fontSize: 13, fontWeight: 700, color: meta.color, display: 'flex', alignItems: 'center', gap: 5 }}>
                                                    <Leaf size={12} /> {meta.label}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: 10, color: 'var(--zinc)' }}>Per portie</div>
                                            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                                                {formatCarbon(carbon.total_g_per_pp)}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {/* Totals — full-width op phone, max 320 op desktop right-aligned */}
                    <div style={{ padding: 'clamp(16px, 4vw, 20px) clamp(18px, 4.5vw, 28px)', background: portalInset, borderTop: '1px solid ' + portalLine }}>
                        <div className="qportal-totals" style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 320, marginLeft: 'auto' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--muted)' }}>
                                <span>Subtotaal</span>
                                <span>{formatEuro(subtotal)}</span>
                            </div>
                            {vasteKostenTotal > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--muted)' }}>
                                    <span>Vaste kosten</span>
                                    <span>{formatEuro(vasteKostenTotal)}</span>
                                </div>
                            )}
                            {korting > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--green)' }}>
                                    <span>Korting</span>
                                    <span>-{formatEuro(korting)}</span>
                                </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--muted)' }}>
                                <span>BTW {defaultBtw}%</span>
                                <span>{formatEuro(btwBedrag)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17, fontWeight: 800, color: 'var(--text)', paddingTop: 8, borderTop: '1px solid ' + portalLine, marginTop: 4 }}>
                                <span>Totaal</span>
                                <span style={{ color: brandColor }}>{formatEuro(totaal)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Notes */}
                    {offer.notitie && (
                        <div style={{ padding: 'clamp(16px, 4vw, 20px) clamp(18px, 4.5vw, 28px)', borderTop: '1px solid ' + portalLine }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Opmerkingen</div>
                            <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{offer.notitie}</p>
                        </div>
                    )}

                    {/* Menukaart — gerenderd via cascade (template default → tenant brand → offerte custom) */}
                    <div style={{ borderTop: '1px solid ' + portalLine }}>
                        <QuoteMenukaartSection
                            templateId={offer.menukaart_template_id ?? settings?.menukaart_template_id}
                            brandOverrides={settings?.menukaart_overrides ?? {}}
                            customOverrides={offer.menukaart_overrides ?? {}}
                            logoUrl={brandLogoUrl}
                        />
                    </div>

                    {/* Status tracker (shown after acceptance) — compactere circles op phone zodat 4-stappen passen op 375px */}
                    {accepted && (
                        <div className="qportal-status" style={{ padding: 'clamp(20px, 5vw, 24px) clamp(14px, 4vw, 28px)', borderTop: '1px solid ' + portalLine }}>
                            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--zinc)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Voortgang</h3>
                            <div style={{ display: 'flex', gap: 0 }}>
                                {STATUS_STEPS.map(function (step, i) {
                                    const done = i <= currentStep;
                                    const isCurrent = i === currentStep;
                                    return (
                                        <div key={step.key} style={{ flex: 1, textAlign: 'center', position: 'relative' }}>
                                            {/* Connector line */}
                                            {i > 0 && (
                                                <div style={{
                                                    position: 'absolute', top: 16, left: 0, right: '50%',
                                                    height: 2, background: done ? 'var(--amber)' : portalLine,
                                                }} />
                                            )}
                                            {i < STATUS_STEPS.length - 1 && (
                                                <div style={{
                                                    position: 'absolute', top: 16, left: '50%', right: 0,
                                                    height: 2, background: i < currentStep ? 'var(--amber)' : portalLine,
                                                }} />
                                            )}
                                            {/* Circle */}
                                            <div style={{
                                                width: 34, height: 34, borderRadius: '50%', margin: '0 auto 8px',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                background: done ? 'color-mix(in oklch, ' + brandColor + ', transparent 80%)' : portalLine,
                                                border: isCurrent ? '2px solid var(--amber)' : '1px solid ' + portalLine,
                                                fontSize: 16, position: 'relative', zIndex: 1,
                                            }}>
                                                {step.icon}
                                            </div>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: done ? 'var(--text)' : 'var(--color-text-muted)', lineHeight: 1.3 }}>
                                                {step.label}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Signed info */}
                            {offer.signed_by && (
                                <div style={{ marginTop: 20, padding: '12px 16px', borderRadius: 10, background: 'rgba(16,185,129,.06)', border: '1px solid rgba(16,185,129,.12)', fontSize: 12, color: 'var(--muted)' }}>
                                    Ondertekend door <strong style={{ color: 'var(--emerald)' }}>{offer.signed_by}</strong>
                                    {offer.signed_at && <span> op {formatDate(offer.signed_at)}</span>}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Signature & Accept */}
                    {!accepted && !signStep && (
                        <div style={{ padding: 'clamp(24px, 6vw, 32px) clamp(18px, 4.5vw, 28px)', borderTop: '1px solid ' + portalLine, textAlign: 'center' }}>
                            <div style={{ padding: 24, background: 'rgba(158,120,28,.06)', borderRadius: 16, border: '1px solid rgba(158,120,28,.12)' }}>
                                <h3 style={{ color: 'var(--text)', fontSize: 20, fontWeight: 800, margin: '0 0 8px' }}>Akkoord met deze offerte?</h3>
                                <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20, maxWidth: 400, margin: '0 auto 20px' }}>
                                    Bevestig met een digitale handtekening om de datum vast te leggen.
                                </p>
                                <button
                                    onClick={function () { setSignStep(true); }}
                                    style={{
                                        background: brandColor, color: 'var(--brand-background)', border: 'none',
                                        minHeight: 48, padding: '14px 36px', borderRadius: 99, fontSize: 15, fontWeight: 800,
                                        cursor: 'pointer', boxShadow: '0 4px 20px rgba(158,120,28,0.3)',
                                        transition: 'transform 0.15s, box-shadow 0.15s',
                                        touchAction: 'manipulation',
                                    }}
                                    onMouseOver={function (e) { (e.target as HTMLButtonElement).style.transform = 'translateY(-2px)'; }}
                                    onMouseOut={function (e) { (e.target as HTMLButtonElement).style.transform = 'translateY(0)'; }}
                                >
                                    Offerte accepteren
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Signature step */}
                    {!accepted && signStep && (
                        <div style={{ padding: 'clamp(20px, 5vw, 28px)', borderTop: '1px solid ' + portalLine }}>
                            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Digitale handtekening</h3>
                            <p style={{ color: 'var(--zinc)', fontSize: 13, marginBottom: 20 }}>
                                Vul uw naam in en plaats een handtekening om de offerte te bevestigen.
                            </p>

                            <div style={{ marginBottom: 16 }}>
                                <label htmlFor="qportal-signer-name" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>Naam ondertekenaar</label>
                                <input
                                    id="qportal-signer-name"
                                    type="text"
                                    inputMode="text"
                                    autoComplete="name"
                                    autoCapitalize="words"
                                    value={signerName}
                                    onChange={function (e) { setSignerName(e.target.value); }}
                                    placeholder="Uw volledige naam"
                                    style={{
                                        width: '100%', minHeight: 44, padding: '12px 14px', borderRadius: 10,
                                        background: portalInset, border: '1px solid ' + portalLine,
                                        color: 'var(--text)', fontSize: 16, outline: 'none', // 16px voorkomt iOS auto-zoom op focus
                                        boxSizing: 'border-box',
                                    }}
                                />
                            </div>

                            <div style={{ marginBottom: 20 }}>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>Handtekening</label>
                                <SignaturePad onSignature={setSignatureData} />
                            </div>

                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                <button
                                    onClick={function () { setSignStep(false); }}
                                    style={{
                                        minHeight: 44, padding: '12px 24px', borderRadius: 10,
                                        background: portalLine, border: '1px solid ' + portalLine,
                                        color: 'var(--muted)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                        touchAction: 'manipulation',
                                    }}
                                >
                                    Annuleren
                                </button>
                                <button
                                    onClick={handleAccept}
                                    disabled={submitting || !signatureData || !signerName.trim()}
                                    style={{
                                        flex: 1, minHeight: 48, padding: '12px 24px', borderRadius: 10,
                                        background: signatureData && signerName.trim() ? 'var(--amber)' : 'rgba(158,120,28,.3)',
                                        color: signatureData && signerName.trim() ? '#000' : 'rgba(0,0,0,.5)',
                                        border: 'none', fontSize: 15, fontWeight: 800, cursor: signatureData && signerName.trim() ? 'pointer' : 'not-allowed',
                                        opacity: submitting ? 0.6 : 1,
                                        touchAction: 'manipulation',
                                    }}
                                >
                                    {submitting ? 'Verwerken...' : 'Bevestigen en ondertekenen'}
                                </button>
                            </div>

                            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 12, lineHeight: 1.5 }}>
                                Door te ondertekenen gaat u akkoord met de voorwaarden in deze offerte.
                                {settings?.betaalvoorwaarden && ' ' + settings.betaalvoorwaarden}
                            </p>
                        </div>
                    )}

                    {/* Post-acceptance */}
                    {accepted && !signStep && (
                        <div style={{ padding: 'clamp(20px, 5vw, 28px)', borderTop: '1px solid ' + portalLine, textAlign: 'center' }}>
                            <div style={{ padding: 24, background: 'rgba(16,185,129,.06)', borderRadius: 16, border: '1px solid rgba(16,185,129,.12)' }}>
                                <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
                                <h3 style={{ color: 'var(--emerald)', fontSize: 20, fontWeight: 800, margin: '0 0 8px' }}>Offerte geaccepteerd!</h3>
                                <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0, maxWidth: 380, marginLeft: 'auto', marginRight: 'auto' }}>
                                    Wij gaan direct aan de slag. U ontvangt een bevestiging per e-mail.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Company footer */}
                <div style={{ textAlign: 'center', marginTop: 32, color: 'var(--color-text-muted)', fontSize: 12 }}>
                    {settings?.adres && <p style={{ margin: '0 0 4px' }}>{settings.adres}</p>}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
                        {settings?.telefoon && <span>{settings.telefoon}</span>}
                        {settings?.email && <span>{settings.email}</span>}
                        {settings?.website && <span>{settings.website}</span>}
                    </div>
                    <p style={{ marginTop: 16, opacity: 0.6 }}>Powered by <strong>BBQ Architect</strong></p>
                </div>
            </div>

            {/* Sticky bottom CTA — phone-only, geen BottomNav op publieke /q/[id] dus zit direct aan onderkant met safe-area */}
            {showStickyCTA && (
                <div className="qportal-sticky-cta">
                    <button
                        onClick={function () { setSignStep(true); }}
                        style={{
                            width: '100%',
                            minHeight: 52,
                            padding: '14px 24px',
                            borderRadius: 12,
                            background: brandColor,
                            color: 'var(--brand-background, #000)',
                            border: 'none',
                            fontSize: 16,
                            fontWeight: 800,
                            cursor: 'pointer',
                            boxShadow: '0 6px 20px rgba(0,0,0,.35)',
                            touchAction: 'manipulation',
                        }}
                    >
                        Offerte accepteren — {formatEuro(totaal)}
                    </button>
                </div>
            )}

            <style jsx>{`
                .qportal-sticky-cta {
                    display: none;
                }
                @media (max-width: 767px) {
                    .qportal-sticky-cta {
                        display: block;
                        position: fixed;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        padding: 12px var(--space-mobile-edge) calc(12px + env(safe-area-inset-bottom, 0px));
                        background: linear-gradient(180deg, color-mix(in oklch, var(--bg), transparent 100%) 0%, color-mix(in oklch, var(--bg), transparent 10%) 30%, color-mix(in oklch, var(--bg), transparent 2%) 100%);
                        backdrop-filter: blur(8px);
                        z-index: 40;
                    }
                    .qportal-totals {
                        max-width: none !important;
                        margin-left: 0 !important;
                    }
                }
            `}</style>
        </div>
    );
}
