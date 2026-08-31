'use client';

import { useMemo } from 'react';
import { Check, Clock, Hourglass, Layers, ChevronRight, Home, Truck, MapPin, Eye } from 'lucide-react';
import type { PrepTask } from '@/types/database.types';
import {
    bouwWerkvolgorde, budgetPerPlaats, formatMin,
    type WerkBlok,
} from '@/lib/prep/werkvolgorde';
import type { Plaats } from '@/lib/prep/stapPlanning';

/**
 * WerklijstView — de "beste route door de prep"-modus van het kookbord.
 *
 * Pillar #2 (batch-bundeling): bundel-kaarten met som-hoeveelheid en één
 * "Alles klaar". Pillar #3 (dode-tijd-vulling): wacht-blokken tonen wat je
 * ondertussen kunt doen. Pillar #4: elke suggestie draagt zijn reden.
 * Alle volgorde-logica zit in lib/prep/werkvolgorde.ts (puur, getest).
 *
 * Golf 2 toont drie dingen die er eerder niet stonden: handtijd naast
 * wachttijd per blok, een budget per plaats bovenaan (thuis is een ochtend,
 * locatie is de minuten waarin tachtig mensen wachten), en bundels van dezelfde
 * bewerking over recepten heen. Waar een duur nergens is opgeschreven staat er
 * "duur onbekend" — geen geschat kwartier dat zich voordoet als een meting.
 */

interface EventNaam { name?: string | null }

interface Props {
    tasks: PrepTask[];
    eventsById: Map<number, EventNaam>;
    /** Optioneel. Zonder deze prop worden subtaken tekst in plaats van knoppen —
        liever geen knop dan een knop die niets doet. */
    onOpenTask?: (task: PrepTask) => void;
    onCompleteTask: (task: PrepTask) => Promise<void>;
    onStartTask: (task: PrepTask) => Promise<void>;
}

const PLAATS_LABEL: Record<Plaats, string> = {
    thuis: 'Thuis',
    bus: 'In de bus',
    locatie: 'Op locatie',
};

function PlaatsIcoon({ plaats, size = 13 }: { plaats: Plaats; size?: number }) {
    if (plaats === 'locatie') return <MapPin size={size} />;
    if (plaats === 'bus') return <Truck size={size} />;
    return <Home size={size} />;
}

