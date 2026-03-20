'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function QuotePage({ params }) {
    var [offer, setOffer] = useState(null);
    var [loading, setLoading] = useState(true);
    var [accepted, setAccepted] = useState(false);
    var [error, setError] = useState(null);

    // We unwrap params properly for Next.js 13+ dynamic routes
    var offerId = params?.id;

    useEffect(() => {
        if (!offerId) return;
        async function fetchOffer() {
            var { data, error } = await supabase.from('offertes').select('*').eq('id', offerId).single();
            if (error || !data) {
                setError('Offerte niet gevonden of verlopen.');
            } else {
                setOffer(data);
                if (data.status === 'geaccepteerd') setAccepted(true);
            }
            setLoading(false);
        }
        fetchOffer();
    }, [offerId]);

    async function handleAccept() {
        if (!offer) return;
        setLoading(true);
        // Update database
        var { error } = await supabase.from('offertes').update({ status: 'geaccepteerd' }).eq('id', offer.id);
        if (!error) {
            setAccepted(true);
            // Optioneel: Stuur webhook naar Zapier/Mollie
        } else {
            alert('Fout bij accepteren: ' + error.message);
        }
        setLoading(false);
    }

    if (loading) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', color: '#fff' }}>Laden...</div>;
    if (error) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', color: '#ff4444' }}>{error}</div>;

    var pax = offer.pax || 0;
    var total = offer.totaal_prijs || 0;

    return (
        <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0a0a0a 0%, #171717 100%)', color: '#e5e7eb', fontFamily: 'DM Sans, sans-serif', padding: '40px 20px' }}>
            <div style={{ maxWidth: 800, margin: '0 auto', background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 24, padding: 40, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 30, marginBottom: 30 }}>
                    <div>
                        <h1 style={{ fontSize: 32, fontWeight: 800, color: '#fff', margin: '0 0 8px 0', letterSpacing: '-0.5px' }}>Voorstel: {offer.naam}</h1>
                        <p style={{ color: '#a3a3a3', margin: 0, fontSize: 16 }}>Voor {offer.klant_naam} • Event datum: {offer.datum}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ color: '#f59e0b', fontWeight: 800, fontSize: 28 }}>€{total.toFixed(2)}</div>
                        <div style={{ color: '#737373', fontSize: 13, marginTop: 4 }}>Inclusief BTW</div>
                    </div>
                </div>

                {/* Details */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 40 }}>
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: 20, borderRadius: 16 }}>
                        <div style={{ color: '#737373', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Gasten</div>
                        <div style={{ fontSize: 20, color: '#fff', fontWeight: 600 }}>{pax} personen</div>
                        <div style={{ color: '#a3a3a3', fontSize: 14, marginTop: 4 }}>€{(total / pax).toFixed(2)} p.p.</div>
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: 20, borderRadius: 16 }}>
                        <div style={{ color: '#737373', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Status</div>
                        {accepted ? (
                            <div style={{ color: '#10b981', fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <i className="fa-solid fa-circle-check"></i> Geaccepteerd
                            </div>
                        ) : (
                            <div style={{ color: '#fbbf24', fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <i className="fa-solid fa-clock"></i> Wachtend op akkoord
                            </div>
                        )}
                    </div>
                </div>

                {/* Gerechten List */}
                <h3 style={{ color: '#fff', fontSize: 20, marginBottom: 20 }}>Geselecteerde Gerechten</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 40 }}>
                    {(offer.gerechten || []).map((g, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '16px 20px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ fontWeight: 600, color: '#e5e7eb' }}>{g.naam}</div>
                            {g.prijs > 0 && <div style={{ color: '#a3a3a3' }}>€{parseFloat(g.prijs).toFixed(2)}</div>}
                        </div>
                    ))}
                </div>

                {/* CTA */}
                {!accepted && (
                    <div style={{ marginTop: 40, textAlign: 'center', padding: 30, background: 'rgba(245, 158, 11, 0.1)', borderRadius: 20, border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                        <h3 style={{ color: '#fff', fontSize: 22, margin: '0 0 16px 0' }}>Klaar om te vlammen? 🔥</h3>
                        <p style={{ color: '#a3a3a3', marginBottom: 24, fontSize: 15 }}>Bevestig vandaag nog om de datum in onze agenda definitief vast te leggen.</p>
                        <button
                            onClick={handleAccept}
                            style={{ background: '#f59e0b', color: '#000', border: 'none', padding: '16px 32px', borderRadius: 99, fontSize: 16, fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 15px rgba(245, 158, 11, 0.4)' }}
                            onMouseOver={e => e.target.style.transform = 'translateY(-2px)'}
                            onMouseOut={e => e.target.style.transform = 'translateY(0)'}
                        >
                            Offerte Accepteren
                        </button>
                    </div>
                )}

                {accepted && (
                    <div style={{ marginTop: 40, textAlign: 'center', padding: 30, background: 'rgba(16, 185, 129, 0.1)', borderRadius: 20, border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                        <h3 style={{ color: '#10b981', fontSize: 24, margin: '0 0 12px 0' }}>Fantastisch! 🎉</h3>
                        <p style={{ color: '#a3a3a3', margin: 0, fontSize: 16 }}>Wij hebben er zin in. Tot snel!</p>
                    </div>
                )}

            </div>

            <div style={{ textAlign: 'center', marginTop: 40, color: '#525252', fontSize: 13 }}>
                Powered by <strong>BBQ Architect</strong>
            </div>
        </div>
    );
}
