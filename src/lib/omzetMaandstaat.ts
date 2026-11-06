/**
 * Maandstaat winkelomzet: per dag wat er verkocht is, per btw-tarief en per
 * bron, naast wat de kassa die dag zelf meldde. Geen eigen rekenregels: de
 * regels komen uit dezelfde laadfunctie als de btw-aangifte, dus beide
 * schermen geven hetzelfde getal.
 */
import type { KassaRegel } from '@/lib/financeAnalytics';

export interface DagstaatMin {
    bedrijfsdag: string;
    status: string;
    pin_toonbank_cents: number;
    contant_geteld_cents: number;
    contant_verschil_cents: number;
    pin_verschil_cents: number;
    goedgekeurd_at: string | null;
}

export interface MaandDag {
    datum: string;
    toonbank: number;
    webshop: number;
    kassa_oud: number;
    omzet_9: number;
    btw_9: number;
    omzet_21: number;
    btw_21: number;
    omzet_overig: number;
    incl: number;
    pin: number | null;
    contant: number | null;
    kasverschil: number | null;
    dagstaat: 'geen' | 'in_orde' | 'te_controleren';
}

export interface Maandstaat {
    jaar: number;
    maand: number;
    dagen: MaandDag[];
    totaal: Omit<MaandDag, 'datum' | 'dagstaat'>;
    open_punten: string[];
}

const rond = (n: number) => Math.round(n * 100) / 100;

function legeDag(datum: string): MaandDag {
    return {
        datum, toonbank: 0, webshop: 0, kassa_oud: 0, omzet_9: 0, btw_9: 0, omzet_21: 0, btw_21: 0, omzet_overig: 0,
        incl: 0, pin: null, contant: null, kasverschil: null, dagstaat: 'geen',
    };
}

function korteDatum(datum: string): string {
    return new Date(`${datum}T12:00:00Z`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });
}

export function maakMaandstaat(jaar: number, maand: number, regels: KassaRegel[], dagstaten: DagstaatMin[]): Maandstaat {
    const dagen = new Map<string, MaandDag>();
    const dag = (datum: string) => {
        const d = dagen.get(datum) ?? legeDag(datum);
        dagen.set(datum, d);
        return d;
    };

    for (const r of regels) {
        const d = dag(r.datum);
        const incl = r.omzet + r.btw;
        d[r.bron ?? 'kassa_oud'] += incl;
        d.incl += incl;
        if (r.btw_pct === 9) { d.omzet_9 += r.omzet; d.btw_9 += r.btw; }
        else if (r.btw_pct === 21) { d.omzet_21 += r.omzet; d.btw_21 += r.btw; }
        else d.omzet_overig += r.omzet;
    }

    for (const s of dagstaten) {
        const d = dag(s.bedrijfsdag);
        d.pin = (d.pin ?? 0) + s.pin_toonbank_cents / 100;
        d.contant = (d.contant ?? 0) + s.contant_geteld_cents / 100;
        d.kasverschil = (d.kasverschil ?? 0) + s.contant_verschil_cents / 100;
        const verschil = s.contant_verschil_cents !== 0 || s.pin_verschil_cents !== 0;
        const open = s.status === 'voorlopig' || (verschil && !s.goedgekeurd_at);
        if (open) d.dagstaat = 'te_controleren';
        else if (d.dagstaat === 'geen') d.dagstaat = 'in_orde';
    }

    const lijst = [...dagen.values()].sort((a, b) => a.datum.localeCompare(b.datum)).map((d) => ({
        ...d,
        toonbank: rond(d.toonbank), webshop: rond(d.webshop), kassa_oud: rond(d.kassa_oud),
        omzet_9: rond(d.omzet_9), btw_9: rond(d.btw_9), omzet_21: rond(d.omzet_21), btw_21: rond(d.btw_21),
        omzet_overig: rond(d.omzet_overig), incl: rond(d.incl),
        pin: d.pin === null ? null : rond(d.pin),
        contant: d.contant === null ? null : rond(d.contant),
        kasverschil: d.kasverschil === null ? null : rond(d.kasverschil),
    }));

    const som = (k: 'toonbank' | 'webshop' | 'kassa_oud' | 'omzet_9' | 'btw_9' | 'omzet_21' | 'btw_21' | 'omzet_overig' | 'incl') =>
        rond(lijst.reduce((s, d) => s + d[k], 0));
    const somNul = (k: 'pin' | 'contant' | 'kasverschil') => rond(lijst.reduce((s, d) => s + (d[k] ?? 0), 0));

    const open_punten: string[] = [];
    for (const d of lijst) {
        if (d.toonbank !== 0 && d.dagstaat === 'geen') open_punten.push(`${korteDatum(d.datum)}: kassaverkoop, maar de dag is niet afgesloten.`);
        if (d.dagstaat === 'te_controleren') open_punten.push(`${korteDatum(d.datum)}: dagstaat moet nog gecontroleerd worden.`);
    }

    return {
        jaar, maand, dagen: lijst,
        totaal: {
            toonbank: som('toonbank'), webshop: som('webshop'), kassa_oud: som('kassa_oud'),
            omzet_9: som('omzet_9'), btw_9: som('btw_9'), omzet_21: som('omzet_21'), btw_21: som('btw_21'),
            omzet_overig: som('omzet_overig'), incl: som('incl'),
            pin: somNul('pin'), contant: somNul('contant'), kasverschil: somNul('kasverschil'),
        },
        open_punten,
    };
}

export function maandGrenzen(jaar: number, maand: number): { start: string; eind: string } {
    const mm = String(maand).padStart(2, '0');
    const laatste = new Date(Date.UTC(jaar, maand, 0)).getUTCDate();
    return { start: `${jaar}-${mm}-01`, eind: `${jaar}-${mm}-${String(laatste).padStart(2, '0')}` };
}
