/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabase } from '@/lib/supabase-server';
import { logAiUsageServer } from '@/lib/aiUsageServer';
import { estimateAiCostCentsPure as estimateAiCostCents } from '@/lib/aiCostEstimate';
import { enforceAiCap } from '@/lib/aiCostCap';

export const runtime = 'nodejs';
export const maxDuration = 20;

/*
 * AI Chef Coach — persistent assistant voor Service KDS
 * ─────────────────────────────────────────────────────
 * Op basis van live event-state genereert deze endpoint korte directives
 * zoals een echte head-chef zou doen. Houdt rekening met:
 *  - tijd t.o.v. service-momenten (countdown)
 *  - mise-progress (% klaar per gang)
 *  - smoker-status (temp / target / ETA)
 *  - allergie-waarschuwingen (kritisch hoog flaggen)
 *  - chef-vraag (optioneel — als gebruiker actief vraagt)
 */

const SYSTEM = `Je bent ROOK MAART, een ervaren Nederlandse BBQ-pitmaster. Je werkt als persistent AI-coach in een Kitchen Display System tijdens live BBQ-events.

CONTEXT DIE JE KRIJGT (in user-message):
- NU (huidige tijd HH:MM)
- VIEW: waar pitmaster nu kijkt (hub/board/detail/wrapup)
- EVENT: titel + venue + gasten
- GANG-OVERZICHT: lijst alle gangen met status (queued/active/ready/served) en portions-voortgang
- ACTIEVE/HUIDIGE GANG: titel, status, omschrijving — dit is wat de chef NU bekijkt
- VOLGENDE GANG met minuten countdown
- MISE: % klaar + open mise-items, kritisch gemarkeerd
- SMOKER: item op smoker, temp, target, ETA
- ALLERGIE-TABEL: per gast met tafelnummer, naam, allergenen-codes, severity

WAT ROOK MOET DOEN:
- Lees ALLES — vooral de allergie-tabel (kritisch voor veiligheid)
- Bepaal wat NU het meest urgent is op basis van: tijd vs course-start, mise-progress,
  allergie-risico, smoker-status
- Bij allergie: noem altijd CONCRETE tafel + persoon ("T3 Maaike pinda — aparte plank")
- Bij timing-issue: noem concrete tijdstip / minuten ("brisket over 12m klaar")
- Bij wrapup-view: focus op opruim-volgorde + waste-tracking + feedback-suggesties
- Bij hub-view: korte algemene status, geen specifieke directives

PERSOONLIJKHEID:
- Direct, kort, zonder gezeur — zoals een echte head-chef
- Vaktaal (smoker, mise, internal temp, slicen, plate)
- Geen beleefdheidsformules
- Wel aanmoediging bij goed werk ("strak werk", "mooi op tijd")
- "jij" / "je", collegiaal
- Nooit emoji's

OUTPUT-FORMAT (ALLEEN dit JSON-object, geen extra tekst):
{
  "directive": "1 zin, max 14 woorden — concrete actie of observatie",
  "severity": "praise" | "normal" | "urgent" | "critical",
  "actionLabel": "korte CTA max 3 woorden ('Mac in oven') | null",
  "context": "1 korte zin extra context max 16 woorden | null"
}

SEVERITY GIDS:
- "critical": allergie-mismatch dreigt, missende mise <5min voor service, smoker faalt
- "urgent": actie nodig binnen 15min, gang dreigt achter te lopen
- "normal": vooruitkijkend, planning, kleine tip
- "praise": alles loopt strak of stap goed afgerond

Voorbeelden:
- {"directive":"Tafel 3 pinda-allergie — satay zonder pindasaus apart","severity":"critical","actionLabel":"Aparte plank","context":"Maaike T3 strikt"}
- {"directive":"Brisket op 91°C, klaar over 12 min","severity":"normal","actionLabel":null,"context":"Begin mac om 17:45"}
- {"directive":"Mooi tempo, 4 van 8 gangen klaar","severity":"praise","actionLabel":null,"context":null}
- {"directive":"Mise gang 5 nog op 60% — focus","severity":"urgent","actionLabel":"PP opwarmen","context":"Service over 18min"}`;

interface ChefContext {
    now: string;                   // HH:MM
    eventTitle?: string;
    eventVenue?: string;
    eventGuests?: number;
    activeCourseId?: string;
    activeCourseTitle?: string;
    activeCourseStart?: string;    // HH:MM
    activeCourseStatus?: string;   // 'prep' | 'active' | etc
    activeCourseDescription?: string;
    minsUntilNextCourse?: number;
    nextCourseTitle?: string;
    misePctDone?: number;          // 0-100
    miseRemaining?: { label: string; critical?: boolean }[];
    coursesProgress?: { num: number; title: string; status: string; servedPortions?: number; totalPortions?: number }[];
    smoker?: { item: string; temp: number; target: number; etaMinutes: number };
    allergies?: { person: string; issue: string; severity: string; table?: number; allergens?: string[] }[];
    currentView?: string;          // hub | board | detail | wrapup
    userQuestion?: string;          // optioneel — als gebruiker actief vraagt
}

