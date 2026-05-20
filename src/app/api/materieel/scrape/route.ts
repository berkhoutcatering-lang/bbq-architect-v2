/**
 * POST /api/materieel/scrape
 *
 * Input:  { url: string }
 * Output: { specs: MaterieelSpecs, foto_url?: string, source_url: string }
 *
 * Fetcht een leverancier-product-pagina, extraheert text + first product-image,
 * en laat Claude Sonnet 4.6 vision er een gestructureerde specs-bullet uit halen.
 *
 * Hard rules:
 * - Zod-validatie op input
 * - Re-auth via supabase.auth.getUser() — geen service-role
 * - URL-fetch met 10s timeout + User-Agent + max 2 MB body (geen DoS-vector)
 * - SSRF-guard: blokkeer http://localhost / 127.0.0.1 / private IP-ranges
 * - ai_usage tracking met action_type='other' + metadata.kind='materieel_scrape'
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { logAiUsage } from '@/lib/aiUsage';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'claude-sonnet-4-6';
const MAX_BODY_BYTES = 2 * 1024 * 1024;   // 2 MB
const FETCH_TIMEOUT_MS = 10_000;

const InputSchema = z.object({
    url: z.string().url('Geldige URL verplicht').max(2048),
});

/* SSRF-guard: weiger lokale/private adressen. We doen geen DNS-resolve hier
   omdat de fetch zelf dat doet — een eenvoudige string-check is voldoende
   tegen accidental misuse, niet tegen bewuste aanvallers (gebruik VPC + WAF
   voor echt SSRF-mitigation). */
function isAllowedHost(url: URL): boolean {
    const h = url.hostname.toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0') return false;
    if (h.endsWith('.local') || h.endsWith('.internal')) return false;
    if (/^10\./.test(h) || /^192\.168\./.test(h)) return false;
    if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(h)) return false;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return true;
}

/* Strip alle scripts + style + nav + footer; pak title, meta description,
   og:image, en de tekst van het hoofdartikel. Geen volledige DOM-parser
   nodig — regex-extractie is voldoende voor product-pagina's. */
function extractFromHtml(html: string, baseUrl: string): { title: string; description: string; ogImage: string | null; bodyText: string } {
    /* Verwijder script/style/nav/footer */
    let cleaned = html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, ' ')
        .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, ' ')
        .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ');

    const titleMatch = cleaned.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';

    const descMatch = cleaned.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
        || cleaned.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    const description = descMatch ? descMatch[1].trim() : '';

    const ogImageMatch = cleaned.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
        || cleaned.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    let ogImage: string | null = ogImageMatch ? ogImageMatch[1].trim() : null;
    if (ogImage && ogImage.startsWith('/')) {
        try { ogImage = new URL(ogImage, baseUrl).toString(); } catch { ogImage = null; }
    }

    /* Body-tekst: strip tags + collapse whitespace, max 5000 chars. Genoeg
       voor Claude om begrip te krijgen van een product-pagina. */
    const bodyText = cleaned
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 5000);

    return { title, description, ogImage, bodyText };
}

interface MaterieelSpecs {
    naam?: string;
    merk?: string;
    model?: string;
    afmetingen?: string;      // bv. "120 × 60 × 95 cm"
    gewicht?: string;         // bv. "78 kg"
    vermogen?: string;        // bv. "3500 W" of "—" als n.v.t.
    prijs_eur?: number;       // float, of weglaten
    specs_bullets?: string[]; // max 8 korte regels
    notes?: string;
}

const SYSTEM_PROMPT = `Je bent een productinformatie-extractor voor catering-equipment. Een gebruiker stuurt een product-pagina van een leverancier (bv. een smoker, koeling, snijmachine). Jouw taak: extract en structureer de belangrijkste specs.

Output ALTIJD geldige JSON met deze shape (sommige velden mogen ontbreken als de pagina ze niet vermeldt):
{
  "naam": "korte productnaam zonder leverancier-prefix",
  "merk": "merknaam",
  "model": "modelnaam/serienummer",
  "afmetingen": "L × B × H cm of inch",
  "gewicht": "X kg",
  "vermogen": "X W of n.v.t.",
  "prijs_eur": 123.45,
  "specs_bullets": ["max 8 korte bullets met technische details"],
  "notes": "1 zin extra context als relevant"
}

Geen marketing-taal. Alleen technische feiten die in een catering-keuken relevant zijn (capaciteit, vermogen, materiaal, afmetingen om in te passen in transport). Als een veld onbekend is, laat het weg. Geen verzonnen waarden.`;

