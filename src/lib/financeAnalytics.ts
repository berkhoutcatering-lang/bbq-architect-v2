/**
 * Finance Analytics — pure functies voor cashflow, aging, DSO, concentratie.
 * ─────────────────────────────────────────────────────────────────────────
 * Geen Anthropic-calls, geen Supabase-imports. Krijgt bonnen/facturen/events
 * als input → returnt berekend resultaat. Hierdoor:
 *   - Unit-testbaar zonder DB-mocks
 *   - Server-side veilig (kan in cron, server actions, API routes)
 *   - Client-side hergebruikbaar voor live calculaties
 *
 * Pillars threaded:
 *   #1 13-weken cashflow obv accepted offertes + vaste kosten + openstaande facturen
 *   #2 DSO + Aging buckets (0-30/30-60/60-90/90+)
 *   #4 Klant-concentratie (>30% = warning)
 */

export interface FactuurMin {
    id?: number | string;
    nummer?: string;
    client_naam?: string;
    datum?: string;
    vervaldatum?: string | null;
    betaaldatum?: string | null;
    status?: string;
    items?: Array<{ qty?: number; prijs?: number; btw?: number }> | null;
}

export interface BonMin {
    datum?: string;
    totaal_bedrag?: number | string;
    rgs_code?: string | null;
    is_recurring?: boolean | null;
}

export interface OfferteMin {
    datum?: string;
    status?: string;
    aantal_gasten?: number;
    basis_prijs_pp?: number;
    vaste_kosten?: Array<{ bedrag?: number | string }>;
    event_id?: number | null;
}

export interface EventMin {
    id?: number;
    date?: string;
    guests?: number;
    ppp?: number;
    status?: string;
}

/* ────────────────────────────────────────────────────────────────────────
 * Aging + DSO — Pillar #2
 * ──────────────────────────────────────────────────────────────────────── */

export interface AgingBucket {
    label: '0-30' | '30-60' | '60-90' | '90+';
    count: number;
    bedrag: number;
    facturen: Array<{ id: number | string; nummer: string; client: string; bedrag: number; dagen_oud: number; vervaldatum: string }>;
}

export interface AgingResult {
    /** Days Sales Outstanding — gemiddelde tijd tussen factuurdatum en betaaldatum (betaalde facturen). */
    dso_days: number;
    /** Totaal openstaand bedrag in alle buckets. */
    totaal_openstaand: number;
    buckets: AgingBucket[];
}

function lineTotal(items: FactuurMin['items']): number {
    if (!Array.isArray(items)) return 0;
    return items.reduce((s, it) => s + ((it.qty || 0) * (it.prijs || 0) * (1 + (it.btw || 0) / 100)), 0);
}

export function computeAging(facturen: FactuurMin[], today: Date = new Date()): AgingResult {
    /* DSO uit BETAALDE facturen — som van (betaaldatum - factuurdatum), gemiddeld. */
    let dsoSum = 0;
    let dsoCount = 0;
    for (const f of facturen) {
        if (f.status === 'betaald' && f.betaaldatum && f.datum) {
            const diff = (new Date(f.betaaldatum).getTime() - new Date(f.datum).getTime()) / 86400000;
            if (diff >= 0 && diff < 365) {
                dsoSum += diff;
                dsoCount += 1;
            }
        }
    }
    const dso_days = dsoCount > 0 ? Math.round(dsoSum / dsoCount) : 0;

    /* Aging buckets uit OPENSTAANDE facturen. Vervaldatum-basis: hoe veel
       dagen geleden de vervaldatum is verstreken. Geen vervaldatum =
       fallback naar factuurdatum + 30. */
    const buckets: AgingResult['buckets'] = [
        { label: '0-30', count: 0, bedrag: 0, facturen: [] },
        { label: '30-60', count: 0, bedrag: 0, facturen: [] },
        { label: '60-90', count: 0, bedrag: 0, facturen: [] },
        { label: '90+', count: 0, bedrag: 0, facturen: [] },
    ];

    let totaal_openstaand = 0;

    for (const f of facturen) {
        if (f.status === 'betaald' || f.status === 'geannuleerd' || f.status === 'concept') continue;
        if (!f.datum) continue;
        const vervalDate = f.vervaldatum
            ? new Date(f.vervaldatum)
            : new Date(new Date(f.datum).getTime() + 30 * 86400000);
        const dagen_oud = Math.floor((today.getTime() - vervalDate.getTime()) / 86400000);
        const bedrag = lineTotal(f.items);
        if (bedrag <= 0) continue;
        totaal_openstaand += bedrag;

        let bucketIdx = 0;
        if (dagen_oud >= 90) bucketIdx = 3;
        else if (dagen_oud >= 60) bucketIdx = 2;
        else if (dagen_oud >= 30) bucketIdx = 1;
        else bucketIdx = 0;

        buckets[bucketIdx].count += 1;
        buckets[bucketIdx].bedrag += bedrag;
        buckets[bucketIdx].facturen.push({
            id: f.id ?? f.nummer ?? '?',
            nummer: f.nummer || '—',
            client: f.client_naam || 'Onbekend',
            bedrag: Math.round(bedrag),
            dagen_oud,
            vervaldatum: vervalDate.toISOString().slice(0, 10),
        });
    }

    return { dso_days, totaal_openstaand: Math.round(totaal_openstaand), buckets };
}

