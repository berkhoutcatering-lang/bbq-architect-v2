'use client';

import { useEffect, useState } from 'react';
import { Download, Share, Plus, X } from 'lucide-react';

type BeforeInstallPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = 'bbq-install-prompt-dismissed';
const DISMISS_DAYS = 14;

function isStandalone(): boolean {
    if (typeof window === 'undefined') return false;
    const mq = window.matchMedia('(display-mode: standalone)').matches;
    // iOS exposes navigator.standalone
    const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    return mq || iosStandalone;
}

function isIos(): boolean {
    if (typeof window === 'undefined') return false;
    const ua = window.navigator.userAgent;
    const isIosDevice = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
    // iPadOS 13+ reports as Mac; detect via touch points
    const isIpadOs = ua.includes('Mac') && 'ontouchend' in document;
    return isIosDevice || isIpadOs;
}

function isSafari(): boolean {
    if (typeof window === 'undefined') return false;
    const ua = window.navigator.userAgent;
    // Exclude Chrome/Firefox/Edge on iOS (CriOS/FxiOS/EdgiOS) — they can't install PWAs
    return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

function wasRecentlyDismissed(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        const raw = localStorage.getItem(DISMISS_KEY);
        if (!raw) return false;
        const ts = parseInt(raw, 10);
        if (!Number.isFinite(ts)) return false;
        const ageMs = Date.now() - ts;
        return ageMs < DISMISS_DAYS * 24 * 60 * 60 * 1000;
    } catch {
        return false;
    }
}

function markDismissed() {
    try {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
        // ignore
    }
}

export default function InstallPrompt() {
    const [mode, setMode] = useState<'hidden' | 'ios' | 'android'>('hidden');
    const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

    useEffect(function () {
        if (isStandalone() || wasRecentlyDismissed()) return;

        // Android/Chrome flow: capture beforeinstallprompt
        const onBip = function (e: Event) {
            e.preventDefault();
            setDeferred(e as BeforeInstallPromptEvent);
            setMode('android');
        };
        window.addEventListener('beforeinstallprompt', onBip);

        // iOS flow: show custom banner after small delay (only Safari can install)
        if (isIos() && isSafari()) {
            const t = setTimeout(function () {
                if (!isStandalone()) setMode('ios');
            }, 1500);
            return function () {
                window.removeEventListener('beforeinstallprompt', onBip);
                clearTimeout(t);
            };
        }

        // Hide once installed
        const onInstalled = function () {
            setMode('hidden');
            setDeferred(null);
        };
        window.addEventListener('appinstalled', onInstalled);

        return function () {
            window.removeEventListener('beforeinstallprompt', onBip);
            window.removeEventListener('appinstalled', onInstalled);
        };
    }, []);

    if (mode === 'hidden') return null;

    function handleClose() {
        markDismissed();
        setMode('hidden');
    }

    async function handleInstall() {
        if (!deferred) return;
        await deferred.prompt();
        const choice = await deferred.userChoice;
        if (choice.outcome === 'accepted') {
            setMode('hidden');
        } else {
            markDismissed();
            setMode('hidden');
        }
        setDeferred(null);
    }

    return (
        <div
            role="dialog"
            aria-label="App installeren"
            style={{
                position: 'fixed',
                left: '50%',
                transform: 'translateX(-50%)',
                bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
                width: 'min(420px, calc(100vw - 24px))',
                zIndex: 9999,
                background: 'var(--card-solid, #1e1e22)',
                color: 'var(--text, #f8f8f8)',
                border: '1px solid var(--border-strong, rgba(130,130,130,.3))',
                borderRadius: 14,
                boxShadow: '0 14px 40px rgba(0,0,0,.45)',
                padding: 14,
                fontSize: 13,
                lineHeight: 1.45,
            }}
        >
            <button
                onClick={handleClose}
                aria-label="Sluit installatie-tip"
                className="touch-manipulation"
                style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--muted, #949494)',
                    cursor: 'pointer',
                    padding: 8,
                    minWidth: 44,
                    minHeight: 44,
                    borderRadius: 8,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <X size={18} />
            </button>

            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', paddingRight: 20 }}>
                <div
                    style={{
                        flexShrink: 0,
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        background: 'var(--brand-light, rgba(255,191,0,.12))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--brand, #FFBF00)',
                    }}
                >
                    <Download size={18} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 14 }}>
                        BBQ Architect installeren
                    </div>

                    {mode === 'android' ? (
                        <>
                            <div style={{ color: 'var(--muted, #949494)', marginBottom: 10 }}>
                                Zet de app op je beginscherm voor snellere toegang en offline gebruik.
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                    onClick={handleInstall}
                                    style={{
                                        background: 'var(--brand, #FFBF00)',
                                        color: '#121214',
                                        border: 'none',
                                        padding: '8px 14px',
                                        borderRadius: 8,
                                        fontWeight: 600,
                                        fontSize: 13,
                                        cursor: 'pointer',
                                    }}
                                >
                                    Installeren
                                </button>
                                <button
                                    onClick={handleClose}
                                    style={{
                                        background: 'transparent',
                                        color: 'var(--muted, #949494)',
                                        border: '1px solid var(--border-strong, rgba(130,130,130,.3))',
                                        padding: '8px 14px',
                                        borderRadius: 8,
                                        fontSize: 13,
                                        cursor: 'pointer',
                                    }}
                                >
                                    Later
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div style={{ color: 'var(--muted, #949494)', marginBottom: 10 }}>
                                Installeer deze app op je iPhone voor volledige toegang:
                            </div>
                            <ol style={{ margin: 0, paddingLeft: 18, color: 'var(--text, #f8f8f8)' }}>
                                <li style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span>Tik op</span>
                                    <Share size={15} style={{ color: 'var(--blue, #3b82f6)' }} aria-label="Deel-knop" />
                                    <span>onderaan Safari</span>
                                </li>
                                <li style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                    <span>Kies</span>
                                    <span
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            background: 'var(--muted-extra-light, rgba(130,130,130,.1))',
                                            padding: '2px 6px',
                                            borderRadius: 4,
                                            fontWeight: 500,
                                        }}
                                    >
                                        <Plus size={13} /> Zet op beginscherm
                                    </span>
                                </li>
                            </ol>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
