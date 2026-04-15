/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useRef, useEffect, useState, useCallback } from 'react';
import { X, ScanLine, AlertTriangle } from 'lucide-react';

interface BarcodeScannerProps {
    onScan: (barcode: string) => void;
    isOpen: boolean;
    onClose: () => void;
}

export default function BarcodeScanner({ onScan, isOpen, onClose }: BarcodeScannerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const detectorRef = useRef<any>(null);
    const rafRef = useRef<number>(0);
    const [error, setError] = useState<string | null>(null);
    const [scanning, setScanning] = useState(false);

    const stopCamera = useCallback(function () {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(function (t) { t.stop(); });
            streamRef.current = null;
        }
        if (videoRef.current) videoRef.current.srcObject = null;
        setScanning(false);
    }, []);

    const handleClose = useCallback(function () {
        stopCamera();
        onClose();
    }, [stopCamera, onClose]);

    useEffect(function () {
        if (!isOpen) { stopCamera(); return; }

        const w = window as any;
        if (!w.BarcodeDetector) {
            setError('Barcode scanning niet beschikbaar in deze browser. Gebruik Chrome op Android voor de beste ervaring.');
            return;
        }

        let cancelled = false;

        async function startScanning() {
            try {
                detectorRef.current = new w.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'] });
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
                });
                if (cancelled) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                }
                setScanning(true);
                setError(null);
                detect();
            } catch (err: any) {
                if (!cancelled) {
                    if (err.name === 'NotAllowedError') {
                        setError('Camera-toegang geweigerd. Sta toegang toe in je browserinstellingen.');
                    } else {
                        setError('Kan camera niet starten: ' + (err.message || 'onbekend'));
                    }
                }
            }
        }

        function detect() {
            if (cancelled || !videoRef.current || !detectorRef.current) return;
            detectorRef.current.detect(videoRef.current).then(function (barcodes: any[]) {
                if (cancelled) return;
                if (barcodes && barcodes.length > 0) {
                    const value = barcodes[0].rawValue;
                    if (value) {
                        stopCamera();
                        onScan(value);
                        return;
                    }
                }
                rafRef.current = requestAnimationFrame(detect);
            }).catch(function () {
                if (!cancelled) rafRef.current = requestAnimationFrame(detect);
            });
        }

        startScanning();

        return function () {
            cancelled = true;
            stopCamera();
        };
    }, [isOpen, onScan, stopCamera]);

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,.92)', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
        }}>
            {/* Close button */}
            <button
                onClick={handleClose}
                style={{
                    position: 'absolute', top: 16, right: 16, zIndex: 10,
                    width: 56, height: 56, borderRadius: 28,
                    background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)',
                    color: '#fff', fontSize: 24, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(8px)',
                }}
                aria-label="Sluiten"
            >
                <X size={24} />
            </button>

            {/* Title */}
            <div style={{ position: 'absolute', top: 24, left: 0, right: 0, textAlign: 'center', zIndex: 5 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', letterSpacing: '0.03em' }}>
                    <ScanLine size={16} style={{ marginRight: 8, color: 'var(--brand)', display: 'inline-block', verticalAlign: 'middle' }} />
                    Barcode Scanner
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', marginTop: 4 }}>
                    Richt de camera op een barcode
                </div>
            </div>

            {error ? (
                <div style={{
                    maxWidth: 340, padding: 24, textAlign: 'center',
                    background: 'rgba(30,30,34,.9)', borderRadius: 16,
                    border: '1px solid var(--border)',
                }}>
                    <AlertTriangle size={32} style={{ color: 'var(--amber)', marginBottom: 12 }} />
                    <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.5 }}>{error}</p>
                    <button onClick={handleClose} className="btn btn-brand" style={{ marginTop: 16 }}>Sluiten</button>
                </div>
            ) : (
                <div style={{ position: 'relative', width: '100%', maxWidth: 400, aspectRatio: '4/3' }}>
                    <video
                        ref={videoRef}
                        playsInline
                        muted
                        style={{
                            width: '100%', height: '100%', objectFit: 'cover',
                            borderRadius: 16, border: '2px solid color-mix(in srgb, var(--brand) 30%, transparent)',
                        }}
                    />
                    {/* Scanning overlay */}
                    {scanning && (
                        <div style={{
                            position: 'absolute', inset: 0, borderRadius: 16, overflow: 'hidden',
                            pointerEvents: 'none',
                        }}>
                            {/* Corner markers */}
                            <div style={{ position: 'absolute', top: 20, left: 20, width: 30, height: 30, borderTop: '3px solid var(--brand)', borderLeft: '3px solid var(--brand)', borderRadius: '4px 0 0 0' }} />
                            <div style={{ position: 'absolute', top: 20, right: 20, width: 30, height: 30, borderTop: '3px solid var(--brand)', borderRight: '3px solid var(--brand)', borderRadius: '0 4px 0 0' }} />
                            <div style={{ position: 'absolute', bottom: 20, left: 20, width: 30, height: 30, borderBottom: '3px solid var(--brand)', borderLeft: '3px solid var(--brand)', borderRadius: '0 0 0 4px' }} />
                            <div style={{ position: 'absolute', bottom: 20, right: 20, width: 30, height: 30, borderBottom: '3px solid var(--brand)', borderRight: '3px solid var(--brand)', borderRadius: '0 0 4px 0' }} />
                            {/* Animated scan line */}
                            <div style={{
                                position: 'absolute', left: 24, right: 24, height: 2,
                                background: 'linear-gradient(90deg, transparent, var(--brand), transparent)',
                                animation: 'barcodeScanLine 2s ease-in-out infinite',
                                boxShadow: '0 0 12px color-mix(in srgb, var(--brand) 50%, transparent)',
                            }} />
                        </div>
                    )}
                </div>
            )}

            <style>{`
                @keyframes barcodeScanLine {
                    0%, 100% { top: 15%; }
                    50% { top: 80%; }
                }
            `}</style>
        </div>
    );
}
