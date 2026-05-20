'use client';
import { useState } from 'react';
import MetallicCard from '@/components/MetallicCard';
import PageHint from '@/components/PageHint';
import FieldError from '@/components/FieldError';
import { Send, CheckCircle, Mail, Phone, Loader2 } from 'lucide-react';

/* Support-email + telefoon komen uit env zodat een tenant deze kan
   overschrijven zonder code-deploy. Fallbacks zijn de Hop & Bites
   defaults. */
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@bbqarchitect.nl';
const SUPPORT_PHONE = process.env.NEXT_PUBLIC_SUPPORT_PHONE || '';

export default function Contact() {
    const [form, setForm] = useState({
        naam: '',
        email: '',
        onderwerp: '',
        bericht: '',
        website: '', /* honeypot — blijft leeg bij echte gebruikers */
    });
    const [gdprConsent, setGdprConsent] = useState(false);
    const [sent, setSent] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

    function setField(key: keyof typeof form, val: string) {
        setForm(Object.assign({}, form, { [key]: val }));
        if (fieldErrors[key]) {
            setFieldErrors(function (prev) {
                const next = { ...prev };
                delete next[key];
                return next;
            });
        }
    }

    async function handleSubmit() {
        setError(null);
        setFieldErrors({});

        if (!gdprConsent) {
            setError('Ga akkoord met onze privacy-voorwaarden om je bericht te versturen.');
            return;
        }

        setSubmitting(true);
        try {
            const res = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, gdpr_consent: gdprConsent }),
            });
            const data = await res.json();
            if (!res.ok) {
                if (data.fields) {
                    setFieldErrors(data.fields);
                    setError('Controleer de gemarkeerde velden.');
                } else {
                    setError(data.error || 'Verzenden mislukt — probeer opnieuw of mail rechtstreeks naar ' + SUPPORT_EMAIL);
                }
                return;
            }
            setSent(true);
        } catch (err) {
            console.error('[contact] submit failed:', err);
            setError('Verbinding mislukt — probeer opnieuw of mail rechtstreeks naar ' + SUPPORT_EMAIL);
        } finally {
            setSubmitting(false);
        }
    }

    function handleReset() {
        setForm({ naam: '', email: '', onderwerp: '', bericht: '', website: '' });
        setGdprConsent(false);
        setSent(false);
        setError(null);
        setFieldErrors({});
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
                                background: 'color-mix(in srgb, var(--success) 12%, transparent)',
                                border: '1px solid color-mix(in srgb, var(--success) 25%, transparent)',
                            }}>
                                <CheckCircle size={28} style={{ color: 'var(--success)' }} />
                            </div>
                            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
                                Bericht verstuurd!
                            </h3>
                            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.5 }}>
                                Bedankt voor je bericht. We nemen zo snel mogelijk contact met je op via {form.email || 'het opgegeven e-mailadres'}.
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

                            {error && (
                                <div style={{
                                    marginBottom: 12, padding: '10px 12px', borderRadius: 8,
                                    background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
                                    border: '1px solid color-mix(in srgb, var(--danger) 20%, transparent)',
                                    color: 'var(--danger)', fontSize: 13,
                                }}>
                                    {error}
                                </div>
                            )}

                            <div className="form-grid">
                                <div className="field" data-required>
                                    <label>Naam</label>
                                    <input
                                        value={form.naam}
                                        onChange={function (e) { setField('naam', e.target.value); }}
                                        placeholder="Je naam"
                                        style={fieldErrors.naam ? { borderColor: 'var(--danger)' } : undefined}
                                    />
                                    <FieldError name="naam" fields={fieldErrors} />
                                </div>
                                <div className="field" data-required>
                                    <label>Email</label>
                                    <input
                                        type="email"
                                        value={form.email}
                                        onChange={function (e) { setField('email', e.target.value); }}
                                        placeholder="je@email.nl"
                                        style={fieldErrors.email ? { borderColor: 'var(--danger)' } : undefined}
                                    />
                                    <FieldError name="email" fields={fieldErrors} />
                                </div>
                                <div className="field full" data-required>
                                    <label>Onderwerp</label>
                                    <input
                                        value={form.onderwerp}
                                        onChange={function (e) { setField('onderwerp', e.target.value); }}
                                        placeholder="Waar gaat je vraag over?"
                                        style={fieldErrors.onderwerp ? { borderColor: 'var(--danger)' } : undefined}
                                    />
                                    <FieldError name="onderwerp" fields={fieldErrors} />
                                </div>
                                <div className="field full" data-required>
                                    <label>Bericht</label>
                                    <textarea
                                        rows={5}
                                        value={form.bericht}
                                        onChange={function (e) { setField('bericht', e.target.value); }}
                                        placeholder="Beschrijf je vraag of opmerking..."
                                        style={fieldErrors.bericht ? { borderColor: 'var(--danger)' } : undefined}
                                    />
                                    <FieldError name="bericht" fields={fieldErrors} />
                                </div>

                                {/* Honeypot — visueel verborgen voor mensen, bots vullen het in. */}
                                <div
                                    className="field full"
                                    style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}
                                    aria-hidden="true"
                                >
                                    <label>Website (laat leeg)</label>
                                    <input
                                        tabIndex={-1}
                                        autoComplete="off"
                                        value={form.website}
                                        onChange={function (e) { setField('website', e.target.value); }}
                                    />
                                </div>
                            </div>

                            {/* GDPR-consent (AVG verplicht voor data-collectie). */}
                            <label style={{
                                display: 'flex', alignItems: 'flex-start', gap: 8,
                                marginTop: 16, padding: '10px 12px', borderRadius: 8,
                                background: 'var(--bg)', border: '1px solid var(--border)',
                                cursor: 'pointer', fontSize: 13, color: 'var(--text)',
                            }}>
                                <input
                                    type="checkbox"
                                    checked={gdprConsent}
                                    onChange={function (e) { setGdprConsent(e.target.checked); }}
                                    style={{ marginTop: 2, accentColor: 'var(--brand)' }}
                                />
                                <span>
                                    Ik ga akkoord dat BBQ Architect mijn naam en e-mailadres gebruikt om op deze vraag te reageren.
                                    Lees onze <a href="/legal/voorwaarden" style={{ color: 'var(--brand)' }}>privacy-voorwaarden</a>.
                                </span>
                            </label>

                            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                                <button
                                    className="btn btn-brand"
                                    onClick={handleSubmit}
                                    disabled={submitting || !gdprConsent}
                                    style={{ opacity: submitting || !gdprConsent ? 0.6 : 1 }}
                                >
                                    {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                                    {submitting ? 'Verzenden...' : 'Versturen'}
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
                        <a
                            href={'mailto:' + SUPPORT_EMAIL}
                            style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}
                        >
                            <div style={{
                                width: 36, height: 36, borderRadius: 10,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: 'color-mix(in srgb, var(--color-accent-gold) 10%, transparent)',
                                border: '1px solid color-mix(in srgb, var(--color-accent-gold) 20%, transparent)',
                            }}>
                                <Mail size={16} style={{ color: 'var(--color-accent-gold)' }} />
                            </div>
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>E-mail</div>
                                <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>{SUPPORT_EMAIL}</div>
                            </div>
                        </a>
                        {SUPPORT_PHONE && (
                            <a
                                href={'tel:' + SUPPORT_PHONE.replace(/\s/g, '')}
                                style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}
                            >
                                <div style={{
                                    width: 36, height: 36, borderRadius: 10,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: 'color-mix(in srgb, var(--color-accent-gold) 10%, transparent)',
                                    border: '1px solid color-mix(in srgb, var(--color-accent-gold) 20%, transparent)',
                                }}>
                                    <Phone size={16} style={{ color: 'var(--color-accent-gold)' }} />
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Telefoon</div>
                                    <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>{SUPPORT_PHONE}</div>
                                </div>
                            </a>
                        )}
                    </div>
                </MetallicCard>
            </div>
        </>
    );
}
