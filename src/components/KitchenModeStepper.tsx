'use client';
import { useEffect, useState } from 'react';
import { X, Check, ChevronLeft, ChevronRight } from 'lucide-react';

interface KitchenModeStepperProps {
    titel: string;
    stappen: string[];
    onClose: () => void;
    /* Accent kleur voor progress + Volgende-knop. Default: gold (#c4a35a). */
    gold?: string;
}

/* Kitchen Mode — full-screen stap-voor-stap weergave voor in de keuken.
   Geen kleine icoontjes, geen scroll, geen modal-overlap. Eén stap per scherm,
   keyboard-bediening (←/→/space). Werkt op tablet met handschoenen omdat de
   knoppen ≥44px en altijd onderaan staan binnen duim-bereik.

   Geëxtraheerd uit /recepten/page.tsx omdat zowel /gerechten als /recepten
   (legacy) nu dezelfde stepper hergebruiken — single source. */
export default function KitchenModeStepper({ titel, stappen, onClose, gold = '#c4a35a' }: KitchenModeStepperProps) {
    const [idx, setIdx] = useState(0);
    const total = stappen.length;

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowRight' || e.key === ' ') setIdx(i => Math.min(total - 1, i + 1));
            else if (e.key === 'ArrowLeft') setIdx(i => Math.max(0, i - 1));
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [total, onClose]);

    if (total === 0) {
        return (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.9)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
                <div style={{ color: '#fff', fontSize: 16 }}>Geen bereiding-stappen</div>
                <button onClick={onClose} style={{ padding: '10px 18px', borderRadius: 10, background: '#fff', color: '#000', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Sluiten</button>
            </div>
        );
    }

    const progress = ((idx + 1) / total) * 100;

    return (
        <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 2000, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #222', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.15em', fontWeight: 700 }}>Kitchen mode</div>
                    <div style={{ fontSize: 16, color: '#fff', fontWeight: 600 }}>{titel}</div>
                </div>
                <button onClick={onClose} aria-label="Sluiten" style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 8 }}><X size={20} /></button>
            </div>
            <div style={{ height: 4, background: '#222' }}>
                <div style={{ height: '100%', width: progress + '%', background: gold, transition: 'width .3s' }} />
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
                <div style={{ maxWidth: 800, textAlign: 'center' }}>
                    <div style={{ fontSize: 14, color: gold, fontWeight: 700, marginBottom: 16, letterSpacing: '.15em', textTransform: 'uppercase' }}>
                        Stap {idx + 1} van {total}
                    </div>
                    <div style={{ fontSize: 32, fontWeight: 400, color: '#fff', lineHeight: 1.3, fontFamily: 'Outfit, sans-serif' }}>
                        {stappen[idx]}
                    </div>
                </div>
            </div>
            <div style={{ padding: 24, display: 'flex', gap: 10, justifyContent: 'center', borderTop: '1px solid #222' }}>
                <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}
                    style={{ padding: '12px 20px', borderRadius: 10, border: '1px solid #333', background: idx > 0 ? '#1a1a1a' : '#0a0a0a', color: idx > 0 ? '#fff' : '#444', fontSize: 13, fontWeight: 600, cursor: idx > 0 ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <ChevronLeft size={14} /> Vorige
                </button>
                <button onClick={() => idx === total - 1 ? onClose() : setIdx(i => i + 1)}
                    style={{ padding: '12px 24px', borderRadius: 10, background: gold, color: '#000', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {idx === total - 1 ? <>Klaar <Check size={14} /></> : <>Volgende <ChevronRight size={14} /></>}
                </button>
            </div>
        </div>
    );
}