/* ────────────────────────────────────────────────────────────────────────
 * Klant-concentratie — Pillar #4
 * ──────────────────────────────────────────────────────────────────────── */

export interface ConcentrationResult {
    top_client: string | null;
    top_client_omzet: number;
    top_client_pct: number;
    totaal_omzet: number;
    /** True bij >30% van YTD omzet uit 1 klant. KvK MKB-Risico-Index 2025 drempel. */
    warning: boolean;
    /** Top 3 klanten met %. */
    top3: Array<{ naam: string; omzet: number; pct: number }>;
}

const CONCENTRATION_THRESHOLD = 0.30;

export function computeConcentration(facturen: FactuurMin[]): ConcentrationResult {
    const perClient: Record<string, number> = {};
    let totaal = 0;
    for (const f of facturen) {
        if (f.status !== 'betaald') continue;
        const t = lineTotal(f.items);
        if (t <= 0) continue;
        const naam = f.client_naam || 'Onbekend';
        perClient[naam] = (perClient[naam] || 0) + t;
        totaal += t;
    }
    const sorted = Object.entries(perClient)
        .map(([naam, omzet]) => ({ naam, omzet, pct: totaal > 0 ? omzet / totaal : 0 }))
        .sort((a, b) => b.omzet - a.omzet);

    const top = sorted[0];
    return {
        top_client: top?.naam || null,
        top_client_omzet: Math.round(top?.omzet || 0),
        top_client_pct: top ? Math.round(top.pct * 1000) / 10 : 0,
        totaal_omzet: Math.round(totaal),
        warning: !!top && top.pct > CONCENTRATION_THRESHOLD,
        top3: sorted.slice(0, 3).map(c => ({ naam: c.naam, omzet: Math.round(c.omzet), pct: Math.round(c.pct * 1000) / 10 })),
    };
}

/* ────────────────────────────────────────────────────────────────────────
 * 13-weken Cashflow forecast — Pillar #1
 * ──────────────────────────────────────────────────────────────────────── */

export interface CashflowWeek {
    week_start: string;       /* ISO yyyy-mm-dd, maandag */
    week_label: string;       /* "W23" */
    inkomend: number;         /* verwacht uit accepted offertes + open facturen */
    uitgaand: number;         /* vaste kosten + bekende recurring bonnen */
    netto: number;            /* inkomend - uitgaand */
    cumulatief: number;       /* lopend saldo vanaf start_balance */
    risico: boolean;          /* cumulatief < buffer_grens */
}

export interface CashflowResult {
    start_balance: number;
    buffer_grens: number;
    weeks: CashflowWeek[];
    /** Index van eerste week met risico=true, of -1 als geen. */
    first_risk_week_index: number;
    totaal_inkomend_13w: number;
    totaal_uitgaand_13w: number;
}

export interface CashflowInputs {
    /** Huidige kaspositie. Default 0 (we kennen geen banksaldo zonder integratie). */
    start_balance?: number;
    /** Minimumbuffer. Onder dit getal kleurt week rood. Default €2.500. */
    buffer_grens?: number;
    /** Maandelijkse vaste lasten (huur/abo's/verzekering). Worden door 4,33 gedeeld voor wekelijks. */
    monthly_fixed_costs?: number;
    /** Vandaag (override voor tests). */
    today?: Date;
}

