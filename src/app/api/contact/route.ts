/**
 * Public contact-form endpoint — accepteert prospect-vragen.
 *
 * Geen auth-gate: prospects zonder account moeten support kunnen
 * bereiken. Daarom WEL:
 *   - Zod-validatie op shape (anti-spam baseline)
 *   - Honeypot-field (`website`) — bots vullen alle velden in, mens niet
 *   - Server-side rate-limit per IP (5 per uur)
 *   - GDPR-consent verplicht (AVG)
 *   - Reply-to set op klant-email zodat support direct kan antwoorden
 *
 * Voorheen had `/contact/page.tsx` alleen `setSent(true)` — bericht
 * verdween in het niets. Nu landt het in support-mailbox via Resend.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { Resend } from 'resend';

/* In-memory rate-limit per IP. Stateless cache — Vercel houdt instance
   warm-ish, dus dit werkt voor ~80% van de spam. Echte oplossing zou
   Upstash Redis zijn, maar dat is overkill voor een contact-form. */
const ipBuckets = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

function rateLimit(ip: string): boolean {
    const now = Date.now();
    const recent = (ipBuckets.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length >= RATE_LIMIT_MAX) return false;
    recent.push(now);
    ipBuckets.set(ip, recent);
    /* Periodic cleanup: voorkom dat de map oneindig groeit. */
    if (ipBuckets.size > 1000) {
        for (const [key, times] of ipBuckets.entries()) {
            if (times.every((t) => now - t > RATE_LIMIT_WINDOW_MS)) {
                ipBuckets.delete(key);
            }
        }
    }
    return true;
}

const ContactSchema = z.object({
    naam: z.string().min(1, 'Naam is verplicht').max(200),
    email: z.string().email('Ongeldig e-mailadres').max(200),
    onderwerp: z.string().min(1, 'Onderwerp is verplicht').max(200),
    bericht: z.string().min(10, 'Bericht moet minimaal 10 tekens zijn').max(5000),
    /* `gdpr_consent` moet exact `true` zijn — AVG vereist expliciete
       opt-in. Zod v4-stijl error-message via 2e parameter. */
    gdpr_consent: z.literal(true, { message: 'Ga akkoord met onze privacy-voorwaarden' }),
    /* Honeypot — bot vult dit veld in, mens niet (CSS hidden in form). */
    website: z.string().max(0).optional(),
});

export async function POST(req: NextRequest) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
        || req.headers.get('x-real-ip')
        || 'unknown';

    if (!rateLimit(ip)) {
        return NextResponse.json(
            { error: 'Te veel berichten in korte tijd — probeer over een uur opnieuw.' },
            { status: 429 },
        );
    }

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 });
    }

    const parsed = ContactSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            {
                error: 'validation',
                fields: parsed.error.flatten().fieldErrors,
            },
            { status: 400 },
        );
    }

    /* Honeypot-trap: als `website` ingevuld is = bot. Stuur 200 OK zodat
       de bot denkt dat het werkt, maar verwerk niets. */
    if (parsed.data.website && parsed.data.website.length > 0) {
        return NextResponse.json({ success: true, message: 'Bericht verstuurd' });
    }

    const apiKey = process.env.RESEND_API_KEY;
    const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@bbqarchitect.nl';
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'BBQ Architect <onboarding@resend.dev>';

    if (!apiKey) {
        /* Resend niet geconfigureerd in deze omgeving — log en geef
           graceful fallback zodat dev-tests niet harde 500 geven. */
        console.warn('[contact] RESEND_API_KEY niet gezet — bericht niet verstuurd:', {
            from: parsed.data.email,
            subject: parsed.data.onderwerp,
        });
        return NextResponse.json(
            { error: 'Email-service niet geconfigureerd — mail rechtstreeks naar ' + supportEmail },
            { status: 503 },
        );
    }

    const { naam, email, onderwerp, bericht } = parsed.data;
    const subject = '[Contact] ' + onderwerp;
    const html = `
        <div style="font-family: sans-serif; max-width: 600px;">
            <h2>Nieuw contact-bericht via bbqarchitect.nl</h2>
            <p><strong>Van:</strong> ${escapeHtml(naam)} &lt;${escapeHtml(email)}&gt;</p>
            <p><strong>Onderwerp:</strong> ${escapeHtml(onderwerp)}</p>
            <hr>
            <p style="white-space: pre-wrap;">${escapeHtml(bericht)}</p>
            <hr>
            <p style="font-size: 12px; color: #888;">
                IP: ${escapeHtml(ip)}<br>
                Ontvangen: ${new Date().toISOString()}<br>
                AVG-consent: ja
            </p>
        </div>
    `;

    try {
        const resend = new Resend(apiKey);
        const result = await resend.emails.send({
            from: fromEmail,
            to: [supportEmail],
            replyTo: email,
            subject,
            html,
            text: 'Van: ' + naam + ' <' + email + '>\nOnderwerp: ' + onderwerp + '\n\n' + bericht,
        });
        if (result.error) {
            console.error('[contact] Resend error:', result.error);
            return NextResponse.json(
                { error: 'Email-verzending mislukt — probeer rechtstreeks naar ' + supportEmail },
                { status: 502 },
            );
        }
        return NextResponse.json({ success: true, message: 'Bericht verstuurd' });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        console.error('[contact] Unexpected error:', msg);
        return NextResponse.json(
            { error: 'Server-fout — probeer rechtstreeks naar ' + supportEmail },
            { status: 500 },
        );
    }
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
