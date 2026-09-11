/**
 * Twee wachthonden rond de koppeling met de Experience-app.
 *
 * Ze bewaken afspraken die je niet in een type kunt vangen en die precies het
 * soort ding zijn dat "even tijdelijk" wordt gebroken en dan blijft staan:
 *
 *   1. BBQ Architect maakt NOOIT zelf een token. Eén generator, in de andere
 *      app. Een tweede — ook een tijdelijke placeholder — betekent twee dozen
 *      met dezelfde belofte en een QR die nergens op uitkomt.
 *
 *   2. Een geheime sleutel krijgt nooit een voorvoegsel dat de bundler
 *      inbakt. `VITE_` en `NEXT_PUBLIC_` doen allebei precies dat: alles met
 *      dat voorvoegsel gaat mee in de JavaScript die elke bezoeker binnenhaalt.
 *      Dat is waarom de Supabase anon-sleutel daar publiek mag zijn, en waarom
 *      elke andere sleutel daar niet mag staan.
 *
 * Het is een touw, geen muur: wie er per se omheen wil, kan dat. Maar het gaat
 * af in de diff, en dan is het een keuze in plaats van een ongelukje.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '..');
const DIT_BESTAND = path.relative(SRC, __filename);

function bronbestanden(): Array<{ pad: string; inhoud: string }> {
    const uit: Array<{ pad: string; inhoud: string }> = [];
    (function loop(dir: string) {
        for (const naam of readdirSync(dir)) {
            const vol = path.join(dir, naam);
            if (statSync(vol).isDirectory()) { loop(vol); continue; }
            if (!/\.(ts|tsx)$/.test(naam)) continue;
            const rel = path.relative(SRC, vol);
            if (rel === DIT_BESTAND) continue;   // dit bestand noemt alles bij naam
            uit.push({ pad: rel, inhoud: readFileSync(vol, 'utf8') });
        }
    })(SRC);
    return uit;
}

const BESTANDEN = bronbestanden();

describe('geen tweede token-generator in deze repo', () => {
    /* Bewust uitgezonderd, met de reden erbij. Elke toevoeging hier is een
       bewuste handeling die in de diff zichtbaar wordt. */
    const UITGEZONDERD = new Set<string>([]);

    const GENERATOR = /crypto\.randomUUID|randomUUID\(|nanoid\(|uuidv4\(|Math\.random/;

    it('nergens wordt een token-achtige waarde zelf gemaakt', () => {
        const overtredingen: string[] = [];

        for (const { pad, inhoud } of BESTANDEN) {
            if (UITGEZONDERD.has(pad)) continue;
            inhoud.split('\n').forEach((regel, i) => {
                if (!GENERATOR.test(regel)) return;
                if (!/token/i.test(regel)) return;
                overtredingen.push(`${pad}:${i + 1}  ${regel.trim()}`);
            });
        }

        expect(
            overtredingen,
            'Hier wordt een token gemaakt. Tokens komen uit de Experience-app — zie docs/bestelstroom-bouwplan.md §3.',
        ).toEqual([]);
    });

    it('experience_token wordt alleen geschreven waar de koppeling woont', () => {
        /* Sterker dan de vorige controle: hoe de waarde ook gemaakt is, alleen
           deze bestanden mogen hem op een bestelling zetten. */
        const MAG_SCHRIJVEN = new Set([
            path.join('lib', 'koppelBestelling.ts'),
        ]);

        /* Een TYPE noemen mag overal — de hub toont de koppelstatus en heeft
           het veld dus in zijn interface staan. Een WAARDE toekennen mag alleen
           in de koppelstap. Verschil: een declaratie eindigt op een type met
           een puntkomma, een toekenning op een uitdrukking met een komma. */
        const DECLARATIE = /^\s*experience_token\??\s*:\s*[\w\s|'"[\]<>.]+;?\s*(\/\/.*)?$/;

        const schrijvers = BESTANDEN
            /* Tests bouwen fixtures met dit veld erin en dat hoort ook zo — ze
               schrijven nergens naartoe. Deze wachthond gaat over code die
               daadwerkelijk draait. */
            .filter(({ pad }) => !/\.test\.tsx?$/.test(pad))
            .filter(({ inhoud }) => inhoud.split('\n').some(
                (regel) => /experience_token\s*:/.test(regel) && !DECLARATIE.test(regel),
            ))
            .map(({ pad }) => pad)
            .filter((pad) => !MAG_SCHRIJVEN.has(pad));

        expect(
            schrijvers,
            'Dit bestand schrijft experience_token. Dat hoort alleen in de koppelstap te gebeuren.',
        ).toEqual([]);
    });
});

describe('geen geheim achter een voorvoegsel dat de bundler inbakt', () => {
    /* Deze twee zijn publiek bedoeld: de anon-sleutel is beschermd door RLS,
       niet door geheimhouding, en de dev-inloggegevens draaien alleen lokaal. */
    const MAG_PUBLIEK = new Set([
        'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        'NEXT_PUBLIC_DEV_QUICK_PASSWORD',
    ]);

    const VERDACHT = /\b((?:VITE|NEXT_PUBLIC)_[A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)[A-Z0-9_]*)\b/g;

    it('geen VITE_ of NEXT_PUBLIC_ variabele met key, secret of token in de naam', () => {
        const gevonden = new Map<string, string>();

        for (const { pad, inhoud } of BESTANDEN) {
            for (const m of inhoud.matchAll(VERDACHT)) {
                const naam = m[1];
                if (MAG_PUBLIEK.has(naam)) continue;
                if (!gevonden.has(naam)) gevonden.set(naam, pad);
            }
        }

        expect(
            Array.from(gevonden, ([naam, pad]) => `${naam} (${pad})`),
            'Alles met VITE_ of NEXT_PUBLIC_ gaat mee in de bundel die elke bezoeker binnenhaalt. Haal het voorvoegsel weg.',
        ).toEqual([]);
    });

    it('de Experience-sleutel heet EXPERIENCE_API_KEY, zonder voorvoegsel', () => {
        const api = BESTANDEN.find(({ pad }) => pad === path.join('lib', 'experienceApi.ts'));
        expect(api, 'src/lib/experienceApi.ts is verdwenen of hernoemd').toBeDefined();
        expect(api!.inhoud).toContain('process.env.EXPERIENCE_API_KEY');
        expect(api!.inhoud).not.toMatch(/VITE_EXPERIENCE|NEXT_PUBLIC_EXPERIENCE/);
    });
});
