/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect } from 'react';
import { supabaseAnon } from '@/lib/supabase';
import SignaturePad from '@/components/SignaturePad';

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

export default function QuotePage({ params }: { params: Promise<{ id: string }> }) {
    const [offer, setOffer] = useState<any>(null);
    const [settings, setSettings] = useState<any>(null);
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
            if (!offerId || !supabaseAnon) { setError('Offerte niet gevonden.'); setLoading(false); return; }

            const { data, error: fetchErr } = await supabaseAnon.from('offertes').select('*').eq('id', offerId).single();
            if (fetchErr || !data) {
                setError('Offerte niet gevonden of verlopen.');
                setLoading(false);
                return;
            }
            setOffer(data);
            if (['geaccepteerd', 'akkoord', 'betaald', 'goedgekeurd', 'definitief'].includes(data.status)) {
                setAccepted(true);
            }

            // Fetch company settings for this org
            if (data.organization_id) {
                const { data: s } = await supabaseAnon.from('settings').select('bedrijfsnaam, ondertitel, email, telefoon, adres, website, betaalvoorwaarden, logo_url, brand_primary').eq('organization_id', data.organization_id).single();
                if (s) setSettings(s);
            }

            setLoading(false);
        }
        load();
    }, [params]);

    async function handleAccept() {
        if (!offer || !signatureData || !signerName.trim()) return;
        setSubmitting(true);

        try {
            const res = await fetch('/api/accept-offerte', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    offerteId: offer.id,
                    signedBy: signerName.trim(),
                    signatureUrl: signatureData,
                }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setAccepted(true);
                setSignStep(false);
            } else {
                alert('Fout bij accepteren: ' + (data.error || 'Onbekende fout'));
            }
        } catch (e: any) {
            alert('Fout: ' + (e.message || 'Netwerk fout'));
        }
        setSubmitting(false);
    }

    // --- Loading ---
    if (loading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(158,120,28,.15)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                        <span style={{ fontSize: 24 }}>🔥</span>
                    </div>
                    <p style={{ color: '#737373', fontSize: 14 }}>Offerte laden...</p>
                </div>
            </div>
        );
    }

    // --- Error ---
    if (error || !offer) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', padding: 20 }}>
                <div style={{ textAlign: 'center', maxWidth: 400 }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>😕</div>
                    <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Offerte niet gevonden</h2>
                    <p style={{ color: '#737373', fontSize: 14 }}>{error || 'Deze offerte bestaat niet of is verlopen.'}</p>
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
    const brandColor = (settings as any)?.brand_primary || '#c4a35a';
    const brandLogoUrl = (settings as any)?.logo_url || null;
    const currentStep = getStepIndex(offer.status);

    return (
        <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0a0a0a 0%, #111 100%)', color: '#e5e7eb', fontFamily: "'DM Sans', system-ui, sans-serif", padding: '24px 16px 60px' }}>
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
                    <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>{companyName}</h2>
                    {settings?.ondertitel && <p style={{ fontSize: 12, color: '#737373', margin: 0 }}>{settings.ondertitel}</p>}
                </div>

                {/* Main card */}
                <div style={{ background: 'rgba(255,255,255,0.025)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, overflow: 'hidden' }}>

                    {/* Header section */}
                    <div style={{ padding: '28px 28px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#737373', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Offerte {offer.nummer}</div>
                                <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', margin: '0 0 6px', lineHeight: 1.2 }}>
                                    {offer.client_naam || 'Klant'}
                                </h1>
                                {offer.client_adres && <p style={{ color: '#737373', fontSize: 13, margin: 0 }}>{offer.client_adres}</p>}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 28, fontWeight: 800, color: brandColor, lineHeight: 1 }}>{formatEuro(totaal)}</div>
                                <div style={{ fontSize: 12, color: '#737373', marginTop: 4 }}>Inclusief {defaultBtw}% BTW</div>
                            </div>
                        </div>
                    </div>

                    {/* Meta info */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 1, background: 'rgba(255,255,255,0.03)' }}>
                        {[
                            { label: 'Datum', value: formatDate(offer.datum) },
                            { label: 'Gasten', value: (offer.aantal_gasten || '—') + ' personen' },
                            { label: 'Geldig tot', value: formatDate(offer.geldig_tot) },
                            { label: 'Prijs p.p.', value: offer.aantal_gasten ? formatEuro(totaal / offer.aantal_gasten) : '—' },
                        ].map(function (m) {
                            return (
                                <div key={m.label} style={{ padding: '14px 28px', background: 'rgba(0,0,0,0.15)' }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#525252', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{m.label}</div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: '#e5e7eb' }}>{m.value}</div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Items */}
                    {items.length > 0 && (
                        <div style={{ padding: '24px 28px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            <h3 style={{ fontSize: 13, fontWeight: 700, color: '#737373', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Overzicht</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                                {items.map(function (item: any, i: number) {
                                    const lineTotal = (item.qty || 0) * (item.prijs || 0);
                                    return (
                                        <div key={i} style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            padding: '12px 0', borderBottom: i < items.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                                        }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: 14, fontWeight: 600, color: '#e5e7eb' }}>{item.omschrijving || 'Item'}</div>
                                                <div style={{ fontSize: 12, color: '#525252', marginTop: 2 }}>{item.qty || 0} x {formatEuro(item.prijs || 0)}</div>
                                            </div>
                                            <div style={{ fontSize: 14, fontWeight: 700, color: '#e5e7eb' }}>{formatEuro(lineTotal)}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Menu items */}
                    {menuItems.length > 0 && (
                        <div style={{ padding: '0 28px 24px' }}>
                            <h3 style={{ fontSize: 13, fontWeight: 700, color: '#737373', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Menu</h3>
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
                        </div>
                    )}

                    {/* Totals */}
                    <div style={{ padding: '20px 28px', background: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 300, marginLeft: 'auto' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#a3a3a3' }}>
                                <span>Subtotaal</span>
                                <span>{formatEuro(subtotal)}</span>
                            </div>
                            {vasteKostenTotal > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#a3a3a3' }}>
                                    <span>Vaste kosten</span>
                                    <span>{formatEuro(vasteKostenTotal)}</span>
                                </div>
                            )}
                            {korting > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#22c55e' }}>
                                    <span>Korting</span>
                                    <span>-{formatEuro(korting)}</span>
                                </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#a3a3a3' }}>
                                <span>BTW {defaultBtw}%</span>
                                <span>{formatEuro(btwBedrag)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17, fontWeight: 800, color: '#fff', paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: 4 }}>
                                <span>Totaal</span>
                                <span style={{ color: brandColor }}>{formatEuro(totaal)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Notes */}
                    {offer.notitie && (
                        <div style={{ padding: '20px 28px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#525252', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Opmerkingen</div>
                            <p style={{ fontSize: 13, color: '#a3a3a3', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{offer.notitie}</p>
                        </div>
                    )}

                    {/* Status tracker (shown after acceptance) */}
                    {accepted && (
                        <div style={{ padding: '24px 28px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            <h3 style={{ fontSize: 13, fontWeight: 700, color: '#737373', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Voortgang</h3>
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
                                                    height: 2, background: done ? '#f59e0b' : 'rgba(255,255,255,0.08)',
                                                }} />
                                            )}
                                            {i < STATUS_STEPS.length - 1 && (
                                                <div style={{
                                                    position: 'absolute', top: 16, left: '50%', right: 0,
                                                    height: 2, background: i < currentStep ? '#f59e0b' : 'rgba(255,255,255,0.08)',
                                                }} />
                                            )}
                                            {/* Circle */}
                                            <div style={{
                                                width: 34, height: 34, borderRadius: '50%', margin: '0 auto 8px',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                background: done ? 'rgba(158,120,28,.15)' : 'rgba(255,255,255,0.04)',
                                                border: isCurrent ? '2px solid #f59e0b' : '1px solid rgba(255,255,255,0.08)',
                                                fontSize: 16, position: 'relative', zIndex: 1,
                                            }}>
                                                {step.icon}
                                            </div>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: done ? '#e5e7eb' : '#525252', lineHeight: 1.3 }}>
                                                {step.label}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Signed info */}
                            {offer.signed_by && (
                                <div style={{ marginTop: 20, padding: '12px 16px', borderRadius: 10, background: 'rgba(16,185,129,.06)', border: '1px solid rgba(16,185,129,.12)', fontSize: 12, color: '#a3a3a3' }}>
                                    Ondertekend door <strong style={{ color: '#10b981' }}>{offer.signed_by}</strong>
                                    {offer.signed_at && <span> op {formatDate(offer.signed_at)}</span>}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Signature & Accept */}
                    {!accepted && !signStep && (
                        <div style={{ padding: '32px 28px', borderTop: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
                            <div style={{ padding: 24, background: 'rgba(158,120,28,.06)', borderRadius: 16, border: '1px solid rgba(158,120,28,.12)' }}>
                                <h3 style={{ color: '#fff', fontSize: 20, fontWeight: 800, margin: '0 0 8px' }}>Akkoord met deze offerte?</h3>
                                <p style={{ color: '#a3a3a3', fontSize: 14, marginBottom: 20, maxWidth: 400, margin: '0 auto 20px' }}>
                                    Bevestig met een digitale handtekening om de datum vast te leggen.
                                </p>
                                <button
                                    onClick={function () { setSignStep(true); }}
                                    style={{
                                        background: brandColor, color: '#000', border: 'none',
                                        padding: '14px 36px', borderRadius: 99, fontSize: 15, fontWeight: 800,
                                        cursor: 'pointer', boxShadow: '0 4px 20px rgba(158,120,28,0.3)',
                                        transition: 'transform 0.15s, box-shadow 0.15s',
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
                        <div style={{ padding: '28px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Digitale handtekening</h3>
                            <p style={{ color: '#737373', fontSize: 13, marginBottom: 20 }}>
                                Vul uw naam in en plaats een handtekening om de offerte te bevestigen.
                            </p>

                            <div style={{ marginBottom: 16 }}>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#a3a3a3', marginBottom: 6 }}>Naam ondertekenaar</label>
                                <input
                                    type="text"
                                    value={signerName}
                                    onChange={function (e) { setSignerName(e.target.value); }}
                                    placeholder="Uw volledige naam"
                                    style={{
                                        width: '100%', padding: '10px 14px', borderRadius: 10,
                                        background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                                        color: '#e5e7eb', fontSize: 14, outline: 'none',
                                        boxSizing: 'border-box',
                                    }}
                                />
                            </div>

                            <div style={{ marginBottom: 20 }}>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#a3a3a3', marginBottom: 6 }}>Handtekening</label>
                                <SignaturePad onSignature={setSignatureData} />
                            </div>

                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                <button
                                    onClick={function () { setSignStep(false); }}
                                    style={{
                                        padding: '12px 24px', borderRadius: 10,
                                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                                        color: '#a3a3a3', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                    }}
                                >
                                    Annuleren
                                </button>
                                <button
                                    onClick={handleAccept}
                                    disabled={submitting || !signatureData || !signerName.trim()}
                                    style={{
                                        flex: 1, padding: '12px 24px', borderRadius: 10,
                                        background: signatureData && signerName.trim() ? '#f59e0b' : 'rgba(158,120,28,.3)',
                                        color: signatureData && signerName.trim() ? '#000' : 'rgba(0,0,0,.5)',
                                        border: 'none', fontSize: 14, fontWeight: 800, cursor: signatureData && signerName.trim() ? 'pointer' : 'not-allowed',
                                        opacity: submitting ? 0.6 : 1,
                                    }}
                                >
                                    {submitting ? 'Verwerken...' : 'Bevestigen en ondertekenen'}
                                </button>
                            </div>

                            <p style={{ fontSize: 12, color: '#525252', marginTop: 12, lineHeight: 1.5 }}>
                                Door te ondertekenen gaat u akkoord met de voorwaarden in deze offerte.
                                {settings?.betaalvoorwaarden && ' ' + settings.betaalvoorwaarden}
                            </p>
                        </div>
                    )}

                    {/* Post-acceptance */}
                    {accepted && !signStep && (
                        <div style={{ padding: '28px', borderTop: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
                            <div style={{ padding: 24, background: 'rgba(16,185,129,.06)', borderRadius: 16, border: '1px solid rgba(16,185,129,.12)' }}>
                                <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
                                <h3 style={{ color: '#10b981', fontSize: 20, fontWeight: 800, margin: '0 0 8px' }}>Offerte geaccepteerd!</h3>
                                <p style={{ color: '#a3a3a3', fontSize: 14, margin: 0, maxWidth: 380, marginLeft: 'auto', marginRight: 'auto' }}>
                                    Wij gaan direct aan de slag. U ontvangt een bevestiging per e-mail.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Company footer */}
                <div style={{ textAlign: 'center', marginTop: 32, color: '#404040', fontSize: 12 }}>
                    {settings?.adres && <p style={{ margin: '0 0 4px' }}>{settings.adres}</p>}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
                        {settings?.telefoon && <span>{settings.telefoon}</span>}
                        {settings?.email && <span>{settings.email}</span>}
                        {settings?.website && <span>{settings.website}</span>}
                    </div>
                    <p style={{ marginTop: 16, color: '#2a2a2a' }}>Powered by <strong>BBQ Architect</strong></p>
                </div>
            </div>
        </div>
    );
}
