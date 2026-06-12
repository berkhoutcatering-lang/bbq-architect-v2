'use client';

import { useMemo } from 'react';
import { Check, Clock, Hourglass, Layers, ChevronRight } from 'lucide-react';
import type { PrepTask, DbEvent } from '@/types/database.types';
import { bouwWerkvolgorde, formatMin, type WerkBlok } from '@/lib/prep/werkvolgorde';

/**
 * WerklijstView — de "beste route door de prep"-modus van het kookbord.
 *
 * Pillar #2 (batch-bundeling): bundel-kaarten met som-hoeveelheid en één
 * "Alles klaar". Pillar #3 (dode-tijd-vulling): wacht-blokken tonen wat je
 * ondertussen kunt doen. Pillar #4: elke suggestie draagt zijn reden.
 * Alle volgorde-logica zit in lib/prep/werkvolgorde.ts (puur, getest).
 */

interface Props {
    tasks: PrepTask[];
    eventsById: Map<number, DbEvent>;
    onOpenTask: (task: PrepTask) => void;
    onCompleteTask: (task: PrepTask) => Promise<void>;
    onStartTask: (task: PrepTask) => Promise<void>;
}

export default function WerklijstView({ tasks, eventsById, onOpenTask, onCompleteTask, onStartTask }: Props) {
    const blokken = useMemo(() => bouwWerkvolgorde(tasks), [tasks]);

    const nu = blokken.find((b) => !b.isPassief);

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
            {nu && (
                <div className="werklijst__nu">
                    <span className="werklijst__nu-label">Nu doen</span>
                    <span className="werklijst__nu-titel">{nu.titel}</span>
                    <span className="werklijst__nu-meta">{formatMin(nu.durationMin)}</span>
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

function WerkBlokKaart({
    blok, eventsById, onOpenTask, onCompleteTask, onStartTask,
}: {
    blok: WerkBlok;
    eventsById: Map<number, DbEvent>;
    onOpenTask: (task: PrepTask) => void;
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
                <span className="werkblok__duur">{formatMin(blok.durationMin)}{blok.isPassief ? ' wachten' : ''}</span>
            </div>

            <div className="werkblok__body">
                <div className="werkblok__kop">
                    {isBundel && <Layers size={16} className="werkblok__bundel-icon" />}
                    <span className="werkblok__titel">{blok.titel}</span>
                    {blok.totalQty != null && (
                        <span className="werkblok__qty">{blok.totalQty} {blok.totalUnit ?? ''}</span>
                    )}
                </div>

                {isBundel && blok.bundelReden && (
                    <p className="werkblok__reden">{blok.bundelReden}</p>
                )}

                {isBundel ? (
                    <ul className="werkblok__subtaken">
                        {blok.tasks.map((t) => (
                            <li key={t.id}>
                                <button type="button" onClick={() => onOpenTask(t)}>
                                    <ChevronRight size={12} />
                                    <span>{t.text}</span>
                                    {t.target_qty != null && (
                                        <span className="werkblok__sub-qty">{t.target_qty} {t.target_unit ?? ''}</span>
                                    )}
                                </button>
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
                                    {s.titel} <span className="werkblok__sub-qty">({formatMin(s.durationMin)} — {s.reden})</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            <div className="werkblok__acties">
                {isBundel ? (
                    <button type="button" className="werkblok__klaar" onClick={allesKlaar}>
                        <Check size={16} />
                        <span>Alles klaar</span>
                    </button>
                ) : (
                    <button type="button" className="werkblok__klaar werkblok__klaar--ghost" onClick={() => onOpenTask(blok.tasks[0])}>
                        <span>Open</span>
                    </button>
                )}
            </div>
        </div>
    );
}
