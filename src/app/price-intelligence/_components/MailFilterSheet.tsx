'use client';

/* ═══════════════════════════════════════════════════════════════════
   MAIL FILTER SHEET — Gmail & Outlook regel-handleiding

   Twee modale "sheets" die de gebruiker stap-voor-stap door het
   instellen van een doorstuur-filter loodsen, zodat alle leveranciers-
   mails automatisch in /price-intelligence landen. Bevat copy-knoppen
   voor de filter-condities (e.g. `from:(@sligro.nl OR @makro.nl)`)
   zodat Lars het zonder typefouten kan plakken.

   Geen schema-wijziging, geen server-call. Pure UI.
   ═══════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Check, ExternalLink, Info } from 'lucide-react';

const GOLD = '#c4a35a';

type Provider = 'gmail' | 'outlook';

export function MailFilterButton({
    provider,
    inboxAddress,
}: {
    provider: Provider;
    inboxAddress: string;
}) {
    const [open, setOpen] = useState(false);
    const label = provider === 'gmail' ? 'Gmail filter-instructies' : 'Outlook regel-handleiding';
    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '9px 14px', borderRadius: 10, minHeight: 40,
                    background: 'transparent', color: 'var(--text)',
                    border: '1px solid var(--border)', cursor: 'pointer',
                    fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                }}
            >
                <Info size={14} style={{ color: GOLD }} />
                {label}
            </button>
            {open && (
                <MailFilterSheet
                    provider={provider}
                    inboxAddress={inboxAddress}
                    onClose={() => setOpen(false)}
                />
            )}
        </>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   THE SHEET
   ═══════════════════════════════════════════════════════════════════ */

