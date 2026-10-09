/**
 * Wegzet-taken op Vandaag (BA-6, plan v5 §M1).
 *
 * De view winkel_wegzet_taken geeft per betaalde webshoporder wat er nog uit
 * het schap apart moet. Hier wordt elke rij één Taak voor de takenlijst, met
 * bron 'winkel' en het vaste onderwerp wegzet:{order_id}. Zo laten de
 * woordregels van taken-samenvoegen ("bestel", "voorraad") hem nooit met een
 * bestel- of voorraadmelding samenvallen, en blijft het één regel per order.
 *
 * Urgentie volgt het afhaalmoment: binnen 24 uur (of al voorbij) = nu (rood),
 * binnen 3 dagen = vandaag, binnen een week = deze week, anders later.
 * Puur: de klok komt van buiten.
 */
import { afhaalTekst, isRood, taakTekst, taakUitRij, type WegzetTaak } from '@/lib/winkel/wegzetten';
import type { Taak, TaakUrgentie } from './taken-samenvoegen';

/** Het paneel "Apart zetten" op de webshop-pagina. */
export const WEGZET_HREF = '/verkoop/webshop#apartzetten';

const UUR = 60 * 60 * 1000;

export function wegzetUrgentie(taak: Pick<WegzetTaak, 'afhaalmoment' | 'ophalen_binnen_24u'>, nu: Date): TaakUrgentie {
    if (isRood(taak, nu)) return 'nu';
    const t = taak.afhaalmoment ? new Date(taak.afhaalmoment).getTime() : Number.NaN;
    if (Number.isNaN(t)) return 'vandaag';
    const over = t - nu.getTime();
    if (over <= 72 * UUR) return 'vandaag';
    if (over <= 7 * 24 * UUR) return 'deze-week';
    return 'later';
}

/** Het afhaalmoment als getal om op te sorteren; geen moment = achteraan. */
const wanneer = (t: WegzetTaak) => {
    const ms = t.afhaalmoment ? new Date(t.afhaalmoment).getTime() : Number.NaN;
    return Number.isNaN(ms) ? Number.MAX_SAFE_INTEGER : ms;
};

/** Rijen uit winkel_wegzet_taken → taken voor Vandaag, de vroegste ophaler eerst. */
export function wegzetTakenNaarTaken(rijen: readonly unknown[], nu: Date): Taak[] {
    return rijen
        .map(taakUitRij)
        .filter((t): t is WegzetTaak => t !== null)
        .sort((a, b) => wanneer(a) - wanneer(b) || a.order_id - b.order_id)
        .map((t) => ({
            id: `wegzet-${t.order_id}`,
            urgentie: wegzetUrgentie(t, nu),
            tijd: '',
            titel: taakTekst(t),
            detail: `Webshop · ophalen ${afhaalTekst(t.afhaalmoment)}`,
            actie: 'Zet apart',
            href: WEGZET_HREF,
            bron: 'winkel' as const,
            onderwerp: `wegzet:${t.order_id}`,
        }));
}
