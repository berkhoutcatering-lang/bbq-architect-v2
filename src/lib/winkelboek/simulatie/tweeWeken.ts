/**
 * Alleen voor tests en de testpagina: twee nagemaakte winkelweken van vijf
 * kassadagen (di 24 – za 28 november en di 1 – za 5 december 2026), zoals de
 * kassa ze zou wegschrijven, met de rommel van een echte winkel erin:
 * tegenbonnen, een geannuleerde bon, een pakket, kaas op gewicht, open prijs,
 * statiegeld, een afgehaalde webshoporder, een cadeaubon, kas- en
 * pinverschillen, eigen kasregels, leveringen met en zonder bon, een levering
 * die niet is ingeboekt (voorraad onder nul), derving, een proefdag en een
 * tweede organisatie die nergens in mag meetellen.
 *
 * De simulatie houdt zelf bij wat de uitkomst moet zijn (`waarheid`), los van
 * de rekenregels van Boekhouding winkel. De test legt die twee naast elkaar.
 *
 * De kassa-formules komen uit de kern van de Toonbank: btw per bon per tarief
 * één keer afronden, contant afronden op 5 cent, verwacht = begin + contant,
 * kasverschil = geteld − verwacht, pinverschil = myPOS − kassa.
 */
import type { Rij, Tabellen } from './geheugenDb';

export const SIM_ORG = 'org-hop';
const ANDER = 'org-ander';
export const SIM_NU = new Date('2026-12-05T18:30:00+01:00');
export const SIM_PROEFDAG = '2026-11-20';
export const SIM_DAGEN = [
    '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28',
    '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05',
];

interface Product {
    id: string; naam: string; afdeling: string | null; btw: 9 | 21;
    /** Per stuk, of per 100 gram bij een product op gewicht. */
    prijs: number;
    inkoop: number | null; prijs_per: number; eenheid: 'stuk' | 'gram';
    leverancier_id: number | null;
    /** Boekt de kassa de voorraad af? Zo niet, dan is er geen voorraadmutatie bij de verkoop. */
    logboek: boolean;
    /** Hoe vaak het verkocht wordt, naar verhouding. */
    kans: number;
    voorraad: number | null;
    statiegeld?: number;
    tht?: string;
}

const PRODUCTEN: Product[] = [
    { id: 'p-worst', naam: 'Droge worst naturel', afdeling: 'Worst', btw: 9, prijs: 600, inkoop: 310, prijs_per: 1, eenheid: 'stuk', leverancier_id: 1, logboek: true, kans: 14, voorraad: 60 },
    { id: 'p-fuet', naam: 'Fuet met truffel', afdeling: 'Worst', btw: 9, prijs: 695, inkoop: 380, prijs_per: 1, eenheid: 'stuk', leverancier_id: 1, logboek: true, kans: 6, voorraad: 30 },
    { id: 'p-zuurkool', naam: 'Zuurkoolworst', afdeling: 'Worst', btw: 9, prijs: 600, inkoop: 350, prijs_per: 1, eenheid: 'stuk', leverancier_id: 1, logboek: true, kans: 1, voorraad: 10, tht: '2026-12-12' },
    { id: 'p-kaas', naam: 'Boerenkaas belegen', afdeling: 'Kaas', btw: 9, prijs: 220, inkoop: 1350, prijs_per: 1000, eenheid: 'gram', leverancier_id: 3, logboek: true, kans: 8, voorraad: 30000 },
    { id: 'p-blond', naam: 'Naober Blond 33 cl', afdeling: 'Bier', btw: 21, prijs: 300, inkoop: 145, prijs_per: 1, eenheid: 'stuk', leverancier_id: 2, logboek: true, kans: 16, voorraad: 150, statiegeld: 10 },
    { id: 'p-tripel', naam: 'Tripel 75 cl', afdeling: 'Bier', btw: 21, prijs: 900, inkoop: 520, prijs_per: 1, eenheid: 'stuk', leverancier_id: 2, logboek: true, kans: 3, voorraad: 12 },
    { id: 'p-barley', naam: 'Barleywine 33 cl', afdeling: 'Bier', btw: 21, prijs: 650, inkoop: 260, prijs_per: 1, eenheid: 'stuk', leverancier_id: 2, logboek: true, kans: 0, voorraad: 0 },
    { id: 'p-amandel', naam: 'Gerookte amandelen 150 g', afdeling: 'Noten', btw: 9, prijs: 495, inkoop: 270, prijs_per: 1, eenheid: 'stuk', leverancier_id: 4, logboek: true, kans: 7, voorraad: 100 },
    { id: 'p-cracker', naam: 'Crackers zeezout', afdeling: 'Broodbeleg', btw: 9, prijs: 250, inkoop: 110, prijs_per: 1, eenheid: 'stuk', leverancier_id: 4, logboek: true, kans: 6, voorraad: 80 },
    { id: 'p-chutney', naam: 'Chutney vijg', afdeling: 'Broodbeleg', btw: 9, prijs: 495, inkoop: 230, prijs_per: 1, eenheid: 'stuk', leverancier_id: 4, logboek: true, kans: 1, voorraad: 6 },
    /* Geen inkoopprijs ingevuld: de marge is onbekend. */
    { id: 'p-saus', naam: 'Mosterd-dillesaus', afdeling: 'Broodbeleg', btw: 9, prijs: 450, inkoop: null, prijs_per: 1, eenheid: 'stuk', leverancier_id: 4, logboek: true, kans: 3, voorraad: 40 },
    /* Nooit geteld: de kassa boekt geen voorraad af, de marge is geschat met de prijs van nu. */
    { id: 'p-glas', naam: 'Bierglas met logo', afdeling: null, btw: 21, prijs: 595, inkoop: 260, prijs_per: 1, eenheid: 'stuk', leverancier_id: null, logboek: false, kans: 2, voorraad: null },
    { id: 'p-plank', naam: 'Houten serveerplank', afdeling: null, btw: 21, prijs: 2495, inkoop: 1350, prijs_per: 1, eenheid: 'stuk', leverancier_id: null, logboek: true, kans: 0, voorraad: 0 },
    /* Op en nooit verkocht: hoort in geen enkele groep. */
    { id: 'p-oud', naam: 'Kerstpakket 2025', afdeling: null, btw: 9, prijs: 2500, inkoop: 1400, prijs_per: 1, eenheid: 'stuk', leverancier_id: null, logboek: true, kans: 0, voorraad: 0 },
];
const P = new Map(PRODUCTEN.map((p) => [p.id, p]));
const LEVERANCIERS: Record<number, string> = { 1: 'Slagerij', 2: 'Brouwerij', 3: 'Kaasmakerij', 4: 'Groothandel' };

