/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceSupabase } from '@/lib/supabase-server';
import { runAcceptanceWorkflow } from '@/lib/acceptance-workflow';
import { renderSignedCertificate } from '@/lib/signedPdfRenderer';
import { mailOfferteGeaccepteerd, mailFactuurServer } from '@/lib/serverMail';
import { isOfferteAccepted, OFFERTE_STATUS, EVENT_STATUS } from '@/lib/statuses';
import { resolveClientEmail } from '@/lib/resolveClientEmail';

import { klantTypeVoor } from '@/lib/klantType';
/* Zod-schema voor accept-payload — voorkomt XSS in signedBy (komt in
   audit-PDF + email), DoS via mega-signatureUrl, en string-injection
   in publicToken. Klant-facing endpoint: liberaal genoeg om geldige
   namen toe te laten ('José'/'Anne-Marie'/'王' etc.) maar streng genoeg
   om HTML/script/control-chars te weren. */
const AcceptOfferteSchema = z.object({
    offerteId: z.union([z.string().uuid(), z.coerce.number().int().positive()]),
    publicToken: z.string().min(16).max(200),
    signedBy: z.string()
        .min(2, 'Naam moet minimaal 2 tekens zijn')
        .max(100, 'Naam te lang (max 100 tekens)')
        .refine(
            function (s) { return !/[<>{}]|javascript:|data:|on\w+=/i.test(s); },
            'Naam bevat ongeldige tekens',
        )
        .refine(
            function (s) { return s.trim().length >= 2; },
            'Naam mag niet enkel uit spaties bestaan',
        ),
    /* Signature data-URL — accepteer alleen `data:image/png;base64,...`
       om PNG-injectie (SVG met embedded JS) te voorkomen. Cap op 500KB
       base64 (~375KB binary) is ruim voldoende voor een handtekening. */
    signatureUrl: z.string()
        .regex(/^data:image\/(png|jpeg);base64,/, 'Ongeldig signatuur-format')
        .max(500_000, 'Signatuur te groot'),
});

let sb: ReturnType<typeof createServiceSupabase> | null = null;
try { sb = createServiceSupabase(); } catch { sb = null; }

function todayStr() { return new Date().toISOString().slice(0, 10); }

function getClientIp(req: NextRequest): string | null {
    const xff = req.headers.get('x-forwarded-for');
    if (xff) return xff.split(',')[0]!.trim();
    return req.headers.get('x-real-ip') || null;
}

