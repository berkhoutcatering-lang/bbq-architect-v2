// HACCP demo data + types.
// V1: hardcoded zodat de UI volledig werkt. Phase 4 vervangt dit door
// Supabase-queries op events / recipes / haccp_records en Anthropic
// streaming voor de AI-checklist generatie.

export type HaccpCheckType =
    | 'ontvangst'
    | 'bewaring'
    | 'kern'
    | 'uitgifte'
    | 'regenereren';

export type RiskLevel = 'hoog' | 'middel' | 'laag';

export interface HaccpEvent {
    id: string;
    offerte?: string;
    title: string;
    client?: string;
    date: string;
    dayLabel?: string;
    servingTime: string;
    servingHour: number;
    guests: number;
    location?: string;
    type: string;
    status: 'bevestigd' | 'verzonden' | 'concept';
    setupTime?: string;
    crew?: number;
    isDish?: boolean;
    time?: string;
}

export interface UpcomingEvent {
    id: string;
    title: string;
    date: string;
    month: string;
    guests: number;
    time: string;
    status: 'bevestigd' | 'verzonden';
    type: string;
}

export interface HaccpDish {
    id: string;
    name: string;
    sub: string;
    risk: RiskLevel;
    prepStart: number;
    cookH: number;
    allergens: string[];
}

export interface HaccpCitation {
    sum: string;
    src: string;
    ref: string;
}

export interface HaccpCheck {
    id: string;
    dishIds: string[];
    type: HaccpCheckType;
    label: string;
    target: string;
    time: string;
    hour: number;
    risk: RiskLevel;
    enabled?: boolean;
    cite?: HaccpCitation;
}

export interface HaccpLogEntry {
    at: string;
    val: string;
    status: 'ok' | 'afwijking';
    by: string;
    anomaly?: string;
}

export interface PastDossier {
    id: string;
    title: string;
    date: string;
    guests: number;
    total: number;
    ok: number;
    anomalies: number;
}

export interface AllDish {
    id: string;
    name: string;
    cat: string;
    tmpl: boolean;
}

export type CitationMode = 'tooltip' | 'inline' | 'expandable';

export const CHECK_TYPES: Record<HaccpCheckType, { label: string; color: string; bg: string }> = {
    ontvangst:   { label: 'Ontvangst',   color: '#3b82f6', bg: 'rgba(59,130,246,.12)' },
    bewaring:    { label: 'Bewaring',    color: '#a78bfa', bg: 'rgba(167,139,250,.12)' },
    kern:        { label: 'Kerntemp',    color: '#f59e0b', bg: 'rgba(245,158,11,.12)' },
    uitgifte:    { label: 'Uitgifte',    color: '#22c55e', bg: 'rgba(34,197,94,.12)' },
    regenereren: { label: 'Regenereren', color: '#f97316', bg: 'rgba(249,115,22,.12)' },
};

export const HACCP_EVENT: HaccpEvent = {
    id: 'evt-2026-0047',
    offerte: 'OFF-2026-0142',
    title: 'Bruiloft Van Dijk',
    client: 'Familie Van Dijk',
    date: '2026-05-20',
    dayLabel: 'wo 20 mei',
    servingTime: '17:00',
    servingHour: 17,
    guests: 120,
    location: 'Landgoed Duinzicht, Wassenaar',
    type: 'Full service',
    status: 'bevestigd',
    setupTime: '14:00',
    crew: 4,
};

export const HACCP_UPCOMING: UpcomingEvent[] = [
    { id: 'evt-2026-0047', title: 'Bruiloft Van Dijk',       date: '20', month: 'mei', guests: 120, time: '17:00', status: 'bevestigd', type: 'Full service' },
    { id: 'evt-2026-0045', title: 'Buurtfeest Scheveningen', date: '18', month: 'mei', guests:  65, time: '18:30', status: 'bevestigd', type: 'Hot Smoker' },
    { id: 'evt-2026-0048', title: 'Teamuitje ING',           date: '22', month: 'mei', guests:  40, time: '12:00', status: 'verzonden', type: 'Lunch BBQ' },
    { id: 'evt-2026-0051', title: 'Bedrijfsfeest KPN',       date: '02', month: 'jun', guests: 250, time: '15:00', status: 'bevestigd', type: 'Festival setup' },
];