/* ── Wat de uitkomst moet zijn ─────────────────────────────── */

export interface DagWaarheid {
    pin: number; contant: number; cadeaubon: number;
    incl: Record<number, number>; btw: Record<number, number>;
    statiegeld: number; order_rest: number; afronding: number;
    /** Afgeronde bonnen, tegenbonnen meegeteld. */
    bonnen: number;
    /** Wat er na het afromen in de la ligt. */
    la_na: number;
}
export interface ArtikelWaarheid { naam: string; aantal: number; incl: Record<number, number>; inkoop: number | null; geschat: boolean }
export interface ProductWaarheid { verkocht: number; omzet_incl: number; incl: Record<number, number>; inkoop: number | null; geschat: boolean }

export interface Waarheid {
    dagen: Map<string, DagWaarheid>;
    /** Per artikel (ook het pakket en de open prijs), sleutel zoals Verkoop hem gebruikt. */
    artikelen: Map<string, Map<string, ArtikelWaarheid>>;
    /** Per los verkocht product, per dag. */
    producten: Map<string, Map<string, ProductWaarheid>>;
    /** Eigen kasregels op dagen zonder kassa, per dag. */
    la_op: Map<string, number>;
    voorraad: Map<string, number | null>;
}

/* ── Hulpjes ───────────────────────────────────────────────── */