export async function POST(req: NextRequest) {
    const t0 = Date.now();

    const sb = await createServerSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data: mem } = await sb
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    if (!mem) return NextResponse.json({ error: 'Geen actieve organisatie' }, { status: 403 });

    const body = await req.json().catch(() => null);
    const parsed = InputSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Validatie-fout', fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    let url: URL;
    try { url = new URL(parsed.data.url); }
    catch { return NextResponse.json({ error: 'Ongeldige URL' }, { status: 400 }); }
    if (!isAllowedHost(url)) {
        return NextResponse.json({ error: 'Deze URL is niet toegestaan (lokaal/privé adres)' }, { status: 400 });
    }

    /* Fetch de page met timeout + body-size guard. */
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let html = '';
    try {
        const res = await fetch(url.toString(), {
            method: 'GET',
            signal: controller.signal,
            headers: {
                'User-Agent': 'BBQ-Architect-Materieel-Scrape/1.0 (+https://bbqarchitect.app/)',
                'Accept': 'text/html,application/xhtml+xml',
            },
            redirect: 'follow',
        });
        if (!res.ok) {
            return NextResponse.json({ error: `Pagina niet bereikbaar (HTTP ${res.status})` }, { status: 502 });
        }
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('text/html') && !contentType.includes('xhtml')) {
            return NextResponse.json({ error: 'Pagina is geen HTML' }, { status: 415 });
        }
        const reader = res.body?.getReader();
        if (!reader) return NextResponse.json({ error: 'Geen response-body' }, { status: 502 });
        let total = 0;
        const chunks: Uint8Array[] = [];
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
                total += value.length;
                if (total > MAX_BODY_BYTES) {
                    await reader.cancel();
                    return NextResponse.json({ error: 'Pagina te groot (>2MB)' }, { status: 413 });
                }
                chunks.push(value);
            }
        }
        html = Buffer.concat(chunks).toString('utf-8');
    } catch (e) {
        if ((e as Error).name === 'AbortError') {
            return NextResponse.json({ error: 'Time-out bij ophalen pagina (>10s)' }, { status: 504 });
        }
        return NextResponse.json({ error: 'Kon pagina niet ophalen: ' + (e as Error).message }, { status: 502 });
    } finally {
        clearTimeout(timer);
    }

    const extracted = extractFromHtml(html, url.toString());
    if (!extracted.title && !extracted.bodyText) {
        return NextResponse.json({ error: 'Geen leesbare content op deze pagina' }, { status: 422 });
    }

    /* Claude vision call — text + (optioneel) og:image. Voor MVP geen image
       als og:image ontbreekt; Claude redt zich met alleen tekst. */
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'AI niet geconfigureerd (ANTHROPIC_API_KEY ontbreekt)' }, { status: 503 });
    const anthropic = new Anthropic({ apiKey });

    type UserBlock =
        | { type: 'text'; text: string }
        | { type: 'image'; source: { type: 'url'; url: string } };
    const userContent: UserBlock[] = [
        {
            type: 'text',
            text:
                `Product-URL: ${url.toString()}\n` +
                `Title: ${extracted.title}\n` +
                `Description: ${extracted.description}\n\n` +
                `Body excerpt:\n${extracted.bodyText}\n\n` +
                `Geef alleen de JSON terug, geen andere tekst.`,
        },
    ];
    if (extracted.ogImage) {
        userContent.unshift({
            type: 'image',
            source: { type: 'url', url: extracted.ogImage },
        });
    }

    let specs: MaterieelSpecs;
    let tokensInput = 0, tokensOutput = 0;
    try {
        const msg = await anthropic.messages.create({
            model: MODEL,
            max_tokens: 1500,
            temperature: 0.2,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userContent }],
        });
        tokensInput = msg.usage?.input_tokens ?? 0;
        tokensOutput = msg.usage?.output_tokens ?? 0;
        const textBlock = msg.content.find(b => b.type === 'text');
        const raw = textBlock && textBlock.type === 'text' ? textBlock.text : '';
        /* JSON-extract: model kan ` ```json ... ``` ` toevoegen, strip dat. */
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return NextResponse.json({ error: 'AI gaf geen geldige JSON terug' }, { status: 502 });
        }
        specs = JSON.parse(jsonMatch[0]) as MaterieelSpecs;
    } catch (e) {
        return NextResponse.json({ error: 'AI-extractie mislukt: ' + (e as Error).message }, { status: 502 });
    }

    /* Best-effort cost-calculation voor Sonnet 4.6: $3/MTok in, $15/MTok out.
       Conversion to EUR cents at ~0.92 EUR/USD. */
    const costEurCents = Math.round(
        ((tokensInput / 1_000_000) * 3 + (tokensOutput / 1_000_000) * 15) * 0.92 * 100,
    );

    /* Log fire-and-forget — never block response on logging fail. */
    void logAiUsage({
        organization_id: mem.organization_id,
        user_id: user.id,
        action_type: 'other',
        model: MODEL,
        tokens_input: tokensInput,
        tokens_output: tokensOutput,
        cost_eur_cents: costEurCents,
        metadata: { kind: 'materieel_scrape', source_url: url.toString() },
    });

    return NextResponse.json({
        specs,
        foto_url: extracted.ogImage,
        source_url: url.toString(),
        ms: Date.now() - t0,
    });
}
