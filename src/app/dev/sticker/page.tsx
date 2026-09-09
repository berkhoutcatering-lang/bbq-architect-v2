'use client';

/**
 * /dev/sticker — de doossticker visueel nakijken zonder printer en zonder data.
 * Zelfde idee als /dev/ai-blocks: pure UI, geen API-aanroepen, alleen in dev.
 *
 * Tekent uit de GEDEELDE FIXTURE (docs/contracten/experience-v1-box.json), dus
 * wat je hier ziet is exact de vorm die de Experience-app straks moet leveren.
 * Verandert die vorm daar zonder dat hier iets meebeweegt, dan wordt
 * src/lib/boxLabel.test.ts rood.
 *
 * De namen ernaast zijn de randgevallen uit de briefing §6: accenten en een
 * dubbele achternaam die niet afgekapt mag worden.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { notFound } from 'next/navigation';
import { renderBoxLabel, deelOfDownload, STANDAARD_FORMAAT, type LabelFormaat } from '@/lib/printBoxLabel';
import type { DoosSnapshot } from '@/lib/boxLabel';
import FIXTURE from '../../../../docs/contracten/experience-v1-box.json';

const SNAPSHOT = FIXTURE as unknown as DoosSnapshot;

const NAMEN = [
    'Kasper Nijsen',
    'Renée Ø Björn',
    'Van der Meer-Hendriksen',
    'Fam. Berkhout',
    'Wolfeschlegelsteinhausenbergerdorff',
];

const FORMATEN: Array<{ label: string; formaat: LabelFormaat }> = [
    { label: '4 × 6 inch · 203 dpi', formaat: STANDAARD_FORMAAT },
    { label: '4 × 6 inch · 300 dpi', formaat: { ...STANDAARD_FORMAAT, dpi: 300 } },
    { label: '62 × 100 mm · 300 dpi', formaat: { breedte_mm: 62, hoogte_mm: 100, dpi: 300 } },
];

export default function StickerSpeeltuin() {
    if (process.env.NODE_ENV === 'production') notFound();
    return <Speeltuin />;
}

function Speeltuin() {
    const [naam, setNaam] = useState(NAMEN[0]);
    const [formaatIndex, setFormaatIndex] = useState(0);
    const [metSnapshot, setMetSnapshot] = useState(true);
    const [personen, setPersonen] = useState(6);
    const [waarschuwingen, setWaarschuwingen] = useState<string[]>([]);
    const [fout, setFout] = useState<string | null>(null);
    const [px, setPx] = useState<string>('');
    const houder = useRef<HTMLDivElement>(null);
    const laatste = useRef<HTMLCanvasElement | null>(null);

    const teken = useCallback(async () => {
        setFout(null);
        try {
            const formaat = FORMATEN[formaatIndex].formaat;
            const { canvas, waarschuwingen: w } = await renderBoxLabel({
                naam,
                personen,
                dozen: Math.ceil(personen / 8),
                afhaaldatum: '2026-12-22',
                startTijd: '16:30:00',
                snapshot: metSnapshot ? SNAPSHOT : null,
                formaat,
            });
            laatste.current = canvas;
            setWaarschuwingen(w);
            setPx(`${canvas.width} × ${canvas.height} px`);
            /* Op het scherm verkleind tonen; het canvas zelf is op printresolutie. */
            canvas.style.width = '340px';
            canvas.style.height = 'auto';
            canvas.style.border = '1px solid var(--border)';
            if (houder.current) { houder.current.innerHTML = ''; houder.current.appendChild(canvas); }
        } catch (e) {
            setFout(e instanceof Error ? e.message : 'Onbekende fout');
            if (houder.current) houder.current.innerHTML = '';
        }
    }, [naam, personen, formaatIndex, metSnapshot]);

    useEffect(() => { void teken(); }, [teken]);

    return (
        <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>
            <h1 className="chassis-titel">Doossticker</h1>
            <p className="chassis-onderschrift" style={{ maxWidth: 620 }}>
                Getekend uit de gedeelde fixture <code>docs/contracten/experience-v1-box.json</code>.
                Geen data, geen netwerk — alleen de renderer.
            </p>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '18px 0' }}>
                <select value={naam} onChange={(e) => setNaam(e.target.value)} style={veld}>
                    {NAMEN.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <select value={formaatIndex} onChange={(e) => setFormaatIndex(Number(e.target.value))} style={veld}>
                    {FORMATEN.map((f, i) => <option key={f.label} value={i}>{f.label}</option>)}
                </select>
                <select value={personen} onChange={(e) => setPersonen(Number(e.target.value))} style={veld}>
                    {[1, 6, 8, 9, 12].map((p) => <option key={p} value={p}>{p} personen</option>)}
                </select>
                <label style={{ ...veld, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={metSnapshot} onChange={(e) => setMetSnapshot(e.target.checked)} />
                    Met koppeling
                </label>
                <button className="btn btn-ghost btn-sm" onClick={() => laatste.current && deelOfDownload(laatste.current, 'sticker-proef.png')}>
                    Downloaden
                </button>
            </div>

            {fout && <div className="panel" style={{ padding: 14, borderColor: 'var(--red)', marginBottom: 14 }}>{fout}</div>}
            {waarschuwingen.map((w) => (
                <div key={w} className="panel" style={{ padding: 12, marginBottom: 8, fontSize: 13 }}>{w}</div>
            ))}

            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }} className="mono">{px}</div>
            <div ref={houder} />
        </div>
    );
}

const veld: React.CSSProperties = {
    padding: '8px 11px', borderRadius: 9, border: '1px solid var(--border)',
    background: 'var(--card-solid)', color: 'var(--text)', font: 'inherit', fontSize: 14,
};
