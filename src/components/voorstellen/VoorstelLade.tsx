'use client';

/**
 * De goedkeur-lade — de schil waar elk AI-voorstel doorheen gaat.
 *
 * Deze component bezit de omlijsting: kop, wat er gebeurt als je tekent, de
 * resterende geldigheid, de knoppen, de afwijzingsreden en de foutafhandeling.
 * De INHOUD komt van de aanroeper via `children`, want een receptuur in stappen
 * ziet er niet uit als een conceptbestelling. Zou de lade de inhoud ook kennen,
 * dan moest hij elke agent kennen — en dan is het geen herbruikbaar stuk meer.
 *
 * Rechter lade, geen gecentreerd venster: een gecentreerde modal midden in je
 * scherm is oorlogsgebied als je hem twintig keer op een avond ziet.
 *
 * Zie docs/agent-architectuur-plan.md hoofdstuk 2 en 8 (golf 0b).
 */

import { useEffect, useState } from 'react';
import { X, Check, Clock, AlertTriangle, Loader2 } from 'lucide-react';
import {
    VOORSTEL_SOORTEN,
    AFWIJS_REDENEN,
    tijdOver,
    isTeBevestigen,
    type Voorstel,
} from '@/lib/voorstellen';
import { bevestigVoorstel, annuleerVoorstel } from '@/app/voorstellen/actions';

import '@/styles/menu-hub.css';

const REDEN_LABELS: Record<(typeof AFWIJS_REDENEN)[number], string> = {
    te_zwaar: 'Te zwaar',
    smaken_passen_niet: 'Smaken passen niet',
    te_veel_werk: 'Te veel werk',
    past_niet_bij_mijn_gasten: 'Past niet bij mijn gasten',
    klopt_niet: 'Klopt niet',
    anders: 'Anders',
};

interface Props {
    voorstel: Voorstel | null;
    onClose: () => void;
    /** De inhoud. Krijgt de payload mee en geeft terug wat er bevestigd moet
     *  worden — undefined betekent: ongewijzigd overnemen. */
    children: React.ReactNode;
    /** Aangepaste payload, als de aanroeper de inhoud bewerkbaar maakt. Laat
     *  weg als er niets te bewerken valt. */
    gewijzigdePayload?: unknown;
    /** Na bevestigen: hier voer je uit wat er is goedgekeurd. De lade doet dat
     *  bewust niet zelf. */
    onBevestigd?: (r: { type: string; payload: unknown; gewijzigd: boolean }) => void | Promise<void>;
    onGeannuleerd?: () => void;
}