export function computeCashflow(
    offertes: OfferteMin[],
    facturen: FactuurMin[],
    events: EventMin[],
    bonnen: BonMin[],
    inputs: CashflowInputs = {},
): CashflowResult {
    const today = inputs.today || new Date();
    const start_balance = inputs.start_balance ?? 0;
    const buffer_grens = inputs.buffer_grens ?? 2500;
    const monthly_fixed = inputs.monthly_fixed_costs ?? 0;
    const weekly_fixed = monthly_fixed / 4.33;

    /* 13 weken-grid: vandaag → 91 dagen vooruit, gegroepeerd per ISO-week. */
    const weeks: CashflowWeek[] = [];
    const monday = (d: Date) => {
        const x = new Date(d);
        const day = x.getDay() || 7;
        x.setDate(x.getDate() - day + 1);
        x.setHours(0, 0, 0, 0);
        return x;
    };
    const isoWeek = (d: Date) => {
        const target = new Date(d);
        target.setHours(0, 0, 0, 0);
        target.setDate(target.getDate() + 3 - (target.getDay() || 7));
        const week1 = new Date(target.getFullYear(), 0, 4);
        return 1 + Math.round(((target.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() || 7) - 1)) / 7);
    };

    const startMon = monday(today);
    for (let i = 0; i < 13; i++) {
        const ws = new Date(startMon);
        ws.setDate(ws.getDate() + i * 7);
        weeks.push({
            week_start: ws.toISOString().slice(0, 10),
            week_label: `W${isoWeek(ws)}`,
            inkomend: 0,
            uitgaand: Math.round(weekly_fixed),
            netto: 0,
            cumulatief: 0,
            risico: false,
        });
    }

    const weekOf = (dateStr: string): number => {
        if (!dateStr) return -1;
        const d = new Date(dateStr);
        if (Number.isNaN(d.getTime())) return -1;
        const diff = Math.floor((d.getTime() - startMon.getTime()) / 86400000);
        if (diff < 0) return -1;
        const wk = Math.floor(diff / 7);
        return wk < 13 ? wk : -1;
    };

    /* INKOMEND laag 1: openstaande facturen — vervaldatum bepaalt week. */
    for (const f of facturen) {
        if (f.status === 'betaald' || f.status === 'geannuleerd' || f.status === 'concept') continue;
        const vd = f.vervaldatum || (f.datum ? new Date(new Date(f.datum).getTime() + 30 * 86400000).toISOString() : null);
        if (!vd) continue;
        const idx = weekOf(vd);
        if (idx < 0) continue;
        weeks[idx].inkomend += Math.round(lineTotal(f.items));
    }

    /* INKOMEND laag 2: accepted offertes — event-datum bepaalt week. We
       gebruiken event.date als offerte.event_id koppelt aan een event;
       anders skip (geen reliable forecast-datum). */
    const eventById: Record<number, EventMin> = {};
    for (const e of events) {
        if (e.id) eventById[e.id] = e;
    }
    for (const o of offertes) {
        if (!['goedgekeurd', 'geaccepteerd'].includes(o.status || '')) continue;
        const ev = o.event_id ? eventById[o.event_id] : null;
        const datum = ev?.date || o.datum;
        if (!datum) continue;
        const idx = weekOf(datum);
        if (idx < 0) continue;
        const gasten = o.aantal_gasten || ev?.guests || 0;
        const ppp = o.basis_prijs_pp || ev?.ppp || 0;
        const vk = (o.vaste_kosten || []).reduce((s, k) => s + (Number(k.bedrag) || 0), 0);
        const omzet = gasten * ppp + vk;
        weeks[idx].inkomend += Math.round(omzet);
    }

    /* UITGAAND: recurring bonnen — projecteer per week op vergelijkbare maand-datum.
       Heuristiek: bonnen met is_recurring=true OF rgs_code in [WBedHuur, WBedSwAbon,
       WBedTele, WBedEnGW] worden als terugkerend behandeld op dezelfde maand-dag. */
    const RECURRING_CODES = new Set(['WBedHuur', 'WBedSwAbon', 'WBedTele', 'WBedEnGW']);
    const recurringBonnen = bonnen.filter(b => b.is_recurring || (b.rgs_code && RECURRING_CODES.has(b.rgs_code)));
    for (const b of recurringBonnen) {
        if (!b.datum) continue;
        const day = new Date(b.datum).getDate();
        for (let wi = 0; wi < 13; wi++) {
            const ws = new Date(weeks[wi].week_start);
            const weekEnd = new Date(ws.getTime() + 6 * 86400000);
            if (day >= ws.getDate() && day <= weekEnd.getDate() && ws.getMonth() === weekEnd.getMonth()) {
                weeks[wi].uitgaand += Math.round(Number(b.totaal_bedrag) || 0);
                break;
            }
        }
    }

    /* Netto + cumulatief + risico. */
    let cum = start_balance;
    let first_risk = -1;
    for (let i = 0; i < weeks.length; i++) {
        weeks[i].netto = weeks[i].inkomend - weeks[i].uitgaand;
        cum += weeks[i].netto;
        weeks[i].cumulatief = cum;
        weeks[i].risico = cum < buffer_grens;
        if (weeks[i].risico && first_risk === -1) first_risk = i;
    }

    return {
        start_balance,
        buffer_grens,
        weeks,
        first_risk_week_index: first_risk,
        totaal_inkomend_13w: weeks.reduce((s, w) => s + w.inkomend, 0),
        totaal_uitgaand_13w: weeks.reduce((s, w) => s + w.uitgaand, 0),
    };
}

