/**
 * GET /api/systeem/pdf-textlayer-check
 *
 * Controleert of de PDF-tekstlaag-extractie het op déze omgeving daadwerkelijk
 * doet. Bestaat omdat een stille terugval op 2026-07-26 een kapotte uitrol er
 * werkend uit liet zien: lokaal haalde de extractor 405 van de 405 prijsregels,
 * op productie bereikte de tekstlaag het model nooit (zichtbaar aan
 * input_tokens=94 in de Anthropic-batch). De oorzaak — pdfjs-bestanden die niet
 * mee-deployden — was niet te zien zonder deze check.
 *
 * Maakt zelf een mini-PDF met bekende tekst, haalt die er weer uit en meldt
 * eerlijk wat er misgaat. Alleen voor ingelogde gebruikers; geen klantdata.
 */
import { NextResponse } from 'next/server';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { createServerSupabase } from '@/lib/supabase-server';
import { extractPdfPageLines, countPriceLikeLines } from '@/lib/server/pdfTextLayer';
import { ensurePdfDomGlobals } from '@/lib/server/pdfDomGlobals';

/* Zonder maxDuration kapt Vercel deze functie af op de standaardlimiet. Voor een
   route die een AI-model aanroept is dat te kort: 41 van de 48 AI-routes zetten
   hem al, deze zeven niet — waaronder today-briefing (draait op de startpagina)
   en ai-execute (voert alle AI-acties uit). */
export const maxDuration = 60;


export const runtime = 'nodejs';

const PROBE_LINES = [
    'Artikel Omschrijving Prijs Eh.',
    '700870 BRASVAR COPPA. 21,950 KG',
    '108351 RILLETTES COPPA BRASVAR 100 GR 4,450 ST',
];

export async function GET() {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    /* 1) Laadt pdfjs überhaupt op deze runtime? Dit is de stap die op
       productie faalde terwijl 'ie lokaal prima werkte. */
    let moduleOk = false;
    let moduleError: string | null = null;
    try {
        ensurePdfDomGlobals();
        await import('pdfjs-dist/legacy/build/pdf.mjs');
        moduleOk = true;
    } catch (e) {
        moduleError = `${(e as Error)?.name}: ${(e as Error)?.message?.slice(0, 300)}`;
    }

    /* 2) End-to-end: schrijf bekende regels naar een PDF en lees ze terug. */
    let extracted: string[] = [];
    let priceLines = 0;
    let extractError: string | null = null;
    try {
        const doc = await PDFDocument.create();
        const page = doc.addPage([595, 842]);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        PROBE_LINES.forEach((line, i) => {
            page.drawText(line, { x: 40, y: 780 - i * 20, size: 11, font });
        });
        const buf = Buffer.from(await doc.save());

        const pages = await extractPdfPageLines(buf);
        if (pages) {
            extracted = pages.flatMap(p => p.lines);
            priceLines = countPriceLikeLines(pages);
        }
    } catch (e) {
        extractError = `${(e as Error)?.name}: ${(e as Error)?.message?.slice(0, 300)}`;
    }

    const foundCoppa = extracted.some(l => /BRASVAR COPPA/i.test(l));
    const ok = moduleOk && foundCoppa && priceLines >= 2;

    return NextResponse.json({
        ok,
        diagnose: ok
            ? 'Tekstlaag-extractie werkt op deze omgeving.'
            : moduleOk
                ? 'pdfjs laadt wél, maar de tekst kwam er niet uit — zie extractError/regels.'
                : 'pdfjs kon niet geladen worden op deze omgeving — de bestanden ontbreken waarschijnlijk in de deploy.',
        moduleOk,
        moduleError,
        extractError,
        regels: extracted,
        prijsregels: priceLines,
    });
}