export const HACCP_DISHES: HaccpDish[] = [
    { id: 'd1', name: 'Pulled Pork',    sub: 'Low & slow 14u, schouder',   risk: 'hoog',   prepStart:  3, cookH: 14, allergens: ['sulfiet'] },
    { id: 'd2', name: 'Smoked Brisket', sub: 'Angus, 12u eikenhout',       risk: 'hoog',   prepStart:  5, cookH: 12, allergens: [] },
    { id: 'd3', name: 'Coleslaw',       sub: 'Huisgemaakt, rode kool',     risk: 'laag',   prepStart: 10, cookH:  1, allergens: ['ei', 'mosterd'] },
    { id: 'd4', name: 'Cornbread',      sub: 'Boter van thuiskarn',        risk: 'middel', prepStart: 14, cookH:  1, allergens: ['gluten', 'lactose', 'ei'] },
    { id: 'd5', name: 'BBQ Saus Trio',  sub: 'Smoky · Carolina · Mustard', risk: 'laag',   prepStart:  9, cookH:  2, allergens: ['mosterd', 'sulfiet'] },
];

export const HACCP_AI_CHECKS: HaccpCheck[] = [
    {
        id: 'c1', dishIds: ['d1', 'd2'], type: 'ontvangst',
        label: 'Ontvangst rund- en varkensvlees', target: '≤ 7°C kerntemp',
        time: '02:00', hour: 2, risk: 'hoog',
        cite: { sum: 'EU 852/2004 Art. 5 lid 1 + Recept Pulled Pork v3', src: 'EU Verordening (EG) Nr. 852/2004', ref: 'Artikel 5, lid 1 — HACCP-beginselen' },
    },
    {
        id: 'c2', dishIds: ['d3', 'd4', 'd5'], type: 'ontvangst',
        label: 'Ontvangst groenten, meel & kruiden', target: 'Visueel + THT-controle',
        time: '08:00', hour: 8, risk: 'laag',
        cite: { sum: 'Intern handboek §3.1 Ontvangstcontrole', src: 'HACCP-handboek Hop & Bites', ref: '§3.1 — Ontvangstprotocol' },
    },
    {
        id: 'c3', dishIds: ['d1', 'd2'], type: 'bewaring',
        label: 'Koelcel-check vlees voor rook', target: '≤ 4°C',
        time: '02:30', hour: 2.5, risk: 'hoog',
        cite: { sum: 'EU 853/2004 Bijlage III + Recept Brisket v2', src: 'EU Verordening (EG) Nr. 853/2004', ref: 'Bijlage III, Sectie I' },
    },
    {
        id: 'c4', dishIds: ['d1'], type: 'kern',
        label: 'Kerntemp pulled pork na 14u roken', target: '≥ 93°C (pulled texture)',
        time: '16:00', hour: 16, risk: 'hoog',
        cite: { sum: 'Recept Pulled Pork v3 §gaarpunt + RIVM richtlijnen', src: 'Recept Pulled Pork v3', ref: '§ Gaarpunt — minimaal 93°C voor pull' },
    },
    {
        id: 'c5', dishIds: ['d2'], type: 'kern',
        label: 'Kerntemp brisket na 12u roken', target: '≥ 90°C (sliceable)',
        time: '16:30', hour: 16.5, risk: 'hoog',
        cite: { sum: 'Recept Smoked Brisket v2 §gaarpunt', src: 'Recept Smoked Brisket v2', ref: '§ Gaarpunt — 90°C voor ideale textuur' },
    },
    {
        id: 'c6', dishIds: ['d4'], type: 'kern',
        label: 'Kerntemp cornbread', target: '≥ 75°C',
        time: '15:00', hour: 15, risk: 'middel',
        cite: { sum: 'EU 852/2004 Bijlage II H. IX + Recept Cornbread v1', src: 'EU Verordening (EG) Nr. 852/2004', ref: 'Bijlage II, Hoofdstuk IX' },
    },
    {
        id: 'c7', dishIds: ['d1'], type: 'regenereren',
        label: 'Regenereren pulled pork na rust', target: '≥ 75°C in ≤ 2u',
        time: '16:30', hour: 16.5, risk: 'hoog',
        cite: { sum: 'NVWA Infoblad 75 + EU 852/2004 Art. 5', src: 'NVWA Infoblad 75', ref: 'Regenereren vleesproducten' },
    },
    {
        id: 'c8', dishIds: ['d1', 'd2'], type: 'uitgifte',
        label: 'Serveertemperatuur vlees', target: '≥ 65°C',
        time: '17:00', hour: 17, risk: 'hoog',
        cite: { sum: 'Warenwetbesluit Hygiëne Art. 4 + EU 852/2004', src: 'Warenwetbesluit Hygiëne', ref: 'Artikel 4 — Temperatuureisen uitgifte' },
    },
    {
        id: 'c9', dishIds: ['d3'], type: 'uitgifte',
        label: 'Serveertemperatuur coleslaw', target: '≤ 7°C',
        time: '16:45', hour: 16.75, risk: 'middel',
        cite: { sum: 'EU 852/2004 Bijlage II H. IX lid 5', src: 'EU Verordening (EG) Nr. 852/2004', ref: 'Bijlage II, H. IX, lid 5' },
    },
    {
        id: 'c10', dishIds: ['d5'], type: 'uitgifte',
        label: 'Saus portionering & temperatuur', target: '≤ 7°C (koud) / ≥ 65°C (warm)',
        time: '16:45', hour: 16.75, risk: 'laag',
        cite: { sum: 'Intern handboek §4.3 Sauzen', src: 'HACCP-handboek Hop & Bites', ref: '§4.3 — Sausprotocol' },
    },
];

