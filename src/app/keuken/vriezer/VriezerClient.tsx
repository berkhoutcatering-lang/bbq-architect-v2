'use client';

/**
 * Vriezerlijst: wat aan de kassa is ingevroren, oudste bovenaan. Eén knop per regel: Gebruikt.
 * Daaronder de laatst afgevinkte, om een vergissing terug te draaien.
 */
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Snowflake } from 'lucide-react';
import Button from '@/components/Button';
import { useToast } from '@/components/Toast';
import { formatEur } from '@/lib/format';
import { dagenIngevroren, type Vriezer, type VriezerStuk } from '@/lib/keuken/vriezer';
import '@/styles/menu-hub.css';
import '@/styles/winkel.css';
import { zetGebruikt } from './actions';

const datumKort = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', timeZone: 'Europe/Amsterdam' });

function hoeLang(dagen: number): string {
    if (dagen === 0) return 'vandaag';
    if (dagen === 1) return 'gisteren';
    if (dagen < 14) return `${dagen} dagen`;
    return `${Math.floor(dagen / 7)} weken`;
}

function regelTekst(s: VriezerStuk, vandaag: string): string {
    return [
        `Ingevroren ${datumKort(s.ingevroren_op)} (${hoeLang(dagenIngevroren(s.ingevroren_op, vandaag))})`,
        s.gewicht_g ? `${s.gewicht_g} g` : null,
        formatEur(s.prijs_cents / 100),
        s.tht ? `THT was ${datumKort(s.tht)}` : null,
        s.door ? `door ${s.door}` : null,
    ].filter(Boolean).join(' · ');
}

export default function VriezerClient({ vriezer, vandaag }: { vriezer: Vriezer; vandaag: string }) {
    const toast = useToast();
    const router = useRouter();
    const [bezig, start] = useTransition();

    const zet = (s: VriezerStuk, gebruikt: boolean) => start(async () => {
        const r = await zetGebruikt({ stukId: s.id, gebruikt });
        if ('error' in r) { toast(r.error, 'error'); return; }
        toast(gebruikt ? `${s.naam} is afgevinkt.` : `${s.naam} staat weer in de vriezer.`, 'success');
        router.refresh();
    });

    return (
        <div className="wk-pagina mobile-safe-bottom">
            <div className="wk-kop">
                <div>
                    <h1 className="chassis-titel" style={{ margin: 0 }}>Vriezer</h1>
                    <div className="wk-onder">Wat aan de kassa is ingevroren, oudste bovenaan. Voor eigen gebruik, niet om weer te verkopen.</div>
                </div>
            </div>

            {vriezer.ontbreekt ? (
                <div className="kf-empty"><p>De vriezerlijst komt er zodra de update voor weggooien en invriezen draait (migratie 20261120130000).</p></div>
            ) : vriezer.open.length === 0 ? (
                <div className="kf-empty">
                    <Snowflake size={20} aria-hidden="true" />
                    <p>De vriezer is leeg. Vries je aan de kassa een pakje of een stuk kaas in via &quot;Weggooien of invriezen&quot;, dan staat het hier.</p>
                </div>
            ) : (
                <>
                    <div className="wk-sectie">{vriezer.open.length === 1 ? '1 stuk in de vriezer' : `${vriezer.open.length} stuks in de vriezer`}</div>
                    <div className="wk-lijst">
                        {vriezer.open.map((s) => (
                            <div key={s.id} className="wk-rij" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', cursor: 'default' }}>
                                <div style={{ minWidth: 0 }}>
                                    <span className="wk-naam" style={{ display: 'block' }}>{s.naam}</span>
                                    <span className="wk-klein" style={{ display: 'block' }}>{regelTekst(s, vandaag)}</span>
                                </div>
                                <Button variant="ghost" size="sm" disabled={bezig} onClick={() => zet(s, true)}>Gebruikt</Button>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {vriezer.gebruikt.length > 0 && (
                <>
                    <div className="wk-sectie">Laatst gebruikt</div>
                    <div className="wk-lijst">
                        {vriezer.gebruikt.map((s) => (
                            <div key={s.id} className="wk-rij" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', cursor: 'default' }}>
                                <div style={{ minWidth: 0 }}>
                                    <span className="wk-naam" style={{ display: 'block' }}>{s.naam}</span>
                                    <span className="wk-klein" style={{ display: 'block' }}>
                                        {`Gebruikt ${datumKort(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(new Date(s.opgebruikt_at!)))} · ingevroren ${datumKort(s.ingevroren_op)}`}
                                    </span>
                                </div>
                                <Button variant="ghost" size="sm" disabled={bezig} onClick={() => zet(s, false)}>Toch niet gebruikt</Button>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
