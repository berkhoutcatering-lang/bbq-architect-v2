/**
 * "Om naar te kijken" op het Overzicht: de punten van de dagen en van het
 * kasboek, elk met de plek waar je het oplost. Zuiver.
 *
 * Een kasverschil staat in het kasboek mét de dag erbij; het punt van de dag
 * zelf wordt daarom overgeslagen, zodat het er één keer staat.
 */
import type { Dagboeking } from './dagboeking';
import type { Kasboek } from './kasboek';

export interface Punt {
    tekst: string;
    href: string;
}

const korteDag = (datum: string) =>
    new Date(`${datum}T12:00:00Z`).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export function verzamelPunten(dagen: readonly Dagboeking[], kasboek: Kasboek, zonderInkoopprijs: number): Punt[] {
    const uit: Punt[] = [];

    for (const d of dagen) {
        for (const p of d.punten) {
            if (p.startsWith('Kasverschil')) continue;
            uit.push({
                tekst: `${korteDag(d.datum)}: ${p}`,
                href: d.stand === 'open' ? `/winkelboek/dag/${d.datum}` : '/verkoop/toonbank/dagstaten',
            });
        }
    }

    for (const p of kasboek.punten) {
        uit.push({ tekst: p, href: p.startsWith('Kasverschil') ? '/verkoop/toonbank/dagstaten' : '/winkelboek/kasboek' });
    }

    if (zonderInkoopprijs > 0) {
        uit.push({
            tekst: `${zonderInkoopprijs} ${zonderInkoopprijs === 1 ? 'artikel' : 'artikelen'} zonder inkoopprijs: de marge telt niet mee tot de prijs er staat.`,
            href: '/winkelboek/verkoop',
        });
    }
    return uit;
}
