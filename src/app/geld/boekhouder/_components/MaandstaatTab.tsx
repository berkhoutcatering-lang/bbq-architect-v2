'use client';
/* Winkelomzet per maand: dagafsluitingen van de kassa, webshop en btw op één
   staat. Dezelfde cijfers gaan naar de aangifte en het boekhouderpakket. */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Download, TriangleAlert } from 'lucide-react';
import Button from '@/components/Button';
import Panel from '@/components/chassis/Panel';
import { formatEur } from '@/lib/format';
import type { Maandstaat } from '@/lib/omzetMaandstaat';

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

function geld(n: number | null): string {
    return n === null ? '' : formatEur(n);
}

export default function MaandstaatTab() {
    const nu = new Date();
    const [jaar, setJaar] = useState(nu.getFullYear());
    const [maand, setMaand] = useState(nu.getMonth() + 1);
    const [antwoord, setAntwoord] = useState<{ sleutel: string; staat: Maandstaat | null; fout: string | null } | null>(null);
    const sleutel = `${jaar}-${maand}`;

    useEffect(() => {
        let weg = false;
        fetch(`/api/boekhouder/maandstaat?jaar=${jaar}&maand=${maand}`)
            .then(async (r) => {
                const data = await r.json();
                if (weg) return;
                setAntwoord(r.ok ? { sleutel: `${jaar}-${maand}`, staat: data, fout: null } : { sleutel: `${jaar}-${maand}`, staat: null, fout: data.error ?? 'Niet geladen' });
            })
            .catch(() => { if (!weg) setAntwoord({ sleutel: `${jaar}-${maand}`, staat: null, fout: 'Niet geladen' }); });
        return () => { weg = true; };
    }, [jaar, maand]);

    function schuif(stap: number) {
        const d = new Date(jaar, maand - 1 + stap, 1);
        setJaar(d.getFullYear());
        setMaand(d.getMonth() + 1);
    }

    const laden = antwoord?.sleutel !== sleutel;
    const staat = laden ? null : antwoord?.staat ?? null;
    const th = { textAlign: 'right', padding: '6px 8px', fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' } as const;
    const td = { textAlign: 'right', padding: '6px 8px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } as const;

    return (
        <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Button variant="ghost" size="icon" aria-label="Vorige maand" onClick={() => schuif(-1)}><ChevronLeft size={16} /></Button>
                <strong style={{ minWidth: 140, textAlign: 'center' }}>{MAANDEN[maand - 1]} {jaar}</strong>
                <Button variant="ghost" size="icon" aria-label="Volgende maand" onClick={() => schuif(1)}><ChevronRight size={16} /></Button>
                <a href={`/api/boekhouder/maandstaat?jaar=${jaar}&maand=${maand}&pdf=1`} className="btn btn-brand" style={{ marginLeft: 'auto' }}>
                    <Download size={15} /> Download PDF
                </a>
            </div>

            {laden && <p style={{ color: 'var(--muted)' }}>Maandstaat laden</p>}
            {!laden && antwoord?.fout && <p style={{ color: 'var(--muted)' }}>Niet gelukt: {antwoord.fout}</p>}

            {staat && staat.open_punten.length > 0 && (
                <Panel title="Nog na te kijken">
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
                        {staat.open_punten.map((p) => <li key={p}>{p}</li>)}
                    </ul>
                    <p style={{ fontSize: 13, margin: '8px 0 0' }}>
                        <TriangleAlert size={14} style={{ color: 'var(--brand)', verticalAlign: -2 }} />{' '}
                        <Link href="/verkoop/toonbank/dagstaten" style={{ color: 'var(--brand)' }}>Open dagstaten</Link>
                    </p>
                </Panel>
            )}

            {staat && (
                <Panel title="Per dag">
                    {staat.dagen.length === 0 ? (
                        <p style={{ color: 'var(--muted)', margin: 0 }}>Nog geen omzet in deze maand.</p>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                                <thead>
                                    <tr>
                                        <th style={{ ...th, textAlign: 'left' }}>Dag</th>
                                        <th style={th}>Kassa</th><th style={th}>Webshop</th>
                                        <th style={th}>Omzet 9%</th><th style={th}>Btw 9%</th>
                                        <th style={th}>Omzet 21%</th><th style={th}>Btw 21%</th>
                                        <th style={th}>Totaal incl.</th><th style={th}>Pin</th><th style={th}>Contant</th><th style={th}>Kasverschil</th>
                                        <th style={{ ...th, textAlign: 'left' }}>Dagstaat</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {staat.dagen.map((d) => (
                                        <tr key={d.datum} style={{ borderTop: '1px solid var(--border)' }}>
                                            <td style={{ ...td, textAlign: 'left' }}>{new Date(`${d.datum}T12:00:00Z`).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                                            <td style={td}>{geld(d.toonbank + d.kassa_oud)}</td><td style={td}>{geld(d.webshop)}</td>
                                            <td style={td}>{geld(d.omzet_9)}</td><td style={td}>{geld(d.btw_9)}</td>
                                            <td style={td}>{geld(d.omzet_21)}</td><td style={td}>{geld(d.btw_21)}</td>
                                            <td style={{ ...td, fontWeight: 600 }}>{geld(d.incl)}</td>
                                            <td style={td}>{geld(d.pin)}</td><td style={td}>{geld(d.contant)}</td><td style={td}>{geld(d.kasverschil)}</td>
                                            <td style={{ ...td, textAlign: 'left' }}>{d.dagstaat === 'in_orde' ? 'In orde' : d.dagstaat === 'te_controleren' ? 'Te controleren' : '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 600 }}>
                                        <td style={{ ...td, textAlign: 'left' }}>Totaal</td>
                                        <td style={td}>{geld(staat.totaal.toonbank + staat.totaal.kassa_oud)}</td><td style={td}>{geld(staat.totaal.webshop)}</td>
                                        <td style={td}>{geld(staat.totaal.omzet_9)}</td><td style={td}>{geld(staat.totaal.btw_9)}</td>
                                        <td style={td}>{geld(staat.totaal.omzet_21)}</td><td style={td}>{geld(staat.totaal.btw_21)}</td>
                                        <td style={td}>{geld(staat.totaal.incl)}</td>
                                        <td style={td}>{geld(staat.totaal.pin)}</td><td style={td}>{geld(staat.totaal.contant)}</td><td style={td}>{geld(staat.totaal.kasverschil)}</td>
                                        <td />
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </Panel>
            )}
        </div>
    );
}