function MailFilterSheet({
    provider,
    inboxAddress,
    onClose,
}: {
    provider: Provider;
    inboxAddress: string;
    onClose: () => void;
}) {
    /* Portal naar document.body — voorkomt dat een ancestor met `transform`
       (bv. animation-driven matrix op folder-inner) de fixed-overlay opsluit
       binnen een te kleine containing block. Lock body scroll terwijl open. */
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
        window.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = prev;
            window.removeEventListener('keydown', onKey);
        };
    }, [onClose]);

    const isGmail = provider === 'gmail';
    const title = isGmail ? 'Gmail-filter instellen' : 'Outlook-regel instellen';
    const subtitle = 'Stuur leveranciers-mails automatisch door naar Inkoopprijzen.';

    /* Voorbeeld filter-snippet. Lars kan ′m kopiëren en in Gmail/Outlook plakken. */
    const fromSnippet = isGmail
        ? 'from:(@sligro.nl OR @hanos.nl OR @makro.nl OR @bidfood.nl)'
        : 'Afzender bevat @sligro.nl, @hanos.nl, @makro.nl of @bidfood.nl';

    const steps = isGmail ? GMAIL_STEPS : OUTLOOK_STEPS;
    const helpUrl = isGmail
        ? 'https://support.google.com/mail/answer/6579?hl=nl'
        : 'https://support.microsoft.com/nl-nl/office/regels-gebruiken-om-e-mailberichten-automatisch-door-te-sturen-c24f5dea-9465-4df4-ad17-a50ac4a8db3a';

    if (!mounted) return null;

    const sheet = (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="mailfilter-title"
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, zIndex: 120,
                background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)',
                display: 'flex', justifyContent: 'flex-end',
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                className="mail-filter-sheet"
                style={{
                    width: '100%', maxWidth: 560, height: '100%',
                    background: 'var(--bg)', borderLeft: `1px solid ${GOLD}33`,
                    display: 'flex', flexDirection: 'column', overflow: 'hidden',
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '18px 22px', borderBottom: '1px solid var(--border)',
                    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                    gap: 12, flexShrink: 0, background: 'var(--card)',
                }}>
                    <div style={{ minWidth: 0 }}>
                        <div style={{
                            fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase',
                            color: GOLD, fontWeight: 700, marginBottom: 4,
                        }}>
                            Stap-voor-stap
                        </div>
                        <h2
                            id="mailfilter-title"
                            style={{
                                fontFamily: 'Outfit, DM Sans, sans-serif', fontWeight: 300,
                                fontSize: 20, margin: 0, color: 'var(--text)',
                            }}
                        >
                            {title}
                        </h2>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                            {subtitle}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Sluiten"
                        style={{
                            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                            background: 'transparent', border: '1px solid var(--border)',
                            color: 'var(--muted)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Scrollable content */}
                <div style={{ flex: 1, overflow: 'auto', padding: '20px 22px' }}>
                    {/* Doelmail-block */}
                    <div style={{
                        padding: '12px 14px', borderRadius: 10, marginBottom: 18,
                        background: `linear-gradient(135deg, ${GOLD}10, transparent)`,
                        border: `1px solid ${GOLD}33`,
                    }}>
                        <div style={{
                            fontSize: 9, letterSpacing: '.15em', textTransform: 'uppercase',
                            color: GOLD, fontWeight: 700, marginBottom: 4,
                        }}>
                            Doorsturen naar
                        </div>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                        }}>
                            <code style={{
                                fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                                fontSize: 13, color: 'var(--text)', wordBreak: 'break-all',
                            }}>{inboxAddress || '—'}</code>
                            <CopyChip text={inboxAddress} label="adres" disabled={!inboxAddress} />
                        </div>
                    </div>

                    {/* Filter-conditie */}
                    <div style={{
                        padding: 14, borderRadius: 10, marginBottom: 22,
                        background: 'rgba(130,130,130,.06)', border: '1px solid var(--border)',
                    }}>
                        <div style={{
                            fontSize: 9, letterSpacing: '.15em', textTransform: 'uppercase',
                            color: 'var(--muted)', fontWeight: 700, marginBottom: 6,
                        }}>
                            Voorbeeld filter-conditie
                        </div>
                        <div style={{
                            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                            fontSize: 12, color: 'var(--text)', lineHeight: 1.6, marginBottom: 10,
                            wordBreak: 'break-word',
                        }}>
                            {fromSnippet}
                        </div>
                        <CopyChip text={fromSnippet} label="filter" />
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, lineHeight: 1.5 }}>
                            Pas de domeinen aan naar je eigen leveranciers. Tip: kijk in je inbox
                            welke afzender prijslijsten stuurt.
                        </div>
                    </div>

                    {/* Steps */}
                    <ol style={{
                        margin: 0, padding: 0, listStyle: 'none',
                        display: 'flex', flexDirection: 'column', gap: 12,
                    }}>
                        {steps.map((step, idx) => (
                            <li key={idx} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                                <div style={{
                                    width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                                    background: `${GOLD}1F`, color: GOLD,
                                    border: `1px solid ${GOLD}55`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontWeight: 700, fontSize: 12,
                                }}>
                                    {idx + 1}
                                </div>
                                <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                                    <div style={{
                                        fontSize: 13, fontWeight: 600, color: 'var(--text)',
                                        marginBottom: step.detail ? 4 : 0, lineHeight: 1.4,
                                    }}>
                                        {step.title}
                                    </div>
                                    {step.detail && (
                                        <div style={{
                                            fontSize: 12, color: 'var(--muted)', lineHeight: 1.55,
                                        }}>
                                            {step.detail}
                                        </div>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>

                {/* Footer */}
                <div style={{
                    padding: '14px 22px', borderTop: '1px solid var(--border)',
                    background: 'var(--card)', flexShrink: 0,
                    display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center',
                    flexWrap: 'wrap',
                }}>
                    <a
                        href={helpUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            fontSize: 12, color: GOLD, fontWeight: 600, textDecoration: 'none',
                        }}
                    >
                        Officiële handleiding <ExternalLink size={11} />
                    </a>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            padding: '9px 16px', borderRadius: 10, minHeight: 40,
                            background: GOLD, color: '#0a0a0c',
                            fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer',
                            boxShadow: '0 4px 16px rgba(196,163,90,.3)',
                        }}
                    >
                        Klaar
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(sheet, document.body);
}

/* ═══════════════════════════════════════════════════════════════════
   COPY CHIP
   ═══════════════════════════════════════════════════════════════════ */

function CopyChip({
    text,
    label,
    disabled,
}: { text: string; label: string; disabled?: boolean }) {
    const [copied, setCopied] = useState(false);
    function onCopy() {
        if (!text || disabled) return;
        navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        }).catch(() => {});
    }
    return (
        <button
            type="button"
            onClick={onCopy}
            disabled={disabled}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 10px', borderRadius: 8, minHeight: 30,
                background: copied ? GOLD : 'transparent',
                color: copied ? '#0a0a0c' : 'var(--text)',
                border: `1px solid ${copied ? GOLD : 'var(--border)'}`,
                fontWeight: 600, fontSize: 11, cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1, transition: 'all .15s', fontFamily: 'inherit',
            }}
            aria-label={`Kopieer ${label}`}
        >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? 'Gekopieerd' : `Kopieer ${label}`}
        </button>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   STEP CONTENT
   ═══════════════════════════════════════════════════════════════════ */

