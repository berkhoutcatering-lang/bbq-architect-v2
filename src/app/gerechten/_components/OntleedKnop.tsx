'use client';

/**
 * "In stappen zetten" op de gerecht-detailpagina.
 *
 * De hele H-keten in één component: vraag de ontleding aan, laat hem zien in de
 * goedkeur-lade, en voer hem pas uit als Mathijs tekent. De route schrijft zelf
 * nooit naar recipe_steps — dat doet bewaarReceptStappen, ná bevestiging.
 *
 * Heeft het gerecht nog geen bereidingswijze, dan kun je er hier eentje in
 * plakken. Van de gerechten in de database heeft lang niet alles er een, en een
 * recept uit een schrift of een appje moet er net zo goed in kunnen.
 */

import { useState } from 'react';
import { ListOrdered, Loader2 } from 'lucide-react';
import VoorstelLade from '@/components/voorstellen/VoorstelLade';
import OntledingBody, { type OntledingPayload } from '@/components/voorstellen/OntledingBody';
import { bewaarReceptStappen } from '../actions';
import { useToast } from '@/components/Toast';
import type { Voorstel } from '@/lib/voorstellen';

interface Props {
    gerechtId: string;
    gerechtNaam: string;
    /** Heeft dit gerecht al een bereidingswijze? Zo niet, vragen we er meteen om
     *  in plaats van een foutmelding te tonen nadat je hebt geklikt. */
    heeftBereidingswijze: boolean;
}

export default function OntleedKnop({ gerechtId, gerechtNaam, heeftBereidingswijze }: Props) {
    const showToast = useToast();
    const [bezig, setBezig] = useState(false);
    const [plakken, setPlakken] = useState(false);
    const [tekst, setTekst] = useState('');
    const [voorstel, setVoorstel] = useState<Voorstel<OntledingPayload> | null>(null);
    const [payload, setPayload] = useState<OntledingPayload | null>(null);

    async function ontleed(metTekst?: string) {
        setBezig(true);
        try {
            const res = await fetch('/api/recept/ontleden', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gerecht_id: gerechtId,
                    ...(metTekst?.trim() ? { tekst: metTekst.trim() } : {}),
                }),
            });
            const json = await res.json();

            if (res.status === 422 && json.reden === 'leeg') {
                setPlakken(true);
                return;
            }
            if (!res.ok || json.error) throw new Error(json.error || 'Ontleden mislukt');

            const p: OntledingPayload = {
                gerecht_id: json.gerecht_id,
                naam: json.naam,
                porties: json.porties,
                stappen: json.stappen,
                opmerkingen: json.opmerkingen,
                technieken_niet_herkend: json.technieken_niet_herkend,
            };
            setPayload(p);
            setVoorstel({
                id: json.voorstel_id,
                organization_id: '',
                user_id: '',
                proposal_type: 'recept_ontleding',
                payload: p,
                status: 'pending',
                chat_message_id: null,
                result_id: null,
                created_at: new Date().toISOString(),
                expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
                confirmed_at: null,
            });
            setPlakken(false);
            setTekst('');
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Ontleden mislukt', 'error');
        } finally {
            setBezig(false);
        }
    }

    return (
        <>
            <button
                className="btn btn-ghost btn-sm"
                onClick={() => (heeftBereidingswijze ? ontleed() : setPlakken(true))}
                disabled={bezig}
                title="Laat de AI dit recept in micro-stappen opdelen — jij keurt goed"
            >
                {bezig ? <Loader2 size={14} className="animate-spin" /> : <ListOrdered size={14} />}
                {bezig ? 'Bezig…' : 'In stappen zetten'}
            </button>

            {plakken && (
                <>
                    <div className="mr-drawer-scrim" onClick={() => !bezig && setPlakken(false)} />
                    <div className="mr-drawer" style={{ maxWidth: 620 }}>
                        <div className="mr-drawer-header">
                            <div className="mr-drawer-header-info">
                                <div style={{ fontSize: 17, fontWeight: 600 }}>Receptuur van {gerechtNaam}</div>
                                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>
                                    Plak je bereidingswijze — kort mag. De AI hakt hem op in stappen met handtijd en
                                    wachttijd, en jij kijkt het na.
                                </div>
                            </div>
                        </div>
                        <div style={{ flex: 1, padding: '16px 24px' }}>
                            <textarea
                                value={tekst}
                                onChange={(e) => setTekst(e.target.value)}
                                rows={14}
                                autoFocus
                                placeholder={'1. Brisket trimmen, 1 cm vetlaag laten zitten.\n2. Rub aanbrengen, 12 uur laten intrekken.\n3. Smoker op 110 °C, tot kern 95 °C.\n4. Een uur rusten in folie.'}
                                style={{
                                    width: '100%',
                                    padding: '12px 14px',
                                    borderRadius: 10,
                                    border: '1px solid var(--border)',
                                    background: 'var(--bg-card)',
                                    color: 'var(--text)',
                                    fontSize: 13.5,
                                    lineHeight: 1.6,
                                    resize: 'vertical',
                                }}
                            />
                        </div>
                        <div className="mr-drawer-footer" style={{ display: 'flex', gap: 8, padding: '14px 24px' }}>
                            <button
                                onClick={() => ontleed(tekst)}
                                disabled={bezig || tekst.trim().length < 10}
                                style={{
                                    flex: 1,
                                    padding: '10px 16px',
                                    borderRadius: 8,
                                    border: '1px solid var(--border)',
                                    background: tekst.trim().length >= 10 ? 'var(--brand)' : 'var(--card)',
                                    color: tekst.trim().length >= 10 ? '#000' : 'var(--muted)',
                                    fontSize: 13.5,
                                    fontWeight: 600,
                                    cursor: bezig ? 'default' : 'pointer',
                                }}
                            >
                                {bezig ? 'Bezig…' : 'Ontleden'}
                            </button>
                            <button
                                onClick={() => setPlakken(false)}
                                disabled={bezig}
                                style={{
                                    padding: '10px 16px',
                                    borderRadius: 8,
                                    border: '1px solid var(--border)',
                                    background: 'transparent',
                                    color: 'var(--muted)',
                                    fontSize: 13.5,
                                    cursor: 'pointer',
                                }}
                            >
                                Annuleren
                            </button>
                        </div>
                    </div>
                </>
            )}

            <VoorstelLade
                voorstel={voorstel}
                onClose={() => setVoorstel(null)}
                onBevestigd={async (r) => {
                    const p = r.payload as OntledingPayload;
                    const res = await bewaarReceptStappen({ gerecht_id: gerechtId, stappen: p.stappen });
                    if ('error' in res) {
                        showToast('Opslaan mislukt: ' + res.error, 'error');
                        return;
                    }
                    const { aantal, actief_min, passief_min } = res.data;
                    showToast(
                        `${aantal} stappen bewaard — ${Math.round(actief_min)} min handtijd, ` +
                            `${Math.round(passief_min / 60)} uur wachten`,
                        'success'
                    );
                }}
                onGeannuleerd={() => showToast('Voorstel afgewezen — dank, daar leert het systeem van', 'info')}
            >
                {payload ? <OntledingBody payload={payload} /> : null}
            </VoorstelLade>
        </>
    );
}
