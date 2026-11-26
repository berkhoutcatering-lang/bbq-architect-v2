'use client';

/**
 * Snel invullen — bovenin "Bestelling invoeren". Plak of kies een screenshot
 * (WhatsApp, mail, briefje), typ er kort iets bij, en de AI maakt er een
 * briefing van en zet het formulier eronder klaar. Er wordt niets opgeslagen
 * tot Mathijs zelf op "Bestelling opslaan" drukt.
 */
import { useRef, useState } from 'react';
import { ImagePlus, Sparkles, X } from 'lucide-react';
import Button from '@/components/Button';
import type { Briefing } from '@/lib/ai/bestelBriefing';
import { etiketVoorAi } from '../_lib/fotoverwerking';

const MAX_FOTOS = 3;

interface Foto { id: number; url: string; bestand: File }

interface Props {
    onBriefing: (b: Briefing) => void;
}

let teller = 0;

export default function SnelInvullen({ onBriefing }: Props) {
    const [fotos, setFotos] = useState<Foto[]>([]);
    const [tekst, setTekst] = useState('');
    const [bezig, setBezig] = useState(false);
    const [fout, setFout] = useState<string | null>(null);
    const [klaar, setKlaar] = useState<Briefing | null>(null);
    const kiezer = useRef<HTMLInputElement>(null);

    function voegToe(bestanden: Iterable<File>) {
        const nieuw = [...bestanden].filter((f) => f.type.startsWith('image/'));
        if (!nieuw.length) return;
        setFotos((fs) => [...fs, ...nieuw.map((bestand) => ({ id: ++teller, url: URL.createObjectURL(bestand), bestand }))].slice(0, MAX_FOTOS));
    }

    function haalWeg(id: number) {
        setFotos((fs) => {
            const weg = fs.find((f) => f.id === id);
            if (weg) URL.revokeObjectURL(weg.url);
            return fs.filter((f) => f.id !== id);
        });
    }

    function plak(e: React.ClipboardEvent) {
        const beelden = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
        if (beelden.length) { e.preventDefault(); voegToe(beelden); }
    }

    async function maak() {
        setFout(null);
        if (!fotos.length && !tekst.trim()) { setFout('Plak een screenshot of typ wat de klant wil.'); return; }
        setBezig(true);
        try {
            const beelden = await Promise.all(fotos.map((f) => etiketVoorAi(f.bestand)));
            const r = await fetch('/api/winkel/bestelling-briefing', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fotos: beelden, beschrijving: tekst }),
            });
            const d = await r.json().catch(() => null);
            if (!r.ok || !d?.briefing) { setFout(d?.error ?? 'Het lukte niet. Probeer het nog eens of vul het zelf in.'); return; }
            setKlaar(d.briefing as Briefing);
            onBriefing(d.briefing as Briefing);
        } catch {
            setFout('Geen verbinding. Probeer het nog eens.');
        } finally { setBezig(false); }
    }

    return (
        <section onPaste={plak} style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 14, border: '1px dashed var(--border)', borderRadius: 12 }}>
            <div className="ws-eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Sparkles size={13} /> Snel invullen</div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {fotos.map((f) => (
                    <div key={f.id} style={{ position: 'relative', width: 72, height: 96, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={f.url} alt="Screenshot" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button type="button" aria-label="Screenshot weghalen" onClick={() => haalWeg(f.id)}
                            style={{ position: 'absolute', top: 0, right: 0, width: 44, height: 44, padding: 0, border: 'none', background: 'transparent', display: 'grid', placeItems: 'start end', cursor: 'pointer' }}>
                            {/* Grote tikplek (44 px), klein rondje. */}
                            <span style={{ margin: 3, width: 22, height: 22, borderRadius: 11, background: 'rgba(0,0,0,.6)', color: '#fff', display: 'grid', placeItems: 'center' }}><X size={13} /></span>
                        </button>
                    </div>
                ))}
                {fotos.length < MAX_FOTOS && (
                    <Button variant="ghost" size="sm" icon={<ImagePlus size={14} />} onClick={() => kiezer.current?.click()}>
                        {fotos.length ? 'Nog een' : 'Screenshot'}
                    </Button>
                )}
                <input ref={kiezer} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) voegToe(e.target.files); e.target.value = ''; }} />
            </div>

            <div className="field">
                <textarea aria-label="Korte beschrijving" rows={2} value={tekst} onChange={(e) => setTekst(e.target.value)}
                    placeholder="Belde net: Jansen, 8 pers gourmet vrijdag 16:00, 1 notenallergie" />
                <div className="field-hint">Plakken mag ook: Ctrl+V of lang drukken.</div>
            </div>

            {fout && <div role="alert" style={{ color: 'var(--ws-warn)', fontSize: 13 }}>{fout}</div>}

            <div>
                <Button icon={<Sparkles size={14} />} loading={bezig} onClick={maak}>{klaar ? 'Opnieuw maken' : 'Maak briefing'}</Button>
            </div>

            {klaar && (
                <div className="ws-wensen" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontWeight: 600 }}>Briefing</div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{klaar.briefing || 'Geen samenvatting.'}</div>
                    {klaar.vragen.length > 0 && (
                        <div>
                            <div style={{ fontWeight: 600, color: 'var(--ws-warn)' }}>Nog navragen</div>
                            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{klaar.vragen.map((v, i) => <li key={i}>{v}</li>)}</ul>
                        </div>
                    )}
                    <div className="field-hint">Het formulier hieronder is ingevuld. Kijk het na en sla op.</div>
                </div>
            )}
        </section>
    );
}
