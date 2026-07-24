/* adapters/registry — centraal register van uitvoerbare adapters.
 * Domeinherkenning gebeurt hier; de oude losse detectAdapter/selectors in
 * adapters.js zijn vervangen door echte modules met een vast contract. */

import { assertAdapter } from './types.js';
import { baktotaalAdapter } from './baktotaal.js';
import { syntheticAdapter } from './synthetic.js';

const ADAPTERS = [baktotaalAdapter, syntheticAdapter];
ADAPTERS.forEach(assertAdapter);

export function detectAdapter(url) {
    return ADAPTERS.find((a) => a.matches(url)) || null;
}
export function getAdapter(key) {
    return ADAPTERS.find((a) => a.key === key) || null;
}
export function listAdapters() {
    return ADAPTERS.map((a) => ({ key: a.key, version: a.version, displayName: a.displayName, origins: a.origins }));
}
