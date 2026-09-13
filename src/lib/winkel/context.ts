/**
 * De kassa-context voor de echte routes: Supabase-opslag, myPOS-configuratie
 * (test of productie), de app-URL en de bevestigingsmail.
 *
 *   NEXT_PUBLIC_APP_URL   waar de website ons aanroept (betaalUrl)
 *   WINKEL_WEBHOOK_URL    waar myPOS ons bereikt; alleen zetten als dat
 *                         afwijkt (lokaal ontwikkelen), anders = app-URL.
 *                         myPOS eist https zonder poortnummer.
 */
import { myposConfig } from '@/lib/mypos/config';
import type { KassaContext } from './kassa';
import { stuurBevestigingsmail } from './mail';
import { maakSupabaseStore } from './supabaseStore';

export function kassaContext(): KassaContext {
    return {
        store: maakSupabaseStore(),
        mypos: myposConfig(),
        appUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://bbq-architect-v2.vercel.app',
        webhookUrl: process.env.WINKEL_WEBHOOK_URL || undefined,
        mail: stuurBevestigingsmail,
    };
}

export function ipVan(req: Request): string {
    return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}