/* ────────────────────────────────────────────────────────────────────────
 * Q-deadlines + BTW-concept rubrieken — Pillar #3
 * ──────────────────────────────────────────────────────────────────────── */

export interface BtwAangiftePeriod {
    year: number;
    quarter: 1 | 2 | 3 | 4;
    start_date: string;
    end_date: string;
    deadline: string;        /* Belastingdienst-deadline */
    days_until_deadline: number;
    is_open: boolean;        /* Q-periode al verstreken */
}

export function currentQuarterPeriod(today: Date = new Date()): BtwAangiftePeriod {
    const y = today.getFullYear();
    const m = today.getMonth();
    /* Bepaal welk kwartaal we MOMENTEEL nog moeten aangeven. Tussen einde Q
       en deadline-maand zit de "aangifte-window". Vóór einde Q = vorig Q. */
    let quarter: 1 | 2 | 3 | 4;
    let year = y;
    if (m === 0) { quarter = 4; year = y - 1; }           /* januari = Q4 vorig jaar aangeven */
    else if (m <= 3) { quarter = 1; }                      /* feb-apr = Q1 aangeven */
    else if (m <= 6) { quarter = 2; }                      /* mei-jul = Q2 */
    else if (m <= 9) { quarter = 3; }                      /* aug-okt = Q3 */
    else { quarter = 4; }                                  /* nov-dec = Q4 */

    return quarterPeriod(year, quarter, today);
}

/**
 * Bouwt de periode-info voor een EXPLICIET jaar+kwartaal (voor historie /
 * vastgezette aangiftes). currentQuarterPeriod() bepaalt eerst wélk kwartaal
 * en delegeert hierheen.
 */
export function quarterPeriod(year: number, quarter: 1 | 2 | 3 | 4, today: Date = new Date()): BtwAangiftePeriod {
    const startMonth = (quarter - 1) * 3;
    /* UTC builders — voorkomt off-by-one bij local-TZ ↔ ISO conversie. */
    const start_date = new Date(Date.UTC(year, startMonth, 1)).toISOString().slice(0, 10);
    const end_date = new Date(Date.UTC(year, startMonth + 3, 0)).toISOString().slice(0, 10);
    /* Belastingdienst-deadline: laatste dag van eerste maand ná Q (= dag 0 van 2e maand erna). */
    const deadlineMonthIdx = startMonth + 4;
    const deadlineYear = deadlineMonthIdx > 12 ? year + 1 : year;
    const deadlineMonthAdj = deadlineMonthIdx > 12 ? deadlineMonthIdx - 12 : deadlineMonthIdx;
    const deadlineDate = new Date(Date.UTC(deadlineYear, deadlineMonthAdj, 0));
    const deadline = deadlineDate.toISOString().slice(0, 10);
    const days_until_deadline = Math.ceil((deadlineDate.getTime() - today.getTime()) / 86400000);
    const is_open = days_until_deadline >= 0;

    return { year, quarter, start_date, end_date, deadline, days_until_deadline, is_open };
}

