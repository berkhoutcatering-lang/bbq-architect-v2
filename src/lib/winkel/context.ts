/**
 * De kassa-context voor de echte routes: Supabase-opslag, myPOS-configuratie
 * (test of productie), de app-URL en de bevestigingsmail.
 *
 * De app-URL (voor betaalUrl en de myPOS-webhook) komt uit het verzoek zelf:
 * de host waarop de website ons aanroept is de host waarop myPOS ons moet
 * bereiken. Zo klopt een Vercel-preview vanzelf. Alleen lokaal wijkt het af:
 * myPOS eist https zonder poortnummer, dus daar zet je WINKEL_WEBHOOK_URL.
 */
import { myposConfig } from '@/lib/mypos/config';
import type { KassaContext } from './kassa';
import { stuurBevestigingsmail } from './mail';
import { maakSupabaseStore } from './supabaseStore';

/** De basis-URL waarop dit verzoek binnenkwam, achter de Vercel-proxy om. */
export function basisUit(req: Request): string {
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    const proto = req.headers.get('x-forwarded-proto') || (host?.startsWith('localhost') ? 'http' : 'https');
    if (host) return `${proto}://${host}`;
    return process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
}

/**
 * Op een Vercel-preview staat Vercel Authentication voor de deur; myPOS kan
 * daar niet langs. Met "Protection Bypass for Automation" aan zet Vercel
 * VERCEL_AUTOMATION_BYPASS_SECRET, en die gaat dan als query-parameter mee op
 * de URL's die myPOS aanroept. Alleen op previews — productie heeft geen deur.
 */
function previewBypass(): Record<string, string> | undefined {
    const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    if (process.env.VERCEL_ENV === 'preview' && secret) return { 'x-vercel-protection-bypass': secret };
    return undefined;
}

export function kassaContext(req: Request): KassaContext {
    return {
        store: maakSupabaseStore(),
        mypos: myposConfig(),
        appUrl: basisUit(req),
        webhookUrl: process.env.WINKEL_WEBHOOK_URL || undefined,
        webhookQuery: previewBypass(),
        mail: stuurBevestigingsmail,
    };
}

export function ipVan(req: Request): string {
    return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}