export async function POST(req: NextRequest) {
    try {
        if (!sb) return NextResponse.json({ error: 'Geen database verbinding' }, { status: 500 });

        let body: unknown;
        try {
            body = await req.json();
        } catch {
            return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 });
        }

        const parsed = AcceptOfferteSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                {
                    error: 'Ongeldige gegevens — controleer naam en handtekening',
                    fields: parsed.error.flatten().fieldErrors,
                },
                { status: 400 },
            );
        }
        const { offerteId, publicToken, signedBy, signatureUrl } = parsed.data;

        const signedIp = getClientIp(req);
        const signedUserAgent = req.headers.get('user-agent');
        const signedAtIso = new Date().toISOString();

        // 1. Fetch offerte
        const { data: offerte, error: fetchErr } = await sb
            .from('offertes')
            .select('*')
            .eq('id', offerteId)
            .eq('public_token', publicToken)
            .single();
        if (fetchErr || !offerte) return NextResponse.json({ error: 'Offerte niet gevonden' }, { status: 404 });

        // Already accepted? Skip workflow but return success
        // Canonical check accepteert legacy aliases (akkoord/goedgekeurd) en betaald.
        if (isOfferteAccepted(offerte.status)) {
            return NextResponse.json({ success: true, message: 'Offerte was al geaccepteerd', skipped: true });
        }

        // 2. Update offerte status + signature data (audit-trail: signer, IP, UA, timestamp)
        // Schrijf altijd canonical 'geaccepteerd' — geen alias-vervuiling meer.
        const updatePayload: Record<string, any> = { status: OFFERTE_STATUS.GEACCEPTEERD };
        if (signedBy) updatePayload.signed_by = signedBy;
        if (signatureUrl) updatePayload.signature_url = signatureUrl;
        updatePayload.signed_at = signedAtIso;
        if (signedIp) updatePayload.signed_ip = signedIp;
        if (signedUserAgent) updatePayload.signed_user_agent = signedUserAgent;

        const { error: updateErr } = await sb.from('offertes').update(updatePayload).eq('id', offerteId).eq('public_token', publicToken);
        if (updateErr) return NextResponse.json({ error: 'Status update mislukt: ' + updateErr.message }, { status: 500 });

        // 2b. Render signed certificate PDF + upload to Storage (Pillar #2 audit-trail)
        try {
            const items = (function () {
                let it = offerte.items;
                if (typeof it === 'string') { try { it = JSON.parse(it); } catch { it = []; } }
                return Array.isArray(it) ? it : [];
            })();
            const bedragIncl = items.reduce(function (sum: number, x: any) {
                return sum + (Number(x.qty) || 0) * (Number(x.prijs) || 0);
            }, 0);

            const pdfBytes = await renderSignedCertificate({
                offerteNummer: String(offerte.nummer || offerte.id),
                offerteDatum: offerte.datum || null,
                clientNaam: offerte.client_naam || null,
                bedragIncl,
                signedBy: signedBy || 'Onbekend',
                signedAt: signedAtIso,
                signedIp,
                signedUserAgent,
                signatureDataUrl: signatureUrl || null,
                organizationName: null,
                organizationKvk: null,
            });

            const orgId = offerte.organization_id;
            const storagePath = `org_${orgId}/offertes/signed/${offerte.id}.pdf`;
            const { error: uploadErr } = await sb.storage
                .from('signed-pdfs')
                .upload(storagePath, pdfBytes as any, {
                    contentType: 'application/pdf',
                    upsert: true,
                });

            if (uploadErr) {
                console.error('[ACCEPT-API] Signed-PDF upload failed:', uploadErr.message);
            } else {
                const { data: urlData } = sb.storage.from('signed-pdfs').getPublicUrl(storagePath);
                if (urlData?.publicUrl) {
                    await sb.from('offertes').update({ signed_pdf_url: urlData.publicUrl }).eq('id', offerteId);
                }
            }
        } catch (pdfErr: any) {
            console.error('[ACCEPT-API] Signed-PDF render error:', pdfErr.message);
        }

        // 3. Parse items safely
        let items = offerte.items;
        if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }
        if (!Array.isArray(items)) { items = []; }

        // 3b. Sync to event (create or update)
        let eventId: number | null = null;
        try {
            let totalBedrag = 0;
            let estimatedGuests = offerte.aantal_gasten || 0;
            (items).forEach(function (item: any) {
                totalBedrag += (item.qty || 0) * (item.prijs || 0);
                if (!estimatedGuests && (item.qty || 0) > estimatedGuests) estimatedGuests = item.qty || 0;
            });
            const ppp = estimatedGuests > 0 ? totalBedrag / estimatedGuests : 45;

            const { data: existingEvents } = await sb.from('events').select('id').eq('offerte_id', offerteId);
            const existing = existingEvents && existingEvents.length > 0 ? existingEvents[0] : null;

            // Clean duplicates
            if (existingEvents && existingEvents.length > 1) {
                for (let i = 1; i < existingEvents.length; i++) {
                    await sb.from('events').delete().eq('id', existingEvents[i].id);
                }
            }

            const orgId = offerte.organization_id;
            const payload: Record<string, any> = {
                name: 'Offerte: ' + (offerte.client_naam || offerte.nummer || 'Onbekend'),
                date: offerte.datum || todayStr(),
                guests: estimatedGuests || 50,
                ppp: Math.round(ppp * 100) / 100,
                location: offerte.client_adres || '',
                client_naam: offerte.client_naam || '',
                client_adres: offerte.client_adres || '',
                status: EVENT_STATUS.CONFIRMED,
                notitie: offerte.notitie || '',
                organization_id: orgId,
            };

            if (existing) {
                await sb.from('events').update(payload).eq('id', existing.id);
                eventId = existing.id;
            } else {
                payload.offerte_id = offerteId;
                /* Stond hard op 'Zakelijk', voor elke bruiloft en verjaardag. */
                payload.type = await klantTypeVoor(sb, orgId, offerte.client_naam);
                payload.menu = [];
                const ins = await sb.from('events').insert(payload).select();
                eventId = ins.data && ins.data[0] ? ins.data[0].id : null;
            }
        } catch (e: any) {
            console.error('[ACCEPT-API] Event sync error:', e.message);
        }

        if (!eventId) {
            return NextResponse.json({ success: true, message: 'Offerte geaccepteerd, maar event kon niet aangemaakt worden', workflow: null });
        }

        /* 4. Run acceptance workflow — gebruikt nu de gedeelde
           runAcceptanceWorkflow zodat hier exact dezelfde 5 stappen lopen
           als wanneer de pitmaster zelf op "Opslaan" klikt: factuur (FK),
           prep-tasks, inkooplijst, HACCP-sjablonen, courses + mise. */
        const { data: settingsRows } = await sb.from('settings').select('*').limit(1);
        const settings = settingsRows && settingsRows[0] ? settingsRows[0] : null;
        const { data: facturenAll } = await sb.from('facturen').select('nummer');
        const facturenNummers = (facturenAll || []).map(f => f.nummer);

        /* `runAcceptanceWorkflow` verwacht `offerteId: number`. Zod
           accepteert union(uuid|int) maar in praktijk is offerte.id
           altijd integer in DB — coerce hier zodat de workflow-types
           kloppen. */
        const offerteIdNum = typeof offerteId === 'number'
            ? offerteId
            : Number.parseInt(offerteId, 10);
        const workflow = await runAcceptanceWorkflow(sb as any, {
            eventId,
            offerteId: offerteIdNum,
            offerteData: { ...offerte, items },
            settings,
            facturenCount: facturenNummers.length,
            facturenNummers,
        });

        /* 5. Confirmation- + factuur-mail — fire-and-forget. Failures gaan naar
           console-log; klant heeft portal-confirmatie ook gezien. Twee mails:
            (a) bevestiging accept (altijd indien client_email aanwezig)
            (b) factuur (alleen als net aangemaakt EN client_email) */
        const totaalIncBtw = (items as Array<Record<string, unknown>>).reduce(function (sum: number, x: Record<string, unknown>) {
            const qty = Number(x.qty) || 0;
            const prijs = Number(x.prijs) || 0;
            const btw = Number(x.btw) || 0;
            const line = qty * prijs;
            return sum + line + line * (btw / 100);
        }, 0);
        const bedrijfsnaam = (settings && (settings as Record<string, unknown>).bedrijfsnaam as string)
            || (settings && (settings as Record<string, unknown>).bedrijf as string)
            || 'BBQ Architect';
        const brandColor = settings && (settings as Record<string, unknown>).brand_color as string;
        const ondertitel = settings && (settings as Record<string, unknown>).ondertitel as string;

        /* Klant-email resolven: offerte.client_email → klanten.email (op naam) →
           events.client_email. Best-effort; null = mail wordt geskipt. */
        const clientEmail = await resolveClientEmail(sb!, {
            orgId: offerte.organization_id,
            clientNaam: offerte.client_naam,
            clientEmail: offerte.client_email,
            offerteId: offerteIdNum,
            eventId,
        });

        if (clientEmail) {
            mailOfferteGeaccepteerd({
                clientEmail,
                clientNaam: (offerte.client_naam as string) || '',
                offerteNummer: String(offerte.nummer || offerte.id),
                eventDatum: (offerte.datum as string) || undefined,
                totaalIncBtw: totaalIncBtw || undefined,
                bedrijfsnaam,
                brandColor: brandColor || undefined,
                ondertitel: ondertitel || undefined,
            }).then(function (r) {
                if (!r.success) console.error('[ACCEPT-API] Confirmation email failed:', r.error);
            }).catch(function (err) {
                console.error('[ACCEPT-API] Confirmation email exception:', err);
            });
        }

        /* Factuur-mail alleen als de workflow een nieuwe factuur heeft aangemaakt.
           "Bestond al" betekent dat de mail eerder is verstuurd (of moet zijn) —
           dubbel-mailen is irritant en kan gezien worden als phishing/spam. */
        const newlyCreated = workflow.factuur.success
            && /aangemaakt/i.test(workflow.factuur.message)
            && workflow.factuur.factuurId;
        if (newlyCreated && clientEmail) {
            try {
                const { data: factuurRow } = await sb!.from('facturen')
                    .select('id,nummer,datum,vervaldatum')
                    .eq('id', workflow.factuur.factuurId!)
                    .single();
                if (factuurRow) {
                    mailFactuurServer({
                        clientEmail,
                        clientNaam: (offerte.client_naam as string) || '',
                        factuurNummer: String(factuurRow.nummer || factuurRow.id),
                        factuurDatum: factuurRow.datum || undefined,
                        vervaldatum: factuurRow.vervaldatum || undefined,
                        totaalIncBtw,
                        bedrijfsnaam,
                        brandColor: brandColor || undefined,
                        ondertitel: ondertitel || undefined,
                    }).then(function (r) {
                        if (!r.success) console.error('[ACCEPT-API] Factuur-mail failed:', r.error);
                    }).catch(function (err) {
                        console.error('[ACCEPT-API] Factuur-mail exception:', err);
                    });
                }
            } catch (fetchErr: any) {
                console.error('[ACCEPT-API] Factuur fetch for mail failed:', fetchErr?.message);
            }
        }

        /* 6. Build response with warnings — workflow runt parallel via allSettled,
           dus sub-stappen kunnen falen zonder dat de accept-actie faalt. We
           surface deze fouten zodat de UI (offertes/page.tsx SyncCascade) ze
           kan tonen en de operator weet wat handmatig moet. */
        const warnings: Array<{ step: string; message: string }> = [];
        if (!workflow.factuur.success) warnings.push({ step: 'factuur', message: workflow.factuur.message });
        if (!workflow.prep.success) warnings.push({ step: 'prep', message: workflow.prep.message });
        if (!workflow.inkoop.success) warnings.push({ step: 'inkoop', message: workflow.inkoop.message });
        if (!workflow.haccp.success) warnings.push({ step: 'haccp', message: workflow.haccp.message });
        if (!workflow.courses.success) warnings.push({ step: 'courses', message: workflow.courses.message });
        if (!workflow.logistics.success) warnings.push({ step: 'logistics', message: workflow.logistics.message });
        if (!workflow.moneybird.success && !/niet geconfigureerd|geen config/i.test(workflow.moneybird.message)) {
            warnings.push({ step: 'moneybird', message: workflow.moneybird.message });
        }

        return NextResponse.json({
            success: true,
            message: 'Offerte geaccepteerd en workflow uitgevoerd',
            eventId,
            workflow,
            warnings: warnings.length > 0 ? warnings : undefined,
        });

    } catch (e: any) {
        console.error('[ACCEPT-API] Error:', e);
        return NextResponse.json({ error: 'Server fout: ' + (e.message || '') }, { status: 500 });
    }
}