export async function POST(req: NextRequest) {
    try {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return NextResponse.json({ error: 'Geen API key' }, { status: 500 });

        const supabase = await createServerSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

        const { data: memberData } = await supabase
            .from('organization_members').select('organization_id')
            .eq('user_id', user.id).eq('status', 'active').limit(1);
        const orgId = memberData?.[0]?.organization_id || null;

        // AI hard-cap: Haiku streaming ≈ €0.02 per chef-coach-call.
        if (orgId) {
            const capRes = await enforceAiCap(orgId, 0.02);
            if (capRes) return capRes;
        }

        const ctx = (await req.json()) as ChefContext;

        /* Bouw concrete context op zodat Rook weet wát hij ziet en op welke
           informatie hij moet acteren. Lege velden worden genegeerd. */
        const lines: string[] = [];
        lines.push(`NU: ${ctx.now}`);
        if (ctx.currentView) lines.push(`VIEW: ${ctx.currentView}  (hub=event-keuze, board=kanban, detail=gang-instructies, wrapup=opruim/feedback)`);
        if (ctx.eventTitle) lines.push(`EVENT: ${ctx.eventTitle}${ctx.eventVenue ? ` · ${ctx.eventVenue}` : ''}${ctx.eventGuests ? ` · ${ctx.eventGuests} gasten` : ''}`);

        if (ctx.coursesProgress && ctx.coursesProgress.length > 0) {
            lines.push(`\nGANG-OVERZICHT:`);
            ctx.coursesProgress.forEach(c => {
                const portions = c.totalPortions ? ` ${c.servedPortions || 0}/${c.totalPortions}p` : '';
                lines.push(`  ${c.num}. ${c.title} → ${c.status}${portions}`);
            });
        }

        if (ctx.activeCourseTitle) {
            lines.push(`\nACTIEVE/HUIDIGE GANG: "${ctx.activeCourseTitle}" (status: ${ctx.activeCourseStatus || '?'})`);
            if (ctx.activeCourseStart) lines.push(`  starttijd: ${ctx.activeCourseStart}`);
            if (ctx.activeCourseDescription) lines.push(`  omschrijving: ${ctx.activeCourseDescription}`);
        }

        if (ctx.minsUntilNextCourse !== undefined && ctx.nextCourseTitle) {
            lines.push(`\nVOLGENDE GANG: "${ctx.nextCourseTitle}" over ${ctx.minsUntilNextCourse} min`);
        }

        if (ctx.misePctDone !== undefined) lines.push(`\nMISE: ${ctx.misePctDone}% klaar`);
        if (ctx.miseRemaining && ctx.miseRemaining.length > 0) {
            lines.push(`MISE-OPEN:`);
            ctx.miseRemaining.slice(0, 10).forEach(m => lines.push(`  • ${m.label}${m.critical ? ' [CRITICAL]' : ''}`));
        }

        if (ctx.smoker) {
            lines.push(`\nSMOKER: ${ctx.smoker.item}`);
            lines.push(`  temp ${ctx.smoker.temp}°C → target ${ctx.smoker.target}°C · ETA ${ctx.smoker.etaMinutes}m`);
        }

        if (ctx.allergies && ctx.allergies.length > 0) {
            lines.push(`\nALLERGIE-TABEL (per gast):`);
            ctx.allergies.forEach(a => {
                const t = a.table !== undefined ? `T${a.table} ` : '';
                const al = a.allergens && a.allergens.length > 0 ? ` [${a.allergens.join(',')}]` : '';
                lines.push(`  ${t}${a.person}: ${a.issue}${al} (${a.severity})`);
            });
        }

        const userMessage = `LIVE EVENT-CONTEXT:
${lines.join('\n')}

${ctx.userQuestion ? `\nVRAAG VAN PITMASTER: "${ctx.userQuestion}"` : '\n(Geen specifieke vraag — geef proactief de meest waardevolle directive op basis van bovenstaande state.)'}

Geef je directive als JSON.`;

        const client = new Anthropic({ apiKey });
        const response = await client.messages.create({
            model: 'claude-haiku-4-5',
            max_tokens: 350,
            system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: userMessage }],
        });

        if (orgId) {
            void logAiUsageServer({
                organization_id: orgId,
                user_id: user.id,
                action_type: 'chat',
                model: 'claude-haiku-4-5',
                tokens_input: response.usage.input_tokens || 0,
                tokens_output: response.usage.output_tokens || 0,
                tokens_cache_read: response.usage.cache_read_input_tokens || 0,
                tokens_cache_creation: response.usage.cache_creation_input_tokens || 0,
                cost_eur_cents: estimateAiCostCents({
                    model: 'claude-haiku-4-5',
                    tokens_input: response.usage.input_tokens || 0,
                    tokens_output: response.usage.output_tokens || 0,
                    tokens_cache_read: response.usage.cache_read_input_tokens || 0,
                    tokens_cache_creation: response.usage.cache_creation_input_tokens || 0,
                }),
                metadata: { source: 'chef_coach' },
            });
        }

        const textBlock = response.content.find(b => b.type === 'text');
        const text = textBlock && textBlock.type === 'text' ? textBlock.text : '{}';

        /* JSON-recovery */
        let parsed: any = null;
        try { parsed = JSON.parse(text); } catch {
            const m = text.match(/\{[\s\S]*\}/);
            if (m) try { parsed = JSON.parse(m[0]); } catch { /* */ }
        }
        if (!parsed) parsed = { directive: 'Alles loopt — kom terug over een paar minuten.', severity: 'normal' };

        return NextResponse.json({
            success: true,
            ...parsed,
            generatedAt: new Date().toISOString(),
        });
    } catch (e: any) {
        console.error('[chef-coach]', e);
        return NextResponse.json({ error: e?.message || 'Onbekende fout' }, { status: 500 });
    }
}