export const HACCP_LOG_ENTRIES: Record<string, HaccpLogEntry> = {
    c1:  { at: '02:05', val: '4.2°C',                status: 'ok',        by: 'Demo-chef' },
    c2:  { at: '08:12', val: 'THT OK · visueel OK',  status: 'ok',        by: 'Thomas K.' },
    c3:  { at: '02:35', val: '3.1°C',                status: 'ok',        by: 'Demo-chef' },
    c4:  { at: '16:08', val: '96°C',                 status: 'ok',        by: 'Demo-chef' },
    c5:  { at: '16:42', val: '91°C',                 status: 'ok',        by: 'Thomas K.' },
    c6:  { at: '15:15', val: '78°C',                 status: 'ok',        by: 'Thomas K.' },
    c7:  { at: '16:40', val: '79°C',                 status: 'ok',        by: 'Demo-chef' },
    c8:  { at: '17:05', val: '68°C',                 status: 'ok',        by: 'Demo-chef' },
    c9:  { at: '16:50', val: '8.1°C',                status: 'afwijking', by: 'Thomas K.', anomaly: 'Koeling 8.1°C — wijkt af van jouw gemiddelde 3.4°C. Sensor check?' },
    c10: { at: '16:48', val: '5°C',                  status: 'ok',        by: 'Thomas K.' },
};

export const HACCP_PAST_DOSSIERS: PastDossier[] = [
    { id: 'dos-1', title: 'Buurtfeest Scheveningen', date: 'za 18 mei', guests: 65, total:  8, ok: 8, anomalies: 0 },
    { id: 'dos-2', title: 'Opening Brasserie Noord', date: 'do 24 apr', guests: 80, total: 10, ok: 9, anomalies: 1 },
    { id: 'dos-3', title: 'Verjaardag De Vries',     date: 'zo 27 apr', guests: 30, total:  6, ok: 6, anomalies: 0 },
    { id: 'dos-4', title: 'Teamuitje ING',           date: 'di 22 apr', guests: 40, total:  7, ok: 7, anomalies: 0 },
];

export const HACCP_ALL_DISHES: AllDish[] = [
    { id: 'rd1',  name: 'Pulled Pork',        cat: 'Vlees',      tmpl: true  },
    { id: 'rd2',  name: 'Smoked Brisket',     cat: 'Vlees',      tmpl: true  },
    { id: 'rd3',  name: 'Spare Ribs',         cat: 'Vlees',      tmpl: true  },
    { id: 'rd4',  name: 'Chicken Wings',      cat: 'Vlees',      tmpl: false },
    { id: 'rd5',  name: 'Coleslaw',           cat: 'Bijgerecht', tmpl: true  },
    { id: 'rd6',  name: 'Cornbread',          cat: 'Bijgerecht', tmpl: true  },
    { id: 'rd7',  name: 'Mac & Cheese',       cat: 'Bijgerecht', tmpl: false },
    { id: 'rd8',  name: 'BBQ Saus Trio',      cat: 'Saus',       tmpl: true  },
    { id: 'rd9',  name: 'Rookworst',          cat: 'Vlees',      tmpl: false },
    { id: 'rd10', name: 'Gegrilde Groenten',  cat: 'Bijgerecht', tmpl: false },
];

export const STEP_META = [
    { label: 'Kies',      icon: 'hand' },
    { label: 'AI Plan',   icon: 'sparkles' },
    { label: 'Aanpassen', icon: 'sliders-horizontal' },
    { label: 'Loggen',    icon: 'clipboard-check' },
    { label: 'Dossier',   icon: 'folder-check' },
] as const;
