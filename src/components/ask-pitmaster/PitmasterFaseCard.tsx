'use client';
/* Pitmaster Ai fase-card — design-system build (Tool 06).
   Suggestie-chips die meebewegen met de event-fase: ver vooruit gaat over
   briefing & inkoop, vlak ervoor over prep & crew, na afloop over reflectie
   & factuur. Elke chip opent de bestaande Vraag-Rook drawer met prefill
   (zelfde sessionStorage + open-chat pattern als AskPitmasterButton). */

import { Sparkles, ClipboardList, ShoppingCart, Users, TrendingUp, Flag, Receipt, Mail, Calculator } from 'lucide-react';

interface EventCtx {
    id: string | number;
    name: string | null;
    date?: string | null;
    guests?: number | null;
    status?: string | null;
}

interface Props {
    event: EventCtx;
    daysLeft: number;
}

type Fase = 'ver' | 'dichtbij' | 'voltooid';

function detectFase(ev: EventCtx, daysLeft: number): Fase {
    if (ev.status === 'completed' || daysLeft < 0) return 'voltooid';
    return daysLeft <= 7 ? 'dichtbij' : 'ver';
}

const FASE_LABEL: Record<Fase, string> = { ver: 'Aankomend', dichtbij: 'Laatste week', voltooid: 'Afgerond' };

export default function PitmasterFaseCard({ event, daysLeft }: Props) {
    const fase = detectFase(event, daysLeft);
    const naam = (event.name || '').trim() || 'dit event';
    const gasten = event.guests || 0;

    const CHIPS: Record<Fase, Array<{ icon: typeof Sparkles; label: string; prompt: string }>> = {
        ver: [
            { icon: ClipboardList, label: `Stel een prep-schema op voor ${gasten} gasten`, prompt: `Stel een prep-schema op voor ${naam} met ${gasten} gasten. Werk terug vanaf de event-datum (${event.date || 'onbekend'}) met mise-en-place per dag.` },
            { icon: ShoppingCart, label: 'Bereken de boodschappenlijst voor dit menu', prompt: `Bereken de boodschappenlijst voor ${naam} (${gasten} gasten) op basis van het gekoppelde menu. Groepeer per leverancier.` },
            { icon: Users, label: 'Hoeveel crew heb ik nodig voor de service?', prompt: `Hoeveel crew heb ik nodig voor ${naam} met ${gasten} gasten? Geef bezetting per rol (vuur, buffet, service) en een briefing.` },
            { icon: TrendingUp, label: 'Check de marge — kan dit scherper?', prompt: `Bekijk de marge van ${naam}. Waar zit ruimte zonder de kwaliteit te raken? Denk aan portionering, foodcost en vaste kosten.` },
        ],
        dichtbij: [
            { icon: ClipboardList, label: 'Wat moet ik de komende dagen prepen?', prompt: `${naam} is over ${daysLeft} dagen. Geef een dag-voor-dag prep-checklist tot aan de service.` },
            { icon: Users, label: 'Stel een crew-briefing op', prompt: `Schrijf een korte crew-briefing voor ${naam} (${gasten} gasten): aankomsttijd, rolverdeling, timing van de gangen.` },
            { icon: ShoppingCart, label: 'Laatste inkoop — wat mis ik nog?', prompt: `Loop de inkoop voor ${naam} na. Wat moet er deze week nog besteld of opgehaald worden?` },
            { icon: Mail, label: 'Bevestig de details met de klant', prompt: `Schrijf een korte bevestigingsmail aan de klant van ${naam}: aankomsttijd, opbouw, aantal gasten en eventuele laatste vragen.` },
        ],
        voltooid: [
            { icon: Flag, label: 'Help me de reflectie schrijven', prompt: `Help me de reflectie voor ${naam} in te vullen: wat ging goed, wat kan beter, en concrete actie-items voor de volgende keer.` },
            { icon: Receipt, label: 'Zet de factuur op werkelijke uren klaar', prompt: `Maak de eindfactuur voor ${naam} op basis van de werkelijke uren en eventuele meerwerk. Wat moet ik controleren voor ik verstuur?` },
            { icon: Mail, label: 'Schrijf een bedankje aan de klant', prompt: `Schrijf een warm, kort bedankje aan de klant van ${naam} met een uitnodiging voor een review of vervolgboeking.` },
            { icon: Calculator, label: 'Wat hield ik netto over aan dit event?', prompt: `Reken uit wat ik netto overhield aan ${naam}: omzet minus foodcost, personeel en transport. Vergelijk met mijn doelmarge.` },
        ],
    };

    function openChat(prompt: string) {
        try {
            sessionStorage.setItem('ai_pitmaster_prefill', prompt);
            sessionStorage.setItem('ai_pitmaster_context_event_id', String(event.id));
        } catch { /* private mode */ }
        window.dispatchEvent(new CustomEvent('open-chat'));
    }

    const chips = CHIPS[fase];

    return (
        <div style={{
            borderRadius: 'var(--radius-xl, 14px)', overflow: 'hidden',
            background: 'linear-gradient(155deg, rgba(255,191,0,.10), rgba(196,163,90,.03) 60%, transparent)',
            border: '1px solid rgba(255,191,0,.18)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 10px' }}>
                <span style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, background: 'rgba(255,191,0,.14)', border: '1px solid rgba(255,191,0,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Sparkles size={15} color="var(--brand)" />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.2 }}>Pitmaster Ai</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>Suggesties voor de fase {FASE_LABEL[fase]}</div>
                </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '0 8px 8px' }}>
                {chips.map((c, i) => {
                    const I = c.icon;
                    return (
                        <button key={i} onClick={() => openChat(c.prompt)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left',
                                padding: '11px 12px', borderRadius: 9, border: 'none', cursor: 'pointer',
                                background: 'transparent', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
                                transition: 'background .12s',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,191,0,.06)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                            <I size={15} color="var(--brand-gold)" style={{ flexShrink: 0 }} />
                            <span style={{ flex: 1 }}>{c.label}</span>
                            <span style={{ color: 'var(--muted-light)', fontSize: 14 }}>↗</span>
                        </button>
                    );
                })}
            </div>
            <button onClick={() => openChat(`Ik heb een vraag over ${naam}.`)}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '11px 16px',
                    borderTop: '1px solid rgba(255,191,0,.12)', background: 'transparent', cursor: 'pointer',
                    color: 'var(--muted)', fontSize: 12.5, fontFamily: 'inherit',
                }}>
                <Sparkles size={13} color="var(--brand-gold)" /> Vraag de Pitmaster iets over dit event…
            </button>
        </div>
    );
}
