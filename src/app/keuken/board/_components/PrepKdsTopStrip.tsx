'use client';

import { X, ChefHat, HandPlatter, CalendarPlus } from 'lucide-react';

interface Props {
    /** Aantal taken in zicht — wordt door client gefilterd op modus + filters. */
    visibleTaskCount: number;
    /** Aantal events in zicht. */
    visibleEventCount: number;
    /** Huidige modus. */
    modus: 'mep' | 'service';
    onModusChange: (m: 'mep' | 'service') => void;
    /** Verberg de MEP/Service-toggle. Default false. Gezet door /keuken/kookbord
     *  omdat service-modus is verhuisd naar /events/[id]/service/plattegrond. */
    hideModusToggle?: boolean;
    /** Toont een "Plannen"-knop die de PlanTakenSheet opent (alleen kookbord). */
    onPlanClick?: () => void;
    /** Exit terug naar normale app of (in display-mode) opnieuw inloggen. */
    onExit: () => void;
    /** True als ?display=true — toont alleen X als exit-cta. */
    isDisplayMode?: boolean;
}

/**
 * Top-strip voor /keuken/board — 56px hoog.
 * Links: event/taken/dag context.
 * Midden: MEP ⇄ Service modus-toggle (segment-control).
 * Rechts: klok + exit.
 *
 * Pillar #3 (Gloved-hand-first): tap-targets ≥44px, modus-toggle 56pt.
 */
export default function PrepKdsTopStrip({
    visibleTaskCount,
    visibleEventCount,
    modus,
    onModusChange,
    hideModusToggle,
    onPlanClick,
    onExit,
    isDisplayMode,
}: Props) {
    const now = new Date();
    const klok = now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

    return (
        <div className="kds-top-strip prep-top-strip">
            <div className="kds-top-event">
                <span className="kds-top-event__name">
                    {hideModusToggle ? 'Kookbord' : (modus === 'mep' ? 'Mise-en-place' : 'Service')}
                </span>
                <span className="kds-top-event__meta">
                    {visibleTaskCount} {visibleTaskCount === 1 ? 'taak' : 'taken'}
                    {visibleEventCount > 0 && ` · ${visibleEventCount} ${visibleEventCount === 1 ? 'event' : 'events'}`}
                </span>
            </div>

            {!hideModusToggle && (
                <div className="prep-modus-toggle" role="tablist" aria-label="KDS modus">
                    <button
                        role="tab"
                        aria-selected={modus === 'mep'}
                        className={`prep-modus-pill ${modus === 'mep' ? 'is-active' : ''}`}
                        onClick={() => onModusChange('mep')}
                    >
                        <ChefHat size={16} />
                        <span>MEP</span>
                    </button>
                    <button
                        role="tab"
                        aria-selected={modus === 'service'}
                        className={`prep-modus-pill ${modus === 'service' ? 'is-active' : ''}`}
                        onClick={() => onModusChange('service')}
                    >
                        <HandPlatter size={16} />
                        <span>Service</span>
                    </button>
                </div>
            )}

            {onPlanClick && (
                <button
                    type="button"
                    className="kds-top-plan"
                    onClick={onPlanClick}
                    title="Prep-taken plannen voor komende events"
                >
                    <CalendarPlus size={16} />
                    <span>Plannen</span>
                </button>
            )}

            <div className="kds-top-clock">
                <span className="kds-top-clock__time">{klok}</span>
                <span className="kds-top-clock__schedule" style={{ color: 'var(--muted)' }}>
                    {isDisplayMode ? 'Display' : 'Live'}
                </span>
            </div>
            <button
                onClick={onExit}
                className="kds-top-exit"
                aria-label={isDisplayMode ? 'Apparaat ontkoppelen' : 'Terug naar app'}
                title={isDisplayMode ? 'Apparaat ontkoppelen' : 'Terug naar app (ESC)'}
            >
                <X size={20} />
            </button>
        </div>
    );
}
