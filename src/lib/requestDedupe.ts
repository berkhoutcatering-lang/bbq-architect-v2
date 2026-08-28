/**
 * Deelt gelijktijdige, identieke database-verzoeken.
 *
 * Meerdere hooks vragen bij het opstarten hetzelfde op zonder van elkaar te
 * weten: op de startpagina gingen `organization_members`, `organizations` en
 * `settings` elk vier keer de deur uit, en `gerechten` drie keer. Elke hook
 * heeft z'n eigen state, dus geen van hen kon zien dat de vraag al liep.
 *
 * `dedupe` houdt per sleutel bij welk verzoek op dit moment onderweg is en
 * geeft dezelfde belofte terug aan iedereen die er in de tussentijd om vraagt.
 *
 * Bewust géén cache ná afloop: zodra het antwoord binnen is, verdwijnt de
 * sleutel weer. Een volgende vraag doet dus gewoon een nieuw verzoek. Daarmee
 * kan dit nooit verouderde data serveren — het enige wat wegvalt is werk dat
 * letterlijk dubbel tegelijk gebeurde.
 *
 * Let op: alle wachters krijgen hetzelfde resultaat-object terug. Lees het,
 * muteer het niet.
 */
const inflight = new Map<string, Promise<unknown>>();

export function dedupe<T>(key: string, run: () => PromiseLike<T>): Promise<T> {
    const lopend = inflight.get(key);
    if (lopend) return lopend as Promise<T>;

    const belofte = Promise.resolve(run()).finally(function () {
        inflight.delete(key);
    });
    inflight.set(key, belofte);
    return belofte;
}

/** Alleen voor tests — vergeet wat er onderweg is. */
export function _resetDedupe(): void {
    inflight.clear();
}