export default function WerklijstView({ tasks, eventsById, onOpenTask, onCompleteTask, onStartTask }: Props) {
    const blokken = useMemo(() => bouwWerkvolgorde(tasks), [tasks]);
    const budget = useMemo(() => budgetPerPlaats(blokken), [blokken]);

    const nu = blokken.find((b) => !b.isPassief);
    const plaatsen = (Object.keys(budget) as Plaats[]).filter((p) => budget[p].blokken > 0);

    if (blokken.length === 0) {
        return (
            <div className="prep-board__empty">
                <p>Geen open taken in dit datumvenster.</p>
                <p className="prep-board__hint">Plan taken via de Plannen-knop, of kies een ruimer filter.</p>
            </div>
        );
    }

    return (
        <div className="werklijst" role="region" aria-label="Werklijst">
            {plaatsen.length > 0 && (
                <div className="werklijst__budget">
                    {plaatsen.map((p) => (
                        <div key={p} className={`werklijst__budget-vak werklijst__budget-vak--${p}`}>
                            <span className="werklijst__budget-kop">
                                <PlaatsIcoon plaats={p} />
                                {PLAATS_LABEL[p]}
                            </span>
                            <span className="werklijst__budget-hand">{formatMin(budget[p].actiefMin)} werk</span>
                            <span className="werklijst__budget-sub">
                                {budget[p].passiefMin > 0 ? `${formatMin(budget[p].passiefMin)} wachten · ` : ''}
                                {budget[p].blokken} {budget[p].blokken === 1 ? 'blok' : 'blokken'}
                                {budget[p].geschat > 0 ? ` · ${budget[p].geschat} zonder opgegeven duur` : ''}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {nu && (
                <div className="werklijst__nu">
                    <span className="werklijst__nu-label">Nu doen</span>
                    <span className="werklijst__nu-titel">{nu.titel}</span>
                    <span className="werklijst__nu-meta">{duurTekst(nu)}</span>
                </div>
            )}

            <div className="werklijst__lijst">
                {blokken.map((blok) => (
                    <WerkBlokKaart
                        key={blok.key}
                        blok={blok}
                        eventsById={eventsById}
                        onOpenTask={onOpenTask}
                        onCompleteTask={onCompleteTask}
                        onStartTask={onStartTask}
                    />
                ))}
            </div>
        </div>
    );
}

/**
 * De duur van een blok in mensentaal.
 *
 * Het hele punt van golf 2 staat in deze regel: "15 min werk · 12 uur wachten"
 * vertelt je dat je die twaalf uur ergens anders kunt zijn, en één getal van
 * 735 minuten deed dat niet.
 */
function duurTekst(blok: WerkBlok): string {
    if (!blok.duurBekend) return 'duur onbekend';
    const delen: string[] = [];
    if (blok.actiefMin > 0) delen.push(`${formatMin(blok.actiefMin)} werk`);
    if (blok.passiefMin > 0) delen.push(`${formatMin(blok.passiefMin)} wachten`);
    return delen.length > 0 ? delen.join(' · ') : 'geen tijd bekend';
}

function WerkBlokKaart({
    blok, eventsById, onOpenTask, onCompleteTask, onStartTask,
}: {
    blok: WerkBlok;
    eventsById: Map<number, EventNaam>;
    onOpenTask?: (task: PrepTask) => void;
    onCompleteTask: (task: PrepTask) => Promise<void>;
    onStartTask: (task: PrepTask) => Promise<void>;
}) {
    const isBundel = blok.tasks.length > 1;
    const tijd = blok.startISO
        ? new Date(blok.startISO).toLocaleString('nl-NL', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
        : 'geen tijd';
    const eventNamen = blok.eventIds
        .map((id) => eventsById.get(id)?.name)
        .filter(Boolean) as string[];
    /* Alleen als een receptstap het écht zegt. Eerder stond hier een afleiding
       uit `priority`, maar dat veld is de sorteervolgorde van een sjabloon —
       elke inkoop-taak kreeg zo een toezicht-badge die nergens op sloeg. */
    const toezicht = blok.tasks.some((t) => t.toezicht_nodig === true);

    async function allesKlaar() {
        for (const t of blok.tasks) {
            const status = t.status ?? 'planned';
            if (status === 'in_progress') {
                await onCompleteTask(t);
            } else {
                await onStartTask(t);
                await onCompleteTask(t);
            }
        }
    }

    return (
        <div className={`werkblok ${blok.isPassief ? 'werkblok--wacht' : ''}`}>
            <div className="werkblok__tijd">
                {blok.isPassief ? <Hourglass size={14} /> : <Clock size={14} />}
                <span>{tijd}</span>
                <span className="werkblok__duur">{duurTekst(blok)}</span>
            </div>

            <div className="werkblok__body">
                <div className="werkblok__kop">
                    {isBundel && <Layers size={16} className="werkblok__bundel-icon" />}
                    <span className="werkblok__titel">{blok.titel}</span>
                    {blok.totalQty != null && (
                        <span className="werkblok__qty">{blok.totalQty} {blok.totalUnit ?? ''}</span>
                    )}
                    {blok.plaats && blok.plaats !== 'thuis' && (
                        <span className={`werkblok__plaats werkblok__plaats--${blok.plaats}`}>
                            <PlaatsIcoon plaats={blok.plaats} size={12} />
                            {PLAATS_LABEL[blok.plaats]}
                        </span>
                    )}
                    {toezicht && (
                        <span className="werkblok__toezicht" title="Hier moet iemand bij blijven">
                            <Eye size={12} /> toezicht
                        </span>
                    )}
                </div>

                {isBundel && blok.bundelReden && (
                    <p className="werkblok__reden">{blok.bundelReden}</p>
                )}

                {isBundel ? (
                    <ul className="werkblok__subtaken">
                        {blok.tasks.map((t) => (
                            <li key={t.id}>
                                {onOpenTask ? (
                                    <button type="button" onClick={() => onOpenTask(t)}>
                                        <ChevronRight size={12} />
                                        <span>{t.text}</span>
                                        {t.target_qty != null && (
                                            <span className="werkblok__sub-qty">{t.target_qty} {t.target_unit ?? ''}</span>
                                        )}
                                    </button>
                                ) : (
                                    <span className="werkblok__subtaak">
                                        <ChevronRight size={12} />
                                        <span>{t.text}</span>
                                        {t.target_qty != null && (
                                            <span className="werkblok__sub-qty">{t.target_qty} {t.target_unit ?? ''}</span>
                                        )}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                ) : (
                    eventNamen.length > 0 && (
                        <p className="werkblok__event">{eventNamen.join(' · ')}</p>
                    )
                )}

                {blok.ondertussen && blok.ondertussen.length > 0 && (
                    <div className="werkblok__ondertussen">
                        <span className="werkblok__ondertussen-label">Tijdens het wachten:</span>
                        <ul>
                            {blok.ondertussen.map((s) => (
                                <li key={s.blokKey}>
                                    {s.titel} <span className="werkblok__sub-qty">({formatMin(s.durationMin)} werk — {s.reden})</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            <div className="werkblok__acties">
                <button type="button" className="werkblok__klaar" onClick={allesKlaar}>
                    <Check size={16} />
                    <span>{isBundel ? 'Alles klaar' : 'Klaar'}</span>
                </button>
                {!isBundel && onOpenTask && (
                    <button type="button" className="werkblok__klaar werkblok__klaar--ghost" onClick={() => onOpenTask(blok.tasks[0])}>
                        <span>Open</span>
                    </button>
                )}
            </div>
        </div>
    );
}
