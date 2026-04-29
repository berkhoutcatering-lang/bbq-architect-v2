// One-off integratie-test voor de denkmodi + per-pagina prompts.
// Bypassed Next.js middleware/auth — roept Anthropic direct aan met dezelfde
// system-blocks die /api/chat bouwt.
//
// Run: `node scripts/test-ai-modes.mjs`

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Lees .env.local manueel (dotenv leest alleen .env)
const envFile = readFileSync(join(__dirname, '..', '.env.local'), 'utf8');
for (const line of envFile.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
    console.error('ANTHROPIC_API_KEY ontbreekt');
    process.exit(1);
}

const client = new Anthropic({ apiKey });

// Eenvoudige inline copies van mode-defs en BASE_PERSONA — vermijd TS-import.
const MODES = {
    fast: { model: 'claude-haiku-4-5', maxTokens: 400, thinking: false, temperature: 0.3 },
    standard: { model: 'claude-sonnet-4-6', maxTokens: 1000, thinking: false, temperature: 0.7 },
    deep: { model: 'claude-opus-4-7', maxTokens: 2000, thinking: { effort: 'high' }, temperature: 1 },
};

const BASE_PERSONA = `## JIJ BENT "THE ARCHITECT"
Je bent de meesterbrein-strateeg, data-analist én Executive Chef van Hop & Bites Catering.
Je antwoordt in het Nederlands en formatteert in **Markdown**.`;

const MODE_INSTRUCTIONS = {
    fast: '## OUTPUT-STIJL: SNEL\nAntwoord in MAXIMAAL 3 zinnen. Geen tabellen, geen koppen, geen denkproces. Direct to-the-point.',
    standard: '## OUTPUT-STIJL: STANDAARD\nBeknopt en krachtig — maximaal ~200 woorden. Geen verplichte tabellen.',
    deep: '## OUTPUT-STIJL: DIEP\nDiepgaande analyse. Verplichte Markdown-tabellen bij overzichten.',
};

// Test 1: zelfde vraag, 3 modes — vergelijk lengte
async function testModeLengths() {
    console.log('\n═══ TEST 1: lengte per mode ═══');
    const vraag = 'Wat is een goede dry rub voor brisket?';
    const results = {};

    for (const [modeName, def] of Object.entries(MODES)) {
        const sys = BASE_PERSONA + '\n\n' + MODE_INSTRUCTIONS[modeName];
        const params = {
            model: def.model,
            max_tokens: def.maxTokens,
            system: sys,
            messages: [{ role: 'user', content: vraag }],
            temperature: def.temperature,
        };
        if (def.thinking) {
            params.thinking = { type: 'adaptive' };
            params.output_config = { effort: def.thinking.effort };
        }

        const t0 = Date.now();
        try {
            const resp = await client.messages.create(params);
            const text = resp.content
                .filter((b) => b.type === 'text')
                .map((b) => b.text)
                .join('');
            const thinkingText = resp.content
                .filter((b) => b.type === 'thinking')
                .map((b) => b.thinking)
                .join('');
            const ms = Date.now() - t0;
            results[modeName] = {
                model: def.model,
                outputTokens: resp.usage.output_tokens,
                inputTokens: resp.usage.input_tokens,
                chars: text.length,
                thinkingChars: thinkingText.length,
                ms,
                preview: text.slice(0, 80) + (text.length > 80 ? '…' : ''),
            };
            console.log(`✓ ${modeName.padEnd(8)} | ${def.model.padEnd(20)} | ${String(resp.usage.output_tokens).padStart(4)}t out | ${String(text.length).padStart(4)} chars | ${String(thinkingText.length).padStart(4)} thinking | ${ms}ms`);
            console.log(`           preview: ${text.slice(0, 100).replace(/\n/g, ' ')}…`);
        } catch (err) {
            console.log(`✗ ${modeName}: ${err.message}`);
            results[modeName] = { error: err.message };
        }
    }
    return results;
}

// Test 2: per-pagina prompt → check toonverschil
async function testPagePrompts() {
    console.log('\n═══ TEST 2: per-pagina toon ═══');

    const cases = [
        {
            page: '/voorraad',
            prompt: '**Voorraad** — Hop & Bites foodtruck. Realtime stock.\n\n## Hoofdtaak: bestel-suggestie\nBij "wat moet ik bestellen?": som lage-stock items op (max 7), genereer create_inkooplijst ACTION.',
            mode: 'fast',
            vraag: 'Wat moet ik bestellen voor het volgende event?',
            contextStub: 'Lage voorraad: Brisket (2kg, min 5kg), Houtskool (1 zak, min 3 zakken). volgendEvent: id=42, naam="Bedrijfsfeest Acme", gasten=80.',
        },
        {
            page: '/service',
            prompt: '**Service** — Hop & Bites op locatie, live tijdens een event. Operator heeft 5 seconden.\nMAXIMAAL 1-2 zinnen per antwoord.',
            mode: 'fast',
            vraag: 'Mag de kip op?',
            contextStub: 'Laatste meting kip: 78°C, 2 min geleden.',
        },
        {
            page: '/recepten',
            prompt: '**Recepten** — Hop & Bites kennisbank.\n\n## Diepe modus — kookjournaal toon\nHier mag je uitgebreid: smaakprofiel, techniek-uitweidingen, alternatieven.',
            mode: 'standard',
            vraag: 'Bedenk een nieuw signatuur-recept met buikspek.',
            contextStub: 'Categorieën: Vlees, Vis, Bijgerecht. 12 bestaande recepten in db.',
        },
    ];

    for (const c of cases) {
        const def = MODES[c.mode];
        const sys = BASE_PERSONA + '\n\n' + c.prompt + '\n\n' + MODE_INSTRUCTIONS[c.mode] + '\n\n## Context\n' + c.contextStub;
        const params = {
            model: def.model,
            max_tokens: def.maxTokens,
            system: sys,
            messages: [{ role: 'user', content: c.vraag }],
            temperature: def.temperature,
        };

        try {
            const resp = await client.messages.create(params);
            const text = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
            console.log(`\n— [${c.page}] mode=${c.mode}: "${c.vraag}"`);
            console.log(`  ${resp.usage.output_tokens}t out, ${text.length} chars`);
            console.log(`  ${text.replace(/\n/g, '\n  ').slice(0, 600)}${text.length > 600 ? '…' : ''}`);
        } catch (err) {
            console.log(`✗ [${c.page}] ${err.message}`);
        }
    }
}

(async () => {
    const m = await testModeLengths();
    await testPagePrompts();

    console.log('\n═══ SAMENVATTING ═══');
    if (m.fast && m.standard && m.deep && !m.fast.error && !m.standard.error && !m.deep.error) {
        const ratio = (m.deep.chars / m.fast.chars).toFixed(1);
        console.log(`Snel: ${m.fast.chars} chars, Standaard: ${m.standard.chars} chars, Diep: ${m.deep.chars} chars`);
        console.log(`Diep/Snel ratio: ${ratio}× ${ratio >= 2 ? '✅ duidelijke spreiding' : '⚠️  modi te vergelijkbaar'}`);
        console.log(`Diep thinking content: ${m.deep.thinkingChars} chars ${m.deep.thinkingChars > 0 ? '✅' : '⚠️ thinking niet geactiveerd'}`);
    }
})();