const GMAIL_STEPS: { title: string; detail?: string }[] = [
    {
        title: 'Open Gmail-instellingen',
        detail: 'Klik op het tandwiel rechtsboven → "Alle instellingen bekijken".',
    },
    {
        title: 'Ga naar het tabblad "Filters en geblokkeerde adressen"',
        detail: 'Onderaan staat "Een nieuw filter maken".',
    },
    {
        title: 'Plak de filter-conditie in het "Van"-veld',
        detail: 'Gebruik de gekopieerde regel hierboven. Klik op "Filter maken".',
    },
    {
        title: 'Vink "Doorsturen naar" aan en kies het inkoopprijzen-adres',
        detail: 'Eerste keer? Voeg het adres toe via "Doorsturen en POP/IMAP" → "Een doorstuuradres toevoegen". Bevestig de testmail.',
    },
    {
        title: 'Vink ook "Pas dit filter ook toe op bestaande gesprekken" aan',
        detail: 'Optioneel — handig om historische prijslijsten meteen mee te nemen.',
    },
    {
        title: 'Klaar — nieuwe mails komen automatisch in je Inbox-tab',
        detail: 'Test ′t met één mail die je doorstuurt. Hij verschijnt binnen ~10 seconden in Inkoopprijzen.',
    },
];

const OUTLOOK_STEPS: { title: string; detail?: string }[] = [
    {
        title: 'Open Outlook (web) en ga naar Instellingen',
        detail: 'Klik op het tandwiel rechtsboven → "Alle Outlook-instellingen weergeven".',
    },
    {
        title: 'Kies "E-mail" → "Regels"',
        detail: 'Klik op "+ Nieuwe regel toevoegen".',
    },
    {
        title: 'Geef de regel een naam, bijv. "Prijslijsten doorsturen"',
        detail: 'Maakt ′t makkelijk terug te vinden.',
    },
    {
        title: 'Voorwaarde: "Afzender bevat" — voeg je leveranciers-domeinen toe',
        detail: 'Per domein een aparte regel-conditie. Klik op "+" om meer afzenders toe te voegen.',
    },
    {
        title: 'Actie: "Doorsturen naar" — plak het inkoopprijzen-adres',
        detail: 'Outlook stuurt elke binnenkomende mail die aan de regels voldoet automatisch door.',
    },
    {
        title: 'Sla op met "Bewaren"',
        detail: 'Outlook past de regel toe op nieuwe mails. Wil je ′m ook op bestaande mails toepassen, klik dan op "Nu uitvoeren".',
    },
    {
        title: 'Test met één bestaande mail',
        detail: 'Stuur ′m door om te zien dat ′ie in Inkoopprijzen verschijnt. Binnen ~10 seconden ben je live.',
    },
];
