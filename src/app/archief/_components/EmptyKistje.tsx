/**
 * EmptyKistje — empty-state voor /archief (P0.8).
 *
 * Visuele DNA 1-op-1 uit Claude design archief-modals.jsx:6-67.
 * Line-art houten kistje SVG met goud op donker, "tot op het woord"-tip,
 * en 2 primary CTA's: scanner-flow + mail-direct.
 *
 * Scanner-CTA opent /inkoop?scan=1 (hergebruikt bestaande BarcodeScanner +
 * camera-flow uit /inkoop), gebruiker keert na scan terug naar /archief.
 *
 * Mail-CTA kopieert het tenant-emailadres `bonnen@<tenant>.bbq-architect.nl`
 * naar clipboard zodat user 'm direct in mailclient kan plakken.
 */
'use client';

import { useCallback, useState } from 'react';
import { ScanLine, Mail, Lightbulb, Check } from 'lucide-react';
import Link from 'next/link';

interface Props {
    /** Org-slug voor email-adres. */
    orgSlug?: string;
}

export function EmptyKistje({ orgSlug }: Props) {
    const orgEmail = `bonnen@${orgSlug ?? 'tenant'}.bbq-architect.nl`;
    const [copied, setCopied] = useState(false);

    const copyEmail = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(orgEmail);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* niet-fataal */
        }
    }, [orgEmail]);

    return (
        <div className="flex min-h-[60vh] items-center justify-center px-6">
            <div className="max-w-[460px] text-center" style={{ animation: 'fadeInUp .5s ease both' }}>
                {/* Wooden kistje SVG — gold line drawing on dark. 1-op-1 uit Claude design. */}
                <svg
                    width="200"
                    height="160"
                    viewBox="0 0 200 160"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    style={{ margin: '0 auto 28px', display: 'block' }}
                    aria-hidden="true"
                >
                    {/* Box body */}
                    <rect x="30" y="60" width="140" height="80" rx="6" stroke="var(--brand-gold)" strokeWidth="2" fill="none" />
                    {/* Wood grain lines */}
                    <line x1="40" y1="82" x2="160" y2="82" stroke="var(--brand-gold)" strokeWidth=".5" opacity=".4" />
                    <line x1="40" y1="102" x2="160" y2="102" stroke="var(--brand-gold)" strokeWidth=".5" opacity=".4" />
                    <line x1="40" y1="122" x2="160" y2="122" stroke="var(--brand-gold)" strokeWidth=".5" opacity=".4" />
                    {/* Front panel accent */}
                    <rect x="75" y="88" width="50" height="24" rx="3" stroke="var(--brand-gold)" strokeWidth="1.5" fill="none" opacity=".5" />
                    <circle cx="100" cy="100" r="4" stroke="var(--brand-gold)" strokeWidth="1.5" fill="none" opacity=".6" />
                    {/* Lid (open, angled) */}
                    <path d="M28 62 L28 42 Q28 36 34 36 L166 36 Q172 36 172 42 L172 62" stroke="var(--brand-gold)" strokeWidth="2" fill="none" />
                    <line x1="38" y1="48" x2="162" y2="48" stroke="var(--brand-gold)" strokeWidth=".5" opacity=".35" />
                    {/* Hinge */}
                    <circle cx="50" cy="62" r="3" stroke="var(--brand-gold)" strokeWidth="1.5" fill="none" />
                    <circle cx="150" cy="62" r="3" stroke="var(--brand-gold)" strokeWidth="1.5" fill="none" />
                    {/* Receipts sticking out */}
                    <rect x="60" y="22" width="30" height="42" rx="2" stroke="var(--brand-gold)" strokeWidth="1" fill="none" opacity=".6" transform="rotate(-8 75 43)" />
                    <line x1="64" y1="32" x2="84" y2="30" stroke="var(--brand-gold)" strokeWidth=".5" opacity=".3" transform="rotate(-8 75 43)" />
                    <line x1="64" y1="38" x2="84" y2="36" stroke="var(--brand-gold)" strokeWidth=".5" opacity=".3" transform="rotate(-8 75 43)" />
                    <line x1="64" y1="44" x2="78" y2="42.5" stroke="var(--brand-gold)" strokeWidth=".5" opacity=".3" transform="rotate(-8 75 43)" />
                    <rect x="105" y="18" width="28" height="46" rx="2" stroke="var(--brand-gold)" strokeWidth="1" fill="none" opacity=".5" transform="rotate(6 119 41)" />
                    <line x1="109" y1="28" x2="127" y2="29" stroke="var(--brand-gold)" strokeWidth=".5" opacity=".3" transform="rotate(6 119 41)" />
                    <line x1="109" y1="34" x2="127" y2="35" stroke="var(--brand-gold)" strokeWidth=".5" opacity=".3" transform="rotate(6 119 41)" />
                    {/* Small sparkle */}
                    <g transform="translate(156,28)" opacity=".7">
                        <line x1="0" y1="-6" x2="0" y2="6" stroke="var(--brand-gold)" strokeWidth="1.5" strokeLinecap="round" />
                        <line x1="-6" y1="0" x2="6" y2="0" stroke="var(--brand-gold)" strokeWidth="1.5" strokeLinecap="round" />
                        <line x1="-4" y1="-4" x2="4" y2="4" stroke="var(--brand-gold)" strokeWidth="1" strokeLinecap="round" />
                        <line x1="4" y1="-4" x2="-4" y2="4" stroke="var(--brand-gold)" strokeWidth="1" strokeLinecap="round" />
                    </g>
                </svg>

                <h2 className="mb-3 text-[22px] font-light tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                    Het bonnenkistje is nog leeg
                </h2>
                <p className="mb-7 text-[13px] leading-[1.7] text-[var(--muted)]">
                    Hier komen je gescande bonnen, facturen en pdf&apos;s terecht — automatisch doorzoekbaar tot op het woord.
                </p>

                {/* Primary CTAs — 2 paden: scanner of mail-direct */}
                <div className="mb-5 flex flex-wrap justify-center gap-2.5">
                    <Link
                        href="/inkoop?scan=1"
                        className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--brand)] px-4 py-2 text-[13px] font-semibold text-black transition hover:bg-[var(--brand-hover)]"
                    >
                        <ScanLine size={14} />
                        Open scanner
                    </Link>
                    <button
                        type="button"
                        onClick={copyEmail}
                        className="inline-flex items-center gap-2 rounded-[10px] border border-[var(--border)] bg-transparent px-4 py-2 text-[13px] font-semibold text-[var(--text)] transition hover:bg-[var(--hover)]"
                    >
                        {copied ? <Check size={14} className="text-emerald-400" /> : <Mail size={14} />}
                        {copied ? 'Adres gekopieerd' : 'Mail bonnen direct'}
                    </button>
                </div>

                {/* Tip — kern van de belofte uit Claude design */}
                <div
                    className="flex items-start gap-2.5 rounded-[10px] border px-4 py-3 text-left text-[12px] leading-[1.6] text-[var(--muted)]"
                    style={{
                        background: 'rgba(196,163,90,.06)',
                        borderColor: 'rgba(196,163,90,.15)',
                    }}
                >
                    <Lightbulb size={16} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--brand-gold)' }} />
                    <span>
                        <strong style={{ color: 'var(--brand-gold)' }}>Tip:</strong> typ later{' '}
                        <em className="not-italic font-mono text-[11px]">baktotaal</em> en je vindt elke bon waar dat ooit op stond.
                    </span>
                </div>

                {/* Email-adres preview (alleen tonen als adres gekopieerd) */}
                {copied && (
                    <p className="mt-3 font-mono text-[11px] text-[var(--muted-light)]">{orgEmail}</p>
                )}
            </div>
        </div>
    );
}
