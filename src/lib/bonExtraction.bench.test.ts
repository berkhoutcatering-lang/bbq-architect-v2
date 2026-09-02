/**
 * Meetbank voor de bon-uitlezer, op ECHTE facturen.
 *
 * Draait niet mee in de gewone testronde: hij kost geld (echte AI-calls) en
 * heeft facturen nodig die om privacy-redenen nooit in de repo staan. Alleen
 * met een map vol bonnen:
 *
 *   BON_BENCH_DIR=/pad/naar/facturen npx vitest run src/lib/bonExtraction.bench.test.ts
 *
 * Die map maak je met `node scripts/bon-fixtures-download.mjs <map>` — dat
 * haalt de bestanden van eerdere scans uit Storage, met een index.json van wat
 * er nu in de database staat. Dat is het ijkpunt: het is de output van de
 * scanner zoals hij in productie draaide.
 *
 * Wat de bank meet, per factuur:
 *   - welke route hij pakt (tekst of vision) en met welke modellen
 *   - of de regels optellen tot het totaal (reconciliation)
 *   - wat het kost
 *   - hoe het totaal zich verhoudt tot wat er in de database staat
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

/* De bank mag de ai_usage-tabel van een echte organisatie niet vervuilen. */
vi.mock('./aiUsageServer', () => ({
    logAiUsageServer: async () => undefined,
    checkAiCapServer: async () => ({ status: 'ok' }),
}));

import { runBonExtractionLadder, type ExtractionMode } from './bonExtractionPasses';
import { isUsableText } from './pdfTextExtract';
import { findSupplierHintInText } from './bonSupplierHints';
import { extractPdfPageLines, formatPageLinesForPrompt } from './server/pdfTextLayer';

const DIR = process.env.BON_BENCH_DIR;

interface IndexRow {
    bon_id: number;
    file: string;
    mime: string | null;
    db: {
        winkel: string | null;
        datum: string | null;
        totaal_bedrag: number | null;
        items_count: number;
    };
}

function euro(n: number | null | undefined): string {
    if (n === null || n === undefined) return '—'.padStart(9);
    return `€${n.toFixed(2)}`.padStart(9);
}

describe.skipIf(!DIR)('bon-uitlezer op echte facturen', () => {
    let rows: IndexRow[] = [];
    let client: Anthropic;

    beforeAll(() => {
        /* .env.local zelf inlezen — vitest doet dat niet. */
        const envPath = path.resolve(process.cwd(), '.env.local');
        if (fs.existsSync(envPath)) {
            for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
                const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
                if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
            }
        }
        client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        rows = JSON.parse(fs.readFileSync(path.join(DIR!, 'index.json'), 'utf8'));
    });

    it('leest elke factuur en rapporteert route, kloppendheid en kosten', async () => {
        const only = process.env.BON_BENCH_ONLY?.split(',').map(Number);
        const todo = only ? rows.filter(r => only.includes(r.bon_id)) : rows;

        const regels: string[] = [
            'bon  leverancier            route   hint      modellen        regels    totaal-nu   totaal-db   klopt        kosten',
            '─'.repeat(118),
        ];

        let totalCost = 0;
        const uitkomsten: Array<{ bon: number; ok: boolean; delta: number | null }> = [];
        const detail: unknown[] = [];

        for (const row of todo) {
            const buf = fs.readFileSync(path.join(DIR!, row.file));
            const isPdf = row.file.endsWith('.pdf');

            /* Exact de routekeuze uit /api/bonnen/extract. */
            let mode: ExtractionMode;
            let bonText = '';
            if (isPdf) {
                const pages = await extractPdfPageLines(buf);
                if (pages) {
                    const text = formatPageLinesForPrompt(pages);
                    if (isUsableText(text)) bonText = text;
                }
                mode = bonText
                    ? { kind: 'pdf_text', text: bonText }
                    : { kind: 'pdf_document', base64: buf.toString('base64') };
            } else {
                mode = { kind: 'image', mediaType: 'image/jpeg', base64: buf.toString('base64') };
            }
            const hint = findSupplierHintInText(bonText || row.file);

            const ladder = await runBonExtractionLadder({
                client,
                mode,
                cap_status: 'ok',
                organization_id: 'bench',
                user_id: null,
                pdf_base64_for_vision_fallback: isPdf ? buf.toString('base64') : undefined,
                initial_supplier_hint: hint?.hint ?? null,
            });

            const f = ladder.final;
            const kosten = ladder.total_cost_eur_cents / 100;
            totalCost += kosten;

            const dbTotaal = row.db.totaal_bedrag;
            const delta = dbTotaal !== null && f.totaal_bedrag !== null ? f.totaal_bedrag - dbTotaal : null;

            regels.push(
                `#${String(row.bon_id).padEnd(3)} ` +
                    `${String(f.leverancier ?? '—').slice(0, 22).padEnd(22)} ` +
                    `${(mode.kind === 'pdf_text' ? 'tekst' : mode.kind === 'image' ? 'foto' : 'vision').padEnd(7)} ` +
                    `${(hint?.displayName ?? '—').padEnd(9)} ` +
                    `${ladder.passes.map(p => p.engine).join('→').padEnd(15)} ` +
                    `${String(f.items.length).padStart(4)}/${String(row.db.items_count).padEnd(4)} ` +
                    `${euro(f.totaal_bedrag)} ${euro(dbTotaal)} ` +
                    `${f.reconciliation.status.padEnd(12)} €${kosten.toFixed(4)}`,
            );

            uitkomsten.push({ bon: row.bon_id, ok: f.reconciliation.status === 'ok', delta });
            detail.push({
                bon_id: row.bon_id,
                route: mode.kind,
                hint: hint?.key ?? null,
                passes: ladder.passes.map(p => ({ engine: p.engine, confidence: p.confidence, items: p.items.length, reconciliation: p.reconciliation.status })),
                leverancier: f.leverancier,
                datum: f.datum,
                totaal_bedrag: f.totaal_bedrag,
                prices_include_btw: f.prices_include_btw,
                reconciliation: f.reconciliation,
                kosten_eur: kosten,
                db: row.db,
                items: f.items,
            });
        }

        const klopt = uitkomsten.filter(u => u.ok).length;
        const gelijk = uitkomsten.filter(u => u.delta !== null && Math.abs(u.delta) < 0.01).length;
        regels.push('─'.repeat(118));
        regels.push(
            `${todo.length} facturen · regels tellen op bij ${klopt} · zelfde totaal als database bij ${gelijk} · totaal €${totalCost.toFixed(2)}`,
        );
        const afwijkend = uitkomsten.filter(u => u.delta !== null && Math.abs(u.delta) >= 0.01);
        for (const a of afwijkend) regels.push(`  afwijking bon #${a.bon}: €${a.delta!.toFixed(2)}`);

        /* Naar bestand, want vitest slikt console-output op. */
        const rapport = regels.join('\n');
        fs.writeFileSync(path.join(DIR!, 'rapport.txt'), rapport + '\n');
        fs.writeFileSync(path.join(DIR!, 'rapport.json'), JSON.stringify(detail, null, 2));
        console.log('\n' + rapport);

        expect(todo.length).toBeGreaterThan(0);
    }, 30 * 60 * 1000);
});
