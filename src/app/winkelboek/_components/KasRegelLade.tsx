'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import Button from '@/components/Button';
import SlideOverPanel from '@/components/SlideOverPanel';
import { voegKasRegelToe, verwijderKasRegel } from '../actions';

/**
 * De knop "Geld uit of in de la" met zijn lade. Het enige wat je in het kasboek
 * zelf invoert: al het andere komt uit de dagafsluiting van de kassa.
 */
export function KasRegelKnop({ beschikbaar, vandaag }: { beschikbaar: boolean; vandaag: string }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [bezig, start] = useTransition();
    const [fout, setFout] = useState<string | null>(null);
    const leeg = { richting: 'uit', bedrag: '', datum: vandaag, moment: 'tijdens', reden: 'uitgave', omschrijving: '' };
    const [veld, setVeld] = useState(leeg);
    const zet = (naam: keyof typeof leeg) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setVeld((v) => ({ ...v, [naam]: e.target.value }));

    function bewaar(e: React.FormEvent) {
        e.preventDefault();
        setFout(null);
        start(async () => {
            const res = await voegKasRegelToe(veld);
            if ('error' in res) { setFout(res.error); return; }
            setVeld(leeg);
            setOpen(false);
            router.refresh();
        });
    }

    return (
        <>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <Button icon={<Plus size={14} />} onClick={() => setOpen(true)} disabled={!beschikbaar}>Geld uit of in de la</Button>
                {!beschikbaar && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Nog niet ingeschakeld</span>}
            </div>

            <SlideOverPanel isOpen={open} onClose={() => setOpen(false)} title="Geld uit of in de la" subtitle="Voor geld dat niet via de kassa ging" width="sm">
                <form onSubmit={bewaar} style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 20 }}>
                    <div className="field">
                        <label htmlFor="kas-richting">Wat gebeurde er</label>
                        <select id="kas-richting" value={veld.richting} onChange={zet('richting')}>
                            <option value="uit">Uit de la gehaald</option>
                            <option value="in">In de la gedaan</option>
                        </select>
                    </div>
                    <div className="field" data-required>
                        <label htmlFor="kas-bedrag">Bedrag</label>
                        <input id="kas-bedrag" inputMode="decimal" autoComplete="off" placeholder="9,00" value={veld.bedrag} onChange={zet('bedrag')} required />
                        <div className="field-hint">Gebruik een komma voor centen.</div>
                    </div>
                    <div className="field">
                        <label htmlFor="kas-datum">Datum</label>
                        <input id="kas-datum" type="date" max={vandaag} value={veld.datum} onChange={zet('datum')} required />
                    </div>
                    <div className="field">
                        <label htmlFor="kas-moment">Wanneer</label>
                        <select id="kas-moment" value={veld.moment} onChange={zet('moment')}>
                            <option value="tijdens">Tijdens de dag, de kassa was open</option>
                            <option value="voor_openen">Vóór het openen</option>
                        </select>
                        <div className="field-hint">Na het tellen? Kies de dag erna en &quot;Vóór het openen&quot;.</div>
                    </div>
                    <div className="field">
                        <label htmlFor="kas-reden">Soort</label>
                        <select id="kas-reden" value={veld.reden} onChange={zet('reden')}>
                            <option value="uitgave">Uitgave</option>
                            <option value="prive">Privé</option>
                            <option value="wisselgeld">Wisselgeld</option>
                            <option value="overig">Overig</option>
                        </select>
                    </div>
                    <div className="field" data-required>
                        <label htmlFor="kas-omschrijving">Waar was het voor</label>
                        <input id="kas-omschrijving" maxLength={200} placeholder="Schoonmaakmiddel" value={veld.omschrijving} onChange={zet('omschrijving')} required />
                    </div>

                    {fout && <div role="alert" className="field-error-msg">{fout}</div>}

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Button type="submit" loading={bezig}>Opslaan</Button>
                        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuleren</Button>
                    </div>
                </form>
            </SlideOverPanel>
        </>
    );
}

/** Een eigen regel weer weghalen. Vraagt eerst om bevestiging. */
export function VerwijderKasRegel({ id, wat }: { id: string; wat: string }) {
    const router = useRouter();
    const [bezig, start] = useTransition();
    const [fout, setFout] = useState<string | null>(null);

    function verwijder() {
        if (!window.confirm(`"${wat}" uit het kasboek halen?`)) return;
        setFout(null);
        start(async () => {
            const res = await verwijderKasRegel(id);
            if ('error' in res) { setFout(res.error); return; }
            router.refresh();
        });
    }

    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Button variant="ghost" size="icon" icon={<Trash2 size={14} />} aria-label={`Verwijder ${wat}`} loading={bezig} onClick={verwijder} />
            {fout && <span role="alert" style={{ fontSize: 11, color: 'var(--status-danger-text)' }}>{fout}</span>}
        </span>
    );
}
