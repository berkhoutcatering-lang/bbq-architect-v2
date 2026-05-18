'use client';

import { useRef, useState } from 'react';
import {
    Check,
    AlertTriangle,
    ShieldCheck,
    Zap,
    FolderCheck,
    Loader2,
    Camera,
    X,
} from 'lucide-react';

import Button from '@/components/Button';
import styles from '../haccp.module.css';
import {
    CHECK_TYPES,
    HACCP_DISHES,
    type HaccpCheck,
    type HaccpEvent,
    type HaccpLogEntry,
} from '../_data';
import { HRisk, TypeBadge } from './atoms';

// Pillar #4: snelle 1-tap waarde-keuze per type. Geen AI — pure thresholds
// op basis van EU 852/2004 + Warenwetbesluit Hygiëne.
function getPresetTemps(type: string): number[] {
    const t = type.toLowerCase();
    if (t === 'kern' || t === 'bereiding' || t === 'regenereren') return [65, 75, 85, 93];
    if (t === 'uitgifte') return [60, 65, 70, 75];
    if (t === 'ontvangst') return [2, 4, 7];
    if (t === 'koeling' || t === 'bewaring' || t === 'opslag') return [2, 4, 7];
    return [];
}

interface Props {
    event: HaccpEvent;
    checks: HaccpCheck[];
    logEntries: Record<string, HaccpLogEntry>;
    onLog: (checkId: string, value: string, photoUrl?: string) => void;
    onComplete: () => void;
}

export default function LogView({
    event,
    checks,
    logEntries,
    onLog,
    onComplete,
}: Props) {
    const enabled = checks.filter((c) => c.enabled);
    const logged = Object.keys(logEntries).length;
    const total = enabled.length;
    const pct = total > 0 ? Math.round((logged / total) * 100) : 0;

    const sorted = [...enabled].sort((a, b) => {
        const aLogged = Boolean(logEntries[a.id]);
        const bLogged = Boolean(logEntries[b.id]);
        if (aLogged !== bLogged) return aLogged ? 1 : -1;
        return a.hour - b.hour;
    });

    return (
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 20,
                }}
            >
                <div>
                    <div className="eyebrow" style={{ marginBottom: 4 }}>
                        {event.title}
                    </div>
                    <h2
                        style={{
                            fontFamily: 'var(--font-display)',
                            fontWeight: 300,
                            fontSize: 22,
                            margin: 0,
                        }}
                    >
                        HACCP Logboek
                    </h2>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {logged < total && (
                        <Button
                            variant="ghost"
                            size="sm"
                            icon={<Zap size={12} />}
                            onClick={onComplete}
                            style={{ fontSize: 11, color: 'var(--muted)' }}
                        >
                            Demo: vul alles in
                        </Button>
                    )}
                    <div style={{ textAlign: 'right' }}>
                        <div
                            style={{
                                fontSize: 24,
                                fontFamily: 'var(--font-display)',
                                fontWeight: 600,
                                fontVariantNumeric: 'tabular-nums',
                                color: pct === 100 ? 'var(--green)' : 'var(--text)',
                                lineHeight: 1,
                            }}
                        >
                            {logged}/{total}
                        </div>
                        <div
                            style={{
                                fontSize: 10,
                                color: 'var(--muted)',
                                letterSpacing: '.1em',
                                marginTop: 4,
                            }}
                        >
                            GELOGD
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ marginBottom: 24 }}>
                <div
                    style={{
                        height: 6,
                        borderRadius: 3,
                        background: 'rgba(130,130,130,.12)',
                        overflow: 'hidden',
                    }}
                >
                    <div
                        style={{
                            height: '100%',
                            width: `${pct}%`,
                            background: pct === 100 ? 'var(--green)' : 'var(--brand)',
                            borderRadius: 3,
                            transition: 'width .4s ease',
                        }}
                    />
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {sorted.map((check, i) => {
                    const entry = logEntries[check.id];
                    const now = new Date();
                    const nowH = now.getHours() + now.getMinutes() / 60;
                    const isOverdue = !entry && check.hour < nowH - 0.5;
                    return (
                        <LogCard
                            key={check.id}
                            check={check}
                            entry={entry}
                            isOverdue={isOverdue}
                            onLog={onLog}
                            idx={i}
                        />
                    );
                })}
            </div>

            {logged === total && total > 0 && (
                <div
                    className={styles.fadeUp}
                    style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        marginTop: 24,
                        gap: 10,
                    }}
                >
                    <Button
                        variant="brand"
                        icon={<FolderCheck size={14} />}
                        onClick={onComplete}
                    >
                        Afsluiten &amp; naar dossier
                    </Button>
                </div>
            )}
        </div>
    );
}