export interface BtwAangifteRubrieken {
    /** 1a — Leveringen/diensten belast met hoog tarief (21%) */
    rubriek_1a: { omzet: number; btw: number };
    /** 1b — Leveringen/diensten belast met laag tarief (9%) */
    rubriek_1b: { omzet: number; btw: number };
    /** 2a — Leveringen/diensten waarover BTW is verlegd (B2B intra-EU) — voor v1 niet ingevuld */
    rubriek_2a: { omzet: number; btw: number };
    /** 3a — Leveringen naar landen buiten EU — voor v1 niet ingevuld */
    rubriek_3a: { omzet: number };
    /** 3b — Leveringen naar EU-landen — voor v1 niet ingevuld */
    rubriek_3b: { omzet: number };
    /** 5a — Verschuldigde omzetbelasting (som 1a + 1b + 2a) */
    rubriek_5a: number;
    /** 5b — Voorbelasting (inkoop-BTW uit bonnen) */
    rubriek_5b: number;
    /** Saldo te betalen (positief) of terug te vragen (negatief) */
    saldo: number;
}

export function computeBtwAangifte(
    facturen: FactuurMin[],
    bonnen: Array<BonMin & { btw_laag_bedrag?: number | string; btw_hoog_bedrag?: number | string }>,
    period: BtwAangiftePeriod,
): BtwAangifteRubrieken {
    const r: BtwAangifteRubrieken = {
        rubriek_1a: { omzet: 0, btw: 0 },
        rubriek_1b: { omzet: 0, btw: 0 },
        rubriek_2a: { omzet: 0, btw: 0 },
        rubriek_3a: { omzet: 0 },
        rubriek_3b: { omzet: 0 },
        rubriek_5a: 0,
        rubriek_5b: 0,
        saldo: 0,
    };

    /* Filter facturen op periode + status=betaald. Concept-aangiftes
       gebruiken kasstelsel (boekhouder kan switchen — uit scope v1). */
    for (const f of facturen) {
        if (!f.datum) continue;
        if (f.datum < period.start_date || f.datum > period.end_date) continue;
        if (f.status === 'concept' || f.status === 'geannuleerd') continue;
        for (const it of f.items || []) {
            const omzet = (it.qty || 0) * (it.prijs || 0);
            const pct = it.btw || 0;
            const btw = omzet * (pct / 100);
            if (pct === 21) {
                r.rubriek_1a.omzet += omzet;
                r.rubriek_1a.btw += btw;
            } else if (pct === 9) {
                r.rubriek_1b.omzet += omzet;
                r.rubriek_1b.btw += btw;
            }
            /* Andere percentages (0%) negeren we voor v1 — vereist
               handmatige context (EU-reverse vs export). Boekhouder vult aan. */
        }
    }

    /* Voorbelasting uit bonnen — 5b. */
    for (const b of bonnen) {
        if (!b.datum) continue;
        if (b.datum < period.start_date || b.datum > period.end_date) continue;
        r.rubriek_5b += (Number(b.btw_laag_bedrag) || 0) + (Number(b.btw_hoog_bedrag) || 0);
    }

    r.rubriek_5a = r.rubriek_1a.btw + r.rubriek_1b.btw + r.rubriek_2a.btw;
    r.saldo = r.rubriek_5a - r.rubriek_5b;

    /* Ronding op centen. */
    const round = (n: number) => Math.round(n * 100) / 100;
    r.rubriek_1a = { omzet: round(r.rubriek_1a.omzet), btw: round(r.rubriek_1a.btw) };
    r.rubriek_1b = { omzet: round(r.rubriek_1b.omzet), btw: round(r.rubriek_1b.btw) };
    r.rubriek_2a = { omzet: round(r.rubriek_2a.omzet), btw: round(r.rubriek_2a.btw) };
    r.rubriek_5a = round(r.rubriek_5a);
    r.rubriek_5b = round(r.rubriek_5b);
    r.saldo = round(r.saldo);

    return r;
}

/* ────────────────────────────────────────────────────────────────────────
 * "Klopt het?"-controle — de ingebouwde boekhouder die fouten vangt vóór
 * de aangifte de deur uit gaat. Pure functie, geen AI: puur data-checks.
 * ──────────────────────────────────────────────────────────────────────── */

export type CheckSeverity = 'error' | 'warning' | 'ok';

export interface BoekhoudCheck {
    id: string;
    /** 'error' = moet je fixen (kloppendheid/wettelijk); 'warning' = controleer; 'ok' = goed. */
    severity: CheckSeverity;
    label: string;
    detail: string;
    /** Aantal probleemgevallen (0 = ok). */
    count: number;
    /** Verwijzingen (factuurnummers e.d.) zodat de gebruiker weet WÁT hij moet checken. */
    refs?: string[];
}