/** Vaste toevalsgenerator: elke keer dezelfde twee weken. */
function toeval(zaad: number) {
    let a = zaad >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const btwUitIncl = (incl: number, pct: number) => Math.sign(incl) * Math.round((Math.abs(incl) * pct) / (100 + pct));
const rond5 = (cents: number) => Math.sign(cents) * Math.round(Math.abs(cents) / 5) * 5;
const erbij = <K>(m: Record<number, number> | Map<K, number>, k: number | K, n: number) => {
    if (m instanceof Map) m.set(k as K, (m.get(k as K) ?? 0) + n);
    else m[k as number] = (m[k as number] ?? 0) + n;
};

interface RegelIn {
    artikel_id: string | null; naam: string; open_groep?: string;
    aantal: number; bedrag: number;
    btw: { pct: number; incl_cents: number }[];
    onderdelen: { product_id: string; hoeveelheid: number; eenheid: string }[];
    goederen_terug?: boolean | null;
}
interface BonOpties {
    betaling: 'pin' | 'contant' | { cadeaubon: number };
    soort?: 'verkoop' | 'tegenbon';
    status?: 'afgerond' | 'geannuleerd';
    statiegeld?: number; order_rest?: number;
    /** Kwam te laat binnen: zit in geen dagafsluiting. */
    zonderDagstaat?: boolean;
}

export function maakTweeWeken(): { tabellen: Tabellen; waarheid: Waarheid } {
    const kans = toeval(20261121);
    const tussen = (van: number, tot: number) => van + Math.floor(kans() * (tot - van + 1));

    const t: Tabellen = {
        toonbank_bonnen: [], toonbank_bon_regels: [], toonbank_dagstaten: [], winkel_voorraad_mutaties: [],
        winkel_producten: [], winkel_artikelen: [], winkel_artikel_slots: [], opslag_locaties: [], winkel_plaatsingen: [],
        bonnen: [], btw_kassa_uitsluitingen: [], winkel_kas_mutaties: [], maand_afsluitingen: [], notifications: [],
    };
    const w: Waarheid = { dagen: new Map(), artikelen: new Map(), producten: new Map(), la_op: new Map(), voorraad: new Map(PRODUCTEN.map((p) => [p.id, p.voorraad])) };

    let bonNr = 0;
    let regelNr = 0;
    let mutatieNr = 0;
    let slotNr = 0;

    /* ── Catalogus ── */
    t.opslag_locaties.push({ id: 'loc-winkel', organization_id: SIM_ORG, code: 'WINKEL', naam: 'Winkel', parent_id: null });
    for (const naam of [...new Set(PRODUCTEN.map((p) => p.afdeling).filter(Boolean))] as string[]) {
        t.opslag_locaties.push({ id: `loc-${naam}`, organization_id: SIM_ORG, code: `WINKEL-${naam.toUpperCase()}`, naam, parent_id: 'loc-winkel' });
    }
    for (const p of PRODUCTEN) {
        t.winkel_artikelen.push({ id: `a-${p.id}`, organization_id: SIM_ORG, actief: true });
        t.winkel_artikel_slots.push({ id: ++slotNr, organization_id: SIM_ORG, artikel_id: `a-${p.id}`, standaard_product_id: p.id });
        if (p.afdeling) t.winkel_plaatsingen.push({ id: `pl-${p.id}`, organization_id: SIM_ORG, product_id: p.id, locatie_id: `loc-${p.afdeling}`, rol: 'verkoop' });
    }
    /* Het pakket: twee slots, dus niet "los te koop". */
    t.winkel_artikelen.push({ id: 'a-borrel', organization_id: SIM_ORG, actief: true });
    t.winkel_artikel_slots.push({ id: ++slotNr, organization_id: SIM_ORG, artikel_id: 'a-borrel', standaard_product_id: 'p-worst' });
    t.winkel_artikel_slots.push({ id: ++slotNr, organization_id: SIM_ORG, artikel_id: 'a-borrel', standaard_product_id: 'p-blond' });

    /* ── Eén bon, zoals de kassa hem wegschrijft ── */
    const dagBonnen = new Map<string, Rij[]>();
    function bon(org: string, dag: string, tijd: string, regels: RegelIn[], o: BonOpties): void {
        const id = `bon-${String(++bonNr).padStart(5, '0')}`;
        const status = o.status ?? 'afgerond';
        const soort = o.soort ?? 'verkoop';
        const gebeurd_at = `${dag}T${tijd}:00Z`;
        const statiegeld = o.statiegeld ?? 0;
        const rest = o.order_rest ?? 0;

        const incl: Record<number, number> = {};
        for (const r of regels) for (const b of r.btw) erbij(incl, b.pct, b.incl_cents);
        const btw: Record<string, { incl_cents: number; btw_cents: number }> = {};
        for (const [pct, som] of Object.entries(incl)) btw[pct] = { incl_cents: som, btw_cents: btwUitIncl(som, Number(pct)) };

        const teBetalen = regels.reduce((s, r) => s + r.bedrag, 0) + statiegeld + rest;
        let pin = 0; let contant = 0; let cadeaubon = 0; let afronding = 0;
        if (o.betaling === 'pin') pin = teBetalen;
        else if (o.betaling === 'contant') { contant = rond5(teBetalen); afronding = contant - teBetalen; }
        else { cadeaubon = Math.min(o.betaling.cadeaubon, teBetalen); pin = teBetalen - cadeaubon; }

        const rij: Rij = {
            id, organization_id: org, bonnummer: bonNr, soort, status, bedrijfsdag: dag, gebeurd_at,
            dagstaat_id: o.zonderDagstaat ? null : `ds-${org}-${dag}`,
            totaal_cents: teBetalen + afronding, afronding_cents: afronding, btw,
            statiegeld_cents: statiegeld, order_rest_cents: rest, pin_cents: pin, contant_cents: contant, cadeaubon_cents: cadeaubon,
        };
        t.toonbank_bonnen.push(rij);
        const sleutel = `${org}|${dag}`;
        dagBonnen.set(sleutel, [...(dagBonnen.get(sleutel) ?? []), rij]);

        const join = { bedrijfsdag: dag, gebeurd_at, status };
        for (const r of regels) {
            const regelId = ++regelNr;
            t.toonbank_bon_regels.push({
                id: regelId, organization_id: org, bon_id: id, soort: 'verkoop', artikel_id: r.artikel_id, naam: r.naam,
                open_prijs_groep: r.open_groep ?? null, aantal: r.aantal, bedrag_cents: r.bedrag, btw: r.btw,
                onderdelen: r.onderdelen, goederen_terug: r.goederen_terug ?? null, toonbank_bonnen: join,
            });
            if (status !== 'afgerond') continue;
            const terug = r.aantal < 0;
            if (terug && r.goederen_terug !== true) continue;
            for (const od of r.onderdelen) {
                const p = P.get(od.product_id);
                if (!p || !p.logboek) continue;
                const hoeveel = r.aantal * od.hoeveelheid;
                t.winkel_voorraad_mutaties.push({
                    id: ++mutatieNr, organization_id: org, winkel_product_id: p.id, type: terug ? 'retour' : 'verkoop_kassa', reden: null,
                    waarde_cents: p.inkoop === null ? null : -Math.round((hoeveel * p.inkoop) / p.prijs_per),
                    toonbank_bon_regel_id: regelId, gebeurd_at, created_at: gebeurd_at,
                });
                if (org === SIM_ORG) w.voorraad.set(p.id, (w.voorraad.get(p.id) ?? 0) - hoeveel);
            }
        }
        /* Regels die geen verkoop zijn: de laders moeten ze overslaan. */
        if (statiegeld) t.toonbank_bon_regels.push({ id: ++regelNr, organization_id: org, bon_id: id, soort: 'statiegeld', artikel_id: null, naam: 'Statiegeld', open_prijs_groep: null, aantal: 1, bedrag_cents: statiegeld, btw: [], onderdelen: [], goederen_terug: null, toonbank_bonnen: join });
        t.toonbank_bon_regels.push({ id: ++regelNr, organization_id: org, bon_id: id, soort: 'betaling', artikel_id: null, naam: 'Betaling', open_prijs_groep: null, aantal: 1, bedrag_cents: teBetalen + afronding, btw: [], onderdelen: [], goederen_terug: null, toonbank_bonnen: join });

        if (org !== SIM_ORG || status !== 'afgerond' || dag === SIM_PROEFDAG) return;

        /* ── De waarheid bijhouden ── */
        let d = w.dagen.get(dag);
        if (!d) { d = { pin: 0, contant: 0, cadeaubon: 0, incl: {}, btw: {}, statiegeld: 0, order_rest: 0, afronding: 0, bonnen: 0, la_na: 0 }; w.dagen.set(dag, d); }
        d.pin += pin; d.contant += contant; d.cadeaubon += cadeaubon; d.statiegeld += statiegeld; d.order_rest += rest; d.afronding += afronding; d.bonnen += 1;
        for (const [pct, b] of Object.entries(btw)) { erbij(d.incl, Number(pct), b.incl_cents); erbij(d.btw, Number(pct), b.btw_cents); }

        const artikelen = w.artikelen.get(dag) ?? new Map<string, ArtikelWaarheid>();
        const producten = w.producten.get(dag) ?? new Map<string, ProductWaarheid>();
        w.artikelen.set(dag, artikelen); w.producten.set(dag, producten);
        for (const r of regels) {
            /* Wat de regel kostte, onafhankelijk van hoe Boekhouding winkel het uitrekent. */
            let inkoop: number | null = 0;
            let geschat = false;
            if (r.onderdelen.length === 0) inkoop = null;
            else if (r.aantal < 0 && r.goederen_terug !== true) inkoop = 0;
            else for (const od of r.onderdelen) {
                const p = P.get(od.product_id)!;
                if (p.inkoop === null) { inkoop = null; break; }
                if (!p.logboek) geschat = true;
                inkoop += Math.round((r.aantal * od.hoeveelheid * p.inkoop) / p.prijs_per);
            }

            const sleutel = r.artikel_id ?? `open:${r.open_groep ?? 'overig'}`;
            const a = artikelen.get(sleutel) ?? { naam: r.naam, aantal: 0, incl: {}, inkoop: 0, geschat: false };
            a.aantal += r.aantal;
            for (const b of r.btw) erbij(a.incl, b.pct, b.incl_cents);
            a.inkoop = a.inkoop === null || inkoop === null ? null : a.inkoop + inkoop;
            a.geschat = a.geschat || geschat;
            artikelen.set(sleutel, a);

            const los = new Set(r.onderdelen.map((x) => x.product_id));
            if (los.size !== 1) continue;
            const pid = [...los][0];
            const pw = producten.get(pid) ?? { verkocht: 0, omzet_incl: 0, incl: {}, inkoop: 0, geschat: false };
            pw.verkocht += r.aantal; pw.omzet_incl += r.bedrag;
            for (const b of r.btw) erbij(pw.incl, b.pct, b.incl_cents);
            pw.inkoop = pw.inkoop === null || inkoop === null ? null : pw.inkoop + inkoop;
            pw.geschat = pw.geschat || geschat;
            producten.set(pid, pw);
        }
    }

    /* ── Regels maken ── */
    const los = (id: string, aantal: number, gram = 0): RegelIn => {
        const p = P.get(id)!;
        const bedrag = p.eenheid === 'gram' ? Math.round((gram * p.prijs) / 100) * Math.sign(aantal || 1) : aantal * p.prijs;
        return {
            artikel_id: `a-${id}`, naam: p.naam, aantal, bedrag, btw: [{ pct: p.btw, incl_cents: bedrag }],
            onderdelen: [{ product_id: id, hoeveelheid: p.eenheid === 'gram' ? gram : 1, eenheid: p.eenheid }],
        };
    };
    const pakket = (): RegelIn => ({
        artikel_id: 'a-borrel', naam: 'Borrelpakket', aantal: 1, bedrag: 1150,
        btw: [{ pct: 9, incl_cents: 575 }, { pct: 21, incl_cents: 575 }],
        onderdelen: [{ product_id: 'p-worst', hoeveelheid: 1, eenheid: 'stuk' }, { product_id: 'p-blond', hoeveelheid: 2, eenheid: 'stuk' }],
    });
    const openPrijs = (bedrag: number): RegelIn => ({ artikel_id: null, naam: 'Diversen', open_groep: 'diversen', aantal: 1, bedrag, btw: [{ pct: 21, incl_cents: bedrag }], onderdelen: [] });

    const teKoop = PRODUCTEN.filter((p) => p.kans > 0);
    const totaleKans = teKoop.reduce((s, p) => s + p.kans, 0) + 3;
    function gewoneRegel(): RegelIn {
        let r = kans() * totaleKans;
        for (const p of teKoop) {
            r -= p.kans;
            if (r > 0) continue;
            if (p.eenheid === 'gram') return los(p.id, 1, tussen(15, 45) * 10);
            return los(p.id, p.id === 'p-blond' ? tussen(1, 6) : tussen(1, 2));
        }
        return kans() < 0.67 ? pakket() : openPrijs(tussen(2, 12) * 50);
    }
    const flesjes = (regels: RegelIn[]) => regels.reduce((s, r) => s + r.onderdelen.filter((x) => x.product_id === 'p-blond').reduce((n, x) => n + r.aantal * x.hoeveelheid, 0), 0);

    /* ── Eigen kasregels, leveringen en derving ── */
    const kasregel = (org: string, datum: string, bedrag: number, reden: string, omschrijving: string, moment = 'tijdens') =>
        t.winkel_kas_mutaties.push({ id: `km-${t.winkel_kas_mutaties.length + 1}`, organization_id: org, datum, bedrag_cents: bedrag, reden, omschrijving, moment, created_at: `${datum}T08:00:00Z` });

    function levering(dag: string, leverancier_id: number | null, wat: [string, number][]): number | null {
        let som: number | null = 0;
        for (const [id, hoeveel] of wat) {
            const p = P.get(id)!;
            const waarde = p.inkoop === null ? null : Math.round((hoeveel * p.inkoop) / p.prijs_per);
            som = som === null || waarde === null ? null : som + waarde;
            t.winkel_voorraad_mutaties.push({
                id: ++mutatieNr, organization_id: SIM_ORG, winkel_product_id: id, type: 'ontvangst', reden: null, waarde_cents: waarde,
                toonbank_bon_regel_id: null, gebeurd_at: `${dag}T07:30:00Z`, created_at: `${dag}T07:30:00Z`,
                winkel_producten: { naam: p.naam, btw_pct: p.btw, leverancier_id, leveranciers: leverancier_id === null ? null : { naam: LEVERANCIERS[leverancier_id] } },
            });
            w.voorraad.set(id, (w.voorraad.get(id) ?? 0) + hoeveel);
        }
        return som;
    }
    const inkoopbon = (datum: string, leverancier_id: number, netto_cents: number) =>
        t.bonnen.push({ id: t.bonnen.length + 1, organization_id: SIM_ORG, datum, leverancier_id, netto_bedrag: netto_cents / 100 });
    function derving(dag: string, id: string, hoeveel: number, reden: string): void {
        const p = P.get(id)!;
        t.winkel_voorraad_mutaties.push({
            id: ++mutatieNr, organization_id: SIM_ORG, winkel_product_id: id, type: 'afwijking', reden,
            waarde_cents: p.inkoop === null ? null : -Math.round((hoeveel * p.inkoop) / p.prijs_per),
            toonbank_bon_regel_id: null, gebeurd_at: `${dag}T16:00:00Z`, created_at: `${dag}T16:00:00Z`,
        });
        w.voorraad.set(id, (w.voorraad.get(id) ?? 0) - hoeveel);
    }

    /* ── De dagafsluiting, zoals de tablet hem maakt ── */
    let la = 15000;
    interface SluitOpties { kasVerschil?: number; eigenTijdens?: number; pinVerschil?: number; goedgekeurd?: boolean; voorlopig?: boolean; beginAnders?: number }
    function sluit(org: string, dag: string, o: SluitOpties = {}): void {
        const bonnen = (dagBonnen.get(`${org}|${dag}`) ?? []).filter((b) => b.status === 'afgerond');
        const begin = org === SIM_ORG && dag !== SIM_PROEFDAG ? la + (o.beginAnders ?? 0) : 5000;
        const contant = bonnen.reduce((s, b) => s + Number(b.contant_cents), 0);
        const pin = bonnen.reduce((s, b) => s + Number(b.pin_cents), 0);
        const verwacht = begin + contant;
        const geteld = verwacht + (o.kasVerschil ?? 0) + (o.eigenTijdens ?? 0);
        const afgeroomd = geteld > 15000 ? Math.floor((geteld - 15000) / 500) * 500 : 0;
        t.toonbank_dagstaten.push({
            id: `ds-${org}-${dag}`, organization_id: org, apparaat_id: 'kassa-1', bedrijfsdag: dag,
            status: o.voorlopig ? 'voorlopig' : o.goedgekeurd ? 'goedgekeurd' : 'definitief',
            gesloten_at: `${dag}T17:05:00Z`, aantal_bonnen: bonnen.length,
            pin_toonbank_cents: pin, pin_mypos_app_cents: pin + (o.pinVerschil ?? 0), pin_verschil_cents: o.pinVerschil ?? 0,
            contant_begin_cents: begin, contant_verwacht_cents: verwacht, contant_geteld_cents: geteld, contant_verschil_cents: geteld - verwacht,
            afgeroomd_cents: afgeroomd, verschillen: [], goedgekeurd_at: o.goedgekeurd ? `${dag}T20:00:00Z` : null,
        });
        if (org !== SIM_ORG || dag === SIM_PROEFDAG) return;
        la = geteld - afgeroomd;
        w.dagen.get(dag)!.la_na = la;
    }

    /* ── Een gewone winkeldag ── */
    function gewoneBonnen(dag: string, aantal: number): void {
        for (let i = 0; i < aantal; i++) {
            const regels = Array.from({ length: tussen(1, 4) }, gewoneRegel);
            const minuut = Math.floor((i / aantal) * 480);
            const tijd = `${String(8 + Math.floor(minuut / 60)).padStart(2, '0')}:${String(minuut % 60).padStart(2, '0')}`;
            bon(SIM_ORG, dag, tijd, regels, { betaling: kans() < 0.78 ? 'pin' : 'contant', statiegeld: flesjes(regels) * 10 });
        }
    }

    /* ══ De proefdag: telt nergens mee ══ */
    t.btw_kassa_uitsluitingen.push({ organization_id: SIM_ORG, datum: SIM_PROEFDAG });
    bon(SIM_ORG, SIM_PROEFDAG, '14:00', [los('p-worst', 1)], { betaling: 'contant' });
    bon(SIM_ORG, SIM_PROEFDAG, '14:05', [los('p-blond', 2)], { betaling: 'pin', statiegeld: 20 });
    sluit(SIM_ORG, SIM_PROEFDAG, { kasVerschil: -600 });
    /* Wat op de proefdag verkocht is, ging wel echt van de plank. */

    /* ══ Week 1 ══ */
    /* di 24 nov: een gewone dag. De slager levert, de bon is er dezelfde dag. */
    inkoopbon('2026-11-24', 1, levering('2026-11-24', 1, [['p-worst', 200], ['p-fuet', 90], ['p-zuurkool', 30]])!);
    gewoneBonnen('2026-11-24', 46);
    sluit(SIM_ORG, '2026-11-24');

    /* wo 25 nov: € 2,00 te weinig in de la, geen verklaring. De brouwer levert; de bon komt vrijdag. */
    const brouwer = levering('2026-11-25', 2, [['p-blond', 720], ['p-tripel', 48], ['p-barley', 24]])!;
    gewoneBonnen('2026-11-25', 44);
    sluit(SIM_ORG, '2026-11-25', { kasVerschil: -200 });

    /* do 26 nov: schoonmaakmiddel van € 9,00 contant uit de la, als eigen kasregel ingevoerd. */
    kasregel(SIM_ORG, '2026-11-26', -900, 'uitgave', 'Schoonmaakmiddel');
    gewoneBonnen('2026-11-26', 48);
    sluit(SIM_ORG, '2026-11-26', { eigenTijdens: -900 });

    /* vr 27 nov: een worst komt terug (goederen terug). myPOS toont € 5,00 meer; 's avonds goedgekeurd. De slager levert opnieuw. */
    inkoopbon('2026-11-27', 2, brouwer);
    inkoopbon('2026-11-27', 1, levering('2026-11-27', 1, [['p-worst', 120]])!);
    gewoneBonnen('2026-11-27', 52);
    bon(SIM_ORG, '2026-11-27', '15:10', [{ ...los('p-worst', -1), goederen_terug: true }], { betaling: 'contant', soort: 'tegenbon' });
    sluit(SIM_ORG, '2026-11-27', { pinVerschil: 500, goedgekeurd: true });

    /* za 28 nov: druk. Cadeaubon, afgehaalde webshoporder, een geannuleerde bon. */
    gewoneBonnen('2026-11-28', 94);
    bon(SIM_ORG, '2026-11-28', '11:20', [los('p-tripel', 2), los('p-kaas', 1, 300)], { betaling: { cadeaubon: 2500 } });
    bon(SIM_ORG, '2026-11-28', '13:40', [los('p-cracker', 1)], { betaling: 'pin', order_rest: 8500 });
    bon(SIM_ORG, '2026-11-28', '14:15', [los('p-fuet', 3)], { betaling: 'pin', status: 'geannuleerd' });
    sluit(SIM_ORG, '2026-11-28');

    /* ma 30 nov: winkel dicht. € 50,00 wisselgeld in de la; de groothandel levert, zonder bon, met de saus zonder inkoopprijs.
       Van de chutney is maar één doos ingeboekt: die zakt daardoor onder nul. */
    kasregel(SIM_ORG, '2026-11-30', 5000, 'wisselgeld', 'Wisselgeld gehaald bij de bank');
    la += 5000;
    w.la_op.set('2026-11-30', 5000);
    levering('2026-11-30', 4, [['p-amandel', 160], ['p-cracker', 144], ['p-chutney', 12], ['p-saus', 60]]);

    /* ══ Week 2 ══ */
    /* di 1 dec: bij het openen ligt er € 10,00 minder in de la dan zaterdag overbleef, zonder regel. */
    la -= 1000;
    w.la_op.set('2026-12-01', -1000);
    inkoopbon('2026-12-01', 1, levering('2026-12-01', 1, [['p-worst', 150], ['p-fuet', 80]])!);
    gewoneBonnen('2026-12-01', 43);
    sluit(SIM_ORG, '2026-12-01');

    /* wo 2 dec: € 1,00 te veel geteld, goedgekeurd. Twee zuurkoolworsten over datum. De brouwer levert, met bon. */
    inkoopbon('2026-12-02', 2, levering('2026-12-02', 2, [['p-blond', 480], ['p-tripel', 24]])!);
    gewoneBonnen('2026-12-02', 45);
    derving('2026-12-02', 'p-zuurkool', 2, 'derving_tht');
    sluit(SIM_ORG, '2026-12-02', { kasVerschil: 100, goedgekeurd: true });

    /* do 3 dec: vóór het openen € 20,00 privé uit de la. Een flesje wordt terugbetaald zonder dat het terugkomt. De kaas wordt geleverd, met bon. */
    kasregel(SIM_ORG, '2026-12-03', -2000, 'prive', 'Privé opgenomen', 'voor_openen');
    la -= 2000;
    inkoopbon('2026-12-03', 3, levering('2026-12-03', 3, [['p-kaas', 30000]])!);
    gewoneBonnen('2026-12-03', 47);
    bon(SIM_ORG, '2026-12-03', '12:30', [{ ...los('p-blond', -1), goederen_terug: false }], { betaling: 'pin', soort: 'tegenbon' });
    sluit(SIM_ORG, '2026-12-03');

    /* vr 4 dec: de tablet had bij het sluiten nog een bon te versturen. Een pot saus valt kapot. De planken komen binnen, zonder leverancier. */
    levering('2026-12-04', null, [['p-plank', 6]]);
    gewoneBonnen('2026-12-04', 50);
    bon(SIM_ORG, '2026-12-04', '16:55', [los('p-amandel', 2)], { betaling: 'pin', zonderDagstaat: true });
    derving('2026-12-04', 'p-saus', 1, 'derving_breuk');
    sluit(SIM_ORG, '2026-12-04', { voorlopig: true });

    /* za 5 dec: druk. myPOS toont € 3,50 minder dan de kassa; nog niet goedgekeurd. */
    gewoneBonnen('2026-12-05', 97);
    sluit(SIM_ORG, '2026-12-05', { pinVerschil: -350 });

    /* ══ De producten zoals ze er nu bij liggen ══ */
    for (const p of PRODUCTEN) {
        t.winkel_producten.push({
            id: p.id, organization_id: SIM_ORG, naam: p.naam, eenheid: p.eenheid, actief: true, btw_pct: p.btw, leverancier_id: p.leverancier_id,
            voorraad: w.voorraad.get(p.id) ?? null, tht: p.tht ?? null, inkoop_excl_cents: p.inkoop, prijs_per: p.prijs_per,
        });
    }

    /* ══ De andere organisatie: mag nergens in meetellen ══ */
    t.opslag_locaties.push({ id: 'x-winkel', organization_id: ANDER, code: 'WINKEL', naam: 'Winkel', parent_id: null });
    t.opslag_locaties.push({ id: 'x-afd', organization_id: ANDER, code: 'WINKEL-X', naam: 'Andere winkel', parent_id: 'x-winkel' });
    for (const p of PRODUCTEN) t.winkel_plaatsingen.push({ id: `x-pl-${p.id}`, organization_id: ANDER, product_id: p.id, locatie_id: 'x-afd', rol: 'verkoop' });
    t.winkel_producten.push({ id: 'x-product', organization_id: ANDER, naam: 'Van een ander', eenheid: 'stuk', actief: true, btw_pct: 21, leverancier_id: null, voorraad: 100, tht: null, inkoop_excl_cents: 999, prijs_per: 1 });
    t.winkel_artikelen.push({ id: 'x-artikel', organization_id: ANDER, actief: true });
    t.winkel_artikel_slots.push({ id: ++slotNr, organization_id: ANDER, artikel_id: 'x-artikel', standaard_product_id: 'x-product' });
    t.btw_kassa_uitsluitingen.push({ organization_id: ANDER, datum: '2026-11-25' });
    t.winkel_kas_mutaties.push({ id: 'x-km', organization_id: ANDER, datum: '2026-11-25', bedrag_cents: -7700, reden: 'prive', omschrijving: 'Van een ander', moment: 'tijdens', created_at: '2026-11-25T08:00:00Z' });
    t.bonnen.push({ id: 9001, organization_id: ANDER, datum: '2026-11-24', leverancier_id: 1, netto_bedrag: 77 });
    t.maand_afsluitingen.push({ id: 'x-ma', organization_id: ANDER, jaar: 2026, maand: 11 });
    t.notifications.push({ id: 'x-melding', organization_id: ANDER, user_id: null, type: 'winkel_dag_geboekt', title: 'Van een ander', body: '', link: '', metadata: { bedrijfsdag: '2026-11-24' } });
    for (const dag of ['2026-11-24', '2026-11-25', '2026-12-02']) {
        bon(ANDER, dag, '10:00', [{ artikel_id: 'x-artikel', naam: 'Van een ander', aantal: 7, bedrag: 7700, btw: [{ pct: 21, incl_cents: 7700 }], onderdelen: [{ product_id: 'x-product', hoeveelheid: 1, eenheid: 'stuk' }] }], { betaling: 'contant' });
        sluit(ANDER, dag, { kasVerschil: -7700 });
    }
    t.winkel_voorraad_mutaties.push({
        id: ++mutatieNr, organization_id: ANDER, winkel_product_id: 'x-product', type: 'ontvangst', reden: null, waarde_cents: 77700,
        toonbank_bon_regel_id: null, gebeurd_at: '2026-11-24T07:30:00Z', created_at: '2026-11-24T07:30:00Z',
        winkel_producten: { naam: 'Van een ander', btw_pct: 21, leverancier_id: 1, leveranciers: { naam: 'Slagerij' } },
    });
    t.winkel_voorraad_mutaties.push({ id: ++mutatieNr, organization_id: ANDER, winkel_product_id: 'x-product', type: 'afwijking', reden: 'derving_breuk', waarde_cents: -7700, toonbank_bon_regel_id: null, gebeurd_at: '2026-12-02T16:00:00Z', created_at: '2026-12-02T16:00:00Z' });

    return { tabellen: t, waarheid: w };
}

export const SIM_PRODUCTEN: readonly { id: string; naam: string; afdeling: string | null; eenheid: 'stuk' | 'gram'; inkoop: number | null; prijs_per: number; logboek: boolean; leverancier_id: number | null }[] = PRODUCTEN;
