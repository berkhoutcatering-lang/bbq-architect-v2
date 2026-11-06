import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/* De rem uit docs/een-geheel-plan.md, blok 3.
   Elk scherm bouwde zijn eigen knoppen en kleuren. Die achterstand mag alleen
   nog dalen: wordt een teller lager, zet het plafond dan hier ook lager. Een
   nieuwe losse knop of vaste kleur laat deze test falen; gebruik Button en de
   kleuren uit globals.css. */
const PLAFOND = { losseKnoppen: 1603, vasteKleuren: 1699 };

function bestanden(map: string): string[] {
    return readdirSync(map).flatMap((naam) => {
        const pad = join(map, naam);
        if (statSync(pad).isDirectory()) return bestanden(pad);
        return pad.endsWith('.tsx') && !pad.endsWith('.test.tsx') ? [pad] : [];
    });
}

describe('rem op losse onderdelen', () => {
    const bron = bestanden(join(process.cwd(), 'src')).map((f) => readFileSync(f, 'utf8')).join('\n');

    it('geen nieuwe losse knoppen', () => {
        expect((bron.match(/<button/g) ?? []).length).toBeLessThanOrEqual(PLAFOND.losseKnoppen);
    });

    it('geen nieuwe vaste kleuren', () => {
        expect((bron.match(/#[0-9a-fA-F]{6}\b/g) ?? []).length).toBeLessThanOrEqual(PLAFOND.vasteKleuren);
    });
});
