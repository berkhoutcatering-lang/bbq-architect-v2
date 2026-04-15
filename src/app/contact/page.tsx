'use client';
import { useState } from 'react';
import MetallicCard from '@/components/MetallicCard';
import PageHint from '@/components/PageHint';
import { Send, CheckCircle, Mail, Phone } from 'lucide-react';

export default function Contact() {
    const [form, setForm] = useState({ naam: '', email: '', onderwerp: '', bericht: '' });
    const [sent, setSent] = useState(false);

    function handleSubmit() {
        if (!form.naam || !form.email || !form.onderwerp || !form.bericht) return;
        setSent(true);
    }

    function handleReset() {
        setForm({ naam: '', email: '', onderwerp: '', bericht: '' });
        setSent(false);
    }

    return (
        <>
            <PageHint
                id="contact"
                title="Contact"
                description="Neem contact op met het BBQ Architect team voor support en feedback"
            />

            <div style={{ marginBottom: 16 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Contact</h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, maxWidth: 800 }}>
                <MetallicCard hover={false} className="p-6">
                    {sent ? (
                        <div style={{ textAlign: 'center', padding: '24px 0' }}>
                            <div style={{
                                width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: 'rgba(34,197,94,.12)', border: '1px solid rgba(34,197,94,.25)',
                            }}>
                                <CheckCircle size={28} style={{ color: 'var(--green)' }} />
                            </div>
                            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
                                Bericht verstuurd!
                            </h3>
                            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.5 }}>
                                Bedankt voor je bericht. We nemen zo snel mogelijk contact met je op.
                            </p>
                            <button className="btn btn-brand" onClick={handleReset}>
                                Nieuw bericht versturen
                            </button>
                        </div>
                    ) : (
                        <>
                            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>
                                Stuur ons een bericht
                            </h3>
                            <div className="form-grid">
                                <div className="field">
                                    <label>Naam</label>
                                    <input
                                        value={form.naam}
                                        onChange={function (e) { setForm({ ...form, naam: e.target.value }); }}
                                        placeholder="Je naam"
                                    />
                                </div>
                                <div className="field">
                                    <label>Email</label>
                                    <input
                                        type="email"
                                        value={form.email}
                                        onChange={function (e) { setForm({ ...form, email: e.target.value }); }}
                                        placeholder="je@email.nl"
                                    />
                                </div>
                                <div className="field full">
                                    <label>Onderwerp</label>
                                    <input
                                        value={form.onderwerp}
                                        onChange={function (e) { setForm({ ...form, onderwerp: e.target.value }); }}
                                        placeholder="Waar gaat je vraag over?"
                                    />
                                </div>
                                <div className="field full">
                                    <label>Bericht</label>
                                    <textarea
                                        rows={5}
                                        value={form.bericht}
                                        onChange={function (e) { setForm({ ...form, bericht: e.target.value }); }}
                                        placeholder="Beschrijf je vraag of opmerking..."
                                    />
                                </div>
                            </div>
                            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                                <button className="btn btn-brand" onClick={handleSubmit}>
                                    <Send size={14} /> Versturen
                                </button>
                            </div>
                        </>
                    )}
                </MetallicCard>

                <MetallicCard hover={false} className="p-6">
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>
                        Contactgegevens
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: 10,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: 'rgba(196,163,90,.1)', border: '1px solid rgba(196,163,90,.2)',
                            }}>
                                <Mail size={16} style={{ color: 'var(--color-accent-gold)' }} />
                            </div>
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>E-mail</div>
                                <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>support@bbqarchitect.nl</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: 10,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: 'rgba(196,163,90,.1)', border: '1px solid rgba(196,163,90,.2)',
                            }}>
                                <Phone size={16} style={{ color: 'var(--color-accent-gold)' }} />
                            </div>
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Telefoon</div>
                                <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>+31 6 12345678</div>
                            </div>
                        </div>
                    </div>
                </MetallicCard>
            </div>
        </>
    );
}
