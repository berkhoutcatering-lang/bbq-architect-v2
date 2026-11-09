/**
 * Zelf ingevoerde bestellingen op Vandaag — het weekseintje.
 * Ontwerp: docs/superpowers/specs/2026-11-09-bestelling-invoeren-design.md
 *
 * Een bestelling die per mail of telefoon binnenkwam staat er soms maanden
 * voor hij opgehaald wordt. Een week van tevoren komt hij op Vandaag, met de
 * let-op-punten (!) en "prijs volgt" erbij, zodat niets verrast.
 *
 * Urgentie volgt de afhaaldag: vandaag of morgen = nu, binnen 3 dagen =
 * vandaag, binnen een week = deze week. Puur: de klok komt van buiten.
 */
import { BRON_LABEL, isZelfIngevoerd, letOpPunten } from '@/lib/winkel/handmatig';
import type { Wensen } from '@/lib/winkel/store';
import type { Taak, TaakUrgentie } from './taken-samenvoegen';

/** Hoeveel dagen vooruit het seintje komt. */
export const SEINTJE_DAGEN = 7;

export const BESTELLING_HREF = '/verkoop/webshop';

export interface ZelfIngevoerdeRij {
    id: number;
    nummer: string;
    contact_naam: string;
    bron: string | null;
    wensen: Wensen | null;
    winkel_order_regels: { naam: string; aantal: number; klaar_op: string; prijs_volgt?: boolean | null }[];
}

function dagISO(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Hele dagen van vandaag tot een datum (jjjj-mm-dd), op de kalender, niet op uren. */
export function dagenTot(datum: string, nu: Date): number {
    const [j, m, d] = datum.split('-').map(Number);
    const doel = Date.UTC(j!, (m ?? 1) - 1, d ?? 1);
    const van = Date.UTC(nu.getFullYear(), nu.getMonth(), nu.getDate());
    return Math.round((doel - van) / 86_400_000);
}

export function seintjeUrgentie(dagen: number): TaakUrgentie {
    if (dagen <= 1) return 'nu';
    if (dagen <= 3) return 'vandaag';
    return 'deze-week';
}

function wanneer(dagen: number): string {
    if (dagen <= 0) return 'Vandaag';
    if (dagen === 1) return 'Morgen';
    return `Over ${dagen} dagen`;
}

/** Het venster voor de query: van vandaag tot en met een week vooruit. */
export function seintjeVenster(nu: Date): { van: string; tot: string } {
    const tot = new Date(nu);
    tot.setDate(tot.getDate() + SEINTJE_DAGEN);
    return { van: dagISO(nu), tot: dagISO(tot) };
}

/** Orders → taken, de vroegste afhaaldag eerst. Alleen zelf ingevoerd en binnen de week. */
export function bestellingTaken(rijen: readonly ZelfIngevoerdeRij[], nu: Date): Taak[] {
    const uit: { dagen: number; taak: Taak }[] = [];
    for (const o of rijen) {
        if (!isZelfIngevoerd(o.bron) || !o.winkel_order_regels.length) continue;
        const dag = o.winkel_order_regels.map((r) => r.klaar_op).sort()[0]!;
        const dagen = dagenTot(dag, nu);
        if (dagen < 0 || dagen > SEINTJE_DAGEN) continue;
        const wat = o.winkel_order_regels.map((r) => `${r.aantal}× ${r.naam}`).join(', ');
        const volgt = o.winkel_order_regels.filter((r) => r.prijs_volgt).length;
        const detail = [
            ...letOpPunten(o.wensen),
            volgt ? `prijs volgt (${volgt})` : null,
            `${BRON_LABEL[o.bron]} · ${o.nummer}`,
        ].filter(Boolean).join(' · ');
        uit.push({
            dagen,
            taak: {
                id: `bestelling-${o.id}`,
                urgentie: seintjeUrgentie(dagen),
                tijd: '',
                titel: `${wanneer(dagen)}: ${o.contact_naam} — ${wat}`,
                detail,
                actie: 'Bekijk',
                href: BESTELLING_HREF,
                bron: 'winkel',
                onderwerp: `bestelling:${o.id}`,
            },
        });
    }
    return uit.sort((a, b) => a.dagen - b.dagen).map((x) => x.taak);
}