/**
 * Scant facturen + bonnen op de klassieke boekhoud-fouten die een aangifte
 * scheeftrekken. Bewust géén tarief-gok: 0%-BTW wordt geflagd, niet
 * automatisch "gecorrigeerd" (BTW-tarief bepalen is mensenwerk).
 */
export function computeBoekhoudChecks(
    facturen: FactuurMin[],
    bonnen: Array<BonMin & { btw_laag_bedrag?: number | string; btw_hoog_bedrag?: number | string; ai_classify_status?: string }>,
    period: BtwAangiftePeriod,
): BoekhoudCheck[] {
    const inPeriode = (d?: string | null) => !!d && d >= period.start_date && d <= period.end_date;
    const periodFacturen = facturen.filter(f => inPeriode(f.datum));
    const periodBonnen = bonnen.filter(b => inPeriode(b.datum));
    const nr = (f: FactuurMin) => f.nummer || String(f.id ?? '?');
    const checks: BoekhoudCheck[] = [];

    /* 1. Factuur met 0% BTW terwijl er een bedrag op staat — verkeerd-tarief-risico. */
    const nulBtw = periodFacturen.filter(f =>
        (f.items || []).some(it =>
            (Number(it.btw) || 0) === 0 && (Number(it.qty) || 0) * (Number(it.prijs) || 0) !== 0,
        ),
    );
    checks.push({
        id: 'nul_btw',
        severity: nulBtw.length ? 'error' : 'ok',
        label: 'BTW-tarief op elke factuur',
        detail: nulBtw.length
            ? `${nulBtw.length} factuur(en) met 0% BTW terwijl er wél een bedrag op staat — controleer of dit 9% (eten) of 21% (drank/verhuur) moet zijn`
            : 'Elke factuur met een bedrag heeft een BTW-tarief',
        count: nulBtw.length,
        refs: nulBtw.map(nr),
    });

    /* 2. Dubbele factuurnummers — wettelijk moeten nummers uniek zijn (jaarbreed). */
    const perNummer = new Map<string, number>();
    for (const f of facturen) {
        if (!f.nummer) continue;
        perNummer.set(f.nummer, (perNummer.get(f.nummer) || 0) + 1);
    }
    const dubbel = [...perNummer.entries()].filter(([, n]) => n > 1).map(([k]) => k);
    checks.push({
        id: 'dubbele_nummers',
        severity: dubbel.length ? 'error' : 'ok',
        label: 'Unieke factuurnummers',
        detail: dubbel.length
            ? `${dubbel.length} factuurnummer(s) komen dubbel voor — wettelijk moet elk nummer uniek zijn`
            : 'Alle factuurnummers zijn uniek',
        count: dubbel.length,
        refs: dubbel,
    });

    /* 3. Concept-facturen in de periode — tellen NIET mee tot ze verzonden zijn. */
    const concepten = periodFacturen.filter(f => f.status === 'concept');
    checks.push({
        id: 'concept_facturen',
        severity: concepten.length ? 'warning' : 'ok',
        label: 'Alle facturen verzonden',
        detail: concepten.length
            ? `${concepten.length} concept-factuur(en) in dit kwartaal — deze tellen NIET mee in je aangifte tot je ze verstuurt`
            : 'Geen openstaande concepten in dit kwartaal',
        count: concepten.length,
        refs: concepten.map(nr),
    });

    /* 4. Niet (zeker) geclassificeerde bonnen — kan de voorbelasting beïnvloeden. */
    const teClassificeren = periodBonnen.filter(b => {
        const s = b.ai_classify_status;
        return s === 'pending' || s === 'twijfel' || !b.rgs_code;
    });
    checks.push({
        id: 'bonnen_classificatie',
        severity: teClassificeren.length ? 'warning' : 'ok',
        label: 'Alle bonnen geclassificeerd',
        detail: teClassificeren.length
            ? `${teClassificeren.length} bon(nen) nog niet (zeker) gecategoriseerd — controleer voordat je de voorbelasting vertrouwt`
            : `Alle ${periodBonnen.length} bonnen in dit kwartaal zijn verwerkt`,
        count: teClassificeren.length,
    });

    return checks;
}
