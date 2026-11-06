import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/* Vercel Cron roept elke route met GET aan. Een route die alleen POST kent,
   geeft dan stil een 405 en de dagtaak draait nooit. */
const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
    crons: { path: string }[];
};

describe('dagtaken in vercel.json', () => {
    it.each(vercel.crons.map((c) => c.path))('%s reageert op GET', (pad) => {
        const bron = readFileSync(join(process.cwd(), 'src/app', pad, 'route.ts'), 'utf8');
        expect(bron).toMatch(/export\s+(async\s+function|const)\s+GET\b/);
    });

    it.each(vercel.crons.map((c) => c.path))('%s vraagt om CRON_SECRET', (pad) => {
        const bron = readFileSync(join(process.cwd(), 'src/app', pad, 'route.ts'), 'utf8');
        expect(bron).toContain('CRON_SECRET');
    });
});