function LogCard({
    check,
    entry,
    isOverdue,
    onLog,
    idx,
}: {
    check: HaccpCheck;
    entry?: HaccpLogEntry;
    isOverdue: boolean;
    onLog: (id: string, value: string, photoUrl?: string) => void;
    idx: number;
}) {
    const [val, setVal] = useState('');
    const [confirming, setConfirming] = useState(false);
    const [photoUploading, setPhotoUploading] = useState(false);
    const [photoUrl, setPhotoUrl] = useState<string | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const typeInfo = CHECK_TYPES[check.type];
    const dishNames = check.dishIds
        .map((id) => HACCP_DISHES.find((d) => d.id === id)?.name)
        .filter(Boolean)
        .join(', ');

    const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        // Pillar #3 SOTA: foto = bewijs, niet vervanger. Lokaal preview eerst.
        setPhotoPreview(URL.createObjectURL(file));
        setPhotoUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch('/api/haccp/photo', { method: 'POST', body: fd });
            if (!res.ok) throw new Error(`API ${res.status}`);
            const { path } = (await res.json()) as { path: string };
            setPhotoUrl(path);
        } catch (err) {
            console.warn('[LogCard] photo upload failed', (err as Error).message);
            setPhotoPreview(null);
        } finally {
            setPhotoUploading(false);
        }
    };

    const clearPhoto = () => {
        setPhotoUrl(null);
        setPhotoPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleConfirm = () => {
        if (!val.trim()) return;
        setConfirming(true);
        window.setTimeout(() => {
            onLog(check.id, val, photoUrl ?? undefined);
            setConfirming(false);
        }, 400);
    };

    if (entry) {
        return (
            <div
                className={`metal ${styles.fadeUp}`}
                style={{
                    borderLeft: `3px solid ${entry.status === 'ok' ? 'var(--green)' : 'var(--amber)'}`,
                    opacity: 0.78,
                    animationDelay: `${idx * 30}ms`,
                }}
            >
                <div
                    style={{
                        padding: '12px 18px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                    }}
                >
                    <div
                        style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            background:
                                entry.status === 'ok'
                                    ? 'rgba(34,197,94,.12)'
                                    : 'rgba(245,158,11,.12)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}
                    >
                        {entry.status === 'ok' ? (
                            <Check size={16} color="var(--green)" />
                        ) : (
                            <AlertTriangle size={16} color="var(--amber)" />
                        )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{check.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                            {dishNames} · {check.time} gepland
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div
                            style={{
                                fontSize: 16,
                                fontFamily: 'var(--font-display)',
                                fontWeight: 600,
                                fontVariantNumeric: 'tabular-nums',
                            }}
                        >
                            {entry.val}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                            {entry.at} · {entry.by}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className={`metal ${styles.fadeUp}`}
            style={{
                borderLeft: `3px solid ${typeInfo.color}`,
                animationDelay: `${idx * 30}ms`,
            }}
        >
            <div style={{ padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <div style={{ flex: 1 }}>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                marginBottom: 4,
                                flexWrap: 'wrap',
                            }}
                        >
                            <TypeBadge type={check.type} />
                            <HRisk risk={check.risk} />
                            {isOverdue && (
                                <span
                                    className="pill pill-red"
                                    style={{
                                        fontSize: 9,
                                        padding: '1px 7px',
                                        animation: 'lowStockPulse 2.5s ease-in-out infinite',
                                    }}
                                >
                                    Overschreden
                                </span>
                            )}
                        </div>
                        <div
                            style={{ fontSize: 15, fontWeight: 600, marginBottom: 3 }}
                        >
                            {check.label}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                            {dishNames}
                        </div>
                        <div
                            style={{
                                fontSize: 12,
                                color: 'var(--muted)',
                                fontFamily: 'var(--font-mono)',
                                marginTop: 4,
                                background: 'rgba(130,130,130,.06)',
                                display: 'inline-block',
                                padding: '2px 8px',
                                borderRadius: 4,
                            }}
                        >
                            Norm: {check.target}
                        </div>
                    </div>
                    <div
                        style={{
                            textAlign: 'center',
                            flexShrink: 0,
                            minWidth: 140,
                        }}
                    >
                        <div
                            style={{
                                fontSize: 10,
                                color: 'var(--muted)',
                                letterSpacing: '.1em',
                                textTransform: 'uppercase',
                                marginBottom: 6,
                            }}
                        >
                            Gepland {check.time}
                        </div>
                        {/* Preset-pills: instant temp-keuze. Pillar #4: tap-count omlaag,
                            geen AI — pure hardcoded thresholds per check-type. */}
                        <div
                            style={{
                                display: 'flex',
                                gap: 4,
                                justifyContent: 'center',
                                marginBottom: 6,
                                flexWrap: 'wrap',
                            }}
                        >
                            {getPresetTemps(check.type).map((preset) => (
                                <button
                                    key={preset}
                                    type="button"
                                    onClick={() => setVal(`${preset}`)}
                                    style={{
                                        fontSize: 11,
                                        fontFamily: 'var(--font-mono)',
                                        fontWeight: 600,
                                        padding: '4px 8px',
                                        borderRadius: 6,
                                        background: 'rgba(255,191,0,0.06)',
                                        border: '1px solid rgba(255,191,0,0.18)',
                                        color: 'var(--brand-gold)',
                                        cursor: 'pointer',
                                        minWidth: 36,
                                    }}
                                    aria-label={`Vul ${preset}°C in`}
                                >
                                    {preset}°
                                </button>
                            ))}
                        </div>
                        <input
                            className={`input ${styles.logInput}`}
                            placeholder="Waarde…"
                            value={val}
                            onChange={(e) => setVal(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleConfirm();
                            }}
                            style={{
                                fontSize: 18,
                                fontFamily: 'var(--font-display)',
                                textAlign: 'center',
                                fontWeight: 600,
                                padding: '10px 12px',
                                marginBottom: 8,
                                width: '100%',
                            }}
                        />

                        {/* SOTA-feature: foto-evidence per check (optioneel) */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handlePhotoSelect}
                            style={{ display: 'none' }}
                            aria-hidden
                        />
                        {photoPreview ? (
                            <div
                                style={{
                                    position: 'relative',
                                    marginBottom: 8,
                                    borderRadius: 6,
                                    overflow: 'hidden',
                                    border: '1px solid var(--border)',
                                }}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={photoPreview}
                                    alt="Bewijsfoto"
                                    style={{
                                        width: '100%',
                                        height: 60,
                                        objectFit: 'cover',
                                        display: 'block',
                                        opacity: photoUploading ? 0.5 : 1,
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={clearPhoto}
                                    aria-label="Foto verwijderen"
                                    style={{
                                        position: 'absolute',
                                        top: 2,
                                        right: 2,
                                        width: 20,
                                        height: 20,
                                        borderRadius: 10,
                                        background: 'rgba(0,0,0,0.6)',
                                        border: 'none',
                                        color: 'white',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <X size={11} />
                                </button>
                                {photoUploading && (
                                    <div
                                        style={{
                                            position: 'absolute',
                                            inset: 0,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', color: '#fff' }} />
                                    </div>
                                )}
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                style={{
                                    width: '100%',
                                    fontSize: 11,
                                    color: 'var(--muted)',
                                    background: 'rgba(130,130,130,0.06)',
                                    border: '1px dashed var(--border)',
                                    borderRadius: 6,
                                    padding: '6px 8px',
                                    marginBottom: 8,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 5,
                                    justifyContent: 'center',
                                }}
                            >
                                <Camera size={12} />
                                Foto toevoegen (optioneel)
                            </button>
                        )}
                        <Button
                            variant="brand"
                            size="sm"
                            icon={
                                confirming ? (
                                    <Loader2
                                        size={12}
                                        style={{
                                            animation: 'spin 1s linear infinite',
                                        }}
                                    />
                                ) : (
                                    <Check size={12} />
                                )
                            }
                            onClick={handleConfirm}
                            style={{ width: '100%', justifyContent: 'center' }}
                        >
                            {confirming ? 'Bevestigen…' : 'Bevestig'}
                        </Button>
                        <div
                            style={{
                                fontSize: 9,
                                color: 'var(--muted)',
                                marginTop: 6,
                                letterSpacing: '.08em',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                            }}
                        >
                            <ShieldCheck size={9} />
                            MENS BEVESTIGT
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