export default function VoorstelLade({
    voorstel,
    onClose,
    children,
    gewijzigdePayload,
    onBevestigd,
    onGeannuleerd,
}: Props) {
    const [bezig, setBezig] = useState(false);
    const [fout, setFout] = useState<string | null>(null);
    const [afwijzen, setAfwijzen] = useState(false);
    const [reden, setReden] = useState<(typeof AFWIJS_REDENEN)[number] | null>(null);
    const [toelichting, setToelichting] = useState('');
    const [nu, setNu] = useState(() => new Date());

    /* De resterende tijd loopt zichtbaar terug, maar per minuut — niet per
       seconde. Een aftellende klok naast een beslissing is onnodige druk. */
    useEffect(() => {
        if (!voorstel) return;
        const t = setInterval(() => setNu(new Date()), 60_000);
        return () => clearInterval(t);
    }, [voorstel]);

    useEffect(() => {
        setFout(null);
        setAfwijzen(false);
        setReden(null);
        setToelichting('');
    }, [voorstel?.id]);

    if (!voorstel) return null;

    const soort = VOORSTEL_SOORTEN[voorstel.proposal_type];
    const tijd = tijdOver(voorstel, nu);
    const magBevestigen = isTeBevestigen(voorstel, nu);
    const extern = soort?.zwaarte === 'extern';

    async function bevestig() {
        if (!voorstel) return;
        setBezig(true);
        setFout(null);
        try {
            const res = await bevestigVoorstel({
                id: voorstel.id,
                ...(gewijzigdePayload !== undefined ? { payload: gewijzigdePayload } : {}),
            });
            if (res.error) throw new Error(res.error);
            await onBevestigd?.(res.data!);
            onClose();
        } catch (e) {
            setFout(e instanceof Error ? e.message : 'Bevestigen mislukt');
        } finally {
            setBezig(false);
        }
    }

    async function wijsAf() {
        if (!voorstel) return;
        setBezig(true);
        setFout(null);
        try {
            const res = await annuleerVoorstel({
                id: voorstel.id,
                ...(reden ? { reden } : {}),
                ...(toelichting.trim() ? { toelichting: toelichting.trim() } : {}),
            });
            if (res.error) throw new Error(res.error);
            onGeannuleerd?.();
            onClose();
        } catch (e) {
            setFout(e instanceof Error ? e.message : 'Afwijzen mislukt');
        } finally {
            setBezig(false);
        }
    }

    return (
        <>
            <div className="mr-drawer-scrim" onClick={bezig ? undefined : onClose} />
            <div className="mr-drawer" style={{ maxWidth: 640 }}>
                <div className="mr-drawer-header">
                    <div className="mr-drawer-header-info">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 17, fontWeight: 600 }}>{soort?.titel ?? 'Voorstel'}</span>
                            {extern && (
                                <span
                                    style={{
                                        fontSize: 10,
                                        letterSpacing: '.1em',
                                        textTransform: 'uppercase',
                                        padding: '3px 8px',
                                        borderRadius: 999,
                                        border: '1px solid var(--border-strong)',
                                        color: 'var(--muted)',
                                    }}
                                >
                                    gaat naar buiten
                                </span>
                            )}
                        </div>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                fontSize: 12,
                                color: tijd.verlopen ? 'var(--red, #ff6b6b)' : 'var(--muted)',
                                marginTop: 5,
                            }}
                        >
                            <Clock size={12} />
                            {tijd.verlopen ? 'Verlopen — laat opnieuw maken' : `Geldig, ${tijd.tekst}`}
                        </div>
                    </div>
                    <button className="mr-drawer-close" onClick={onClose} aria-label="Sluiten" disabled={bezig}>
                        <X size={16} />
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 20px' }}>{children}</div>

                {afwijzen && (
                    <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 10 }}>
                            Waarom niet? Eén tik, en het systeem leert ervan.
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                            {AFWIJS_REDENEN.map((r) => (
                                <button
                                    key={r}
                                    onClick={() => setReden(reden === r ? null : r)}
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: 999,
                                        fontSize: 12.5,
                                        cursor: 'pointer',
                                        border: `1px solid ${reden === r ? 'var(--brand)' : 'var(--border)'}`,
                                        background: reden === r ? 'var(--brand-tint)' : 'transparent',
                                        color: 'var(--text)',
                                    }}
                                >
                                    {REDEN_LABELS[r]}
                                </button>
                            ))}
                        </div>
                        {reden === 'anders' && (
                            <textarea
                                rows={2}
                                value={toelichting}
                                onChange={(e) => setToelichting(e.target.value)}
                                placeholder="Wat klopt er niet?"
                                style={{
                                    width: '100%',
                                    padding: '8px 10px',
                                    borderRadius: 8,
                                    border: '1px solid var(--border)',
                                    background: 'var(--bg-card)',
                                    color: 'var(--text)',
                                    fontSize: 13,
                                    resize: 'vertical',
                                }}
                            />
                        )}
                    </div>
                )}

                <div className="mr-drawer-footer" style={{ padding: '14px 24px' }}>
                    {fout && (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 8,
                                fontSize: 12.5,
                                color: 'var(--red, #ff6b6b)',
                                marginBottom: 10,
                                lineHeight: 1.5,
                            }}
                        >
                            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                            {fout}
                        </div>
                    )}

                    {magBevestigen && !afwijzen && (
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.5 }}>
                            {soort?.gevolg}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 8 }}>
                        {afwijzen ? (
                            <>
                                <button
                                    onClick={wijsAf}
                                    disabled={bezig}
                                    style={{
                                        flex: 1,
                                        padding: '10px 16px',
                                        borderRadius: 8,
                                        border: '1px solid var(--border)',
                                        background: 'transparent',
                                        color: 'var(--text)',
                                        fontSize: 13.5,
                                        fontWeight: 600,
                                        cursor: bezig ? 'default' : 'pointer',
                                    }}
                                >
                                    {bezig ? 'Bezig…' : 'Afwijzen'}
                                </button>
                                <button
                                    onClick={() => setAfwijzen(false)}
                                    disabled={bezig}
                                    style={{
                                        padding: '10px 16px',
                                        borderRadius: 8,
                                        border: '1px solid var(--border)',
                                        background: 'transparent',
                                        color: 'var(--muted)',
                                        fontSize: 13.5,
                                        cursor: bezig ? 'default' : 'pointer',
                                    }}
                                >
                                    Terug
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={bevestig}
                                    disabled={bezig || !magBevestigen}
                                    style={{
                                        flex: 1,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 7,
                                        padding: '10px 16px',
                                        borderRadius: 8,
                                        border: '1px solid var(--border)',
                                        background: magBevestigen ? 'var(--brand)' : 'var(--card)',
                                        color: magBevestigen ? '#000' : 'var(--muted)',
                                        fontSize: 13.5,
                                        fontWeight: 600,
                                        cursor: bezig || !magBevestigen ? 'default' : 'pointer',
                                        opacity: bezig ? 0.6 : 1,
                                    }}
                                >
                                    {bezig ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                    {gewijzigdePayload !== undefined ? 'Opslaan zoals aangepast' : 'Akkoord'}
                                </button>
                                <button
                                    onClick={() => setAfwijzen(true)}
                                    disabled={bezig || !magBevestigen}
                                    style={{
                                        padding: '10px 16px',
                                        borderRadius: 8,
                                        border: '1px solid var(--border)',
                                        background: 'transparent',
                                        color: 'var(--muted)',
                                        fontSize: 13.5,
                                        cursor: bezig || !magBevestigen ? 'default' : 'pointer',
                                    }}
                                >
                                    Niet doen
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
