/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase-server';
import { runAcceptanceWorkflow } from '@/lib/acceptance-workflow';
import { renderSignedCertificate } from '@/lib/signedPdfRenderer';

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

        const body = await req.json();
        const { offerteId, publicToken, signedBy, signatureUrl } = body;
        if (!offerteId) return NextResponse.json({ error: 'Geen offerte ID' }, { status: 400 });
        if (!publicToken || typeof publicToken !== 'string') return NextResponse.json({ error: 'Geen publieke token' }, { status: 400 });

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
        if (offerte.status === 'geaccepteerd' || offerte.status === 'akkoord' || offerte.status === 'betaald') {
            return NextResponse.json({ success: true, message: 'Offerte was al geaccepteerd', skipped: true });
        }

        // 2. Update offerte status + signature data (audit-trail: signer, IP, UA, timestamp)
        const updatePayload: Record<string, any> = { status: 'geaccepteerd' };
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
                status: 'confirmed',
                notitie: offerte.notitie || '',
                organization_id: orgId,
            };

            if (existing) {
                await sb.from('events').update(payload).eq('id', existing.id);
                eventId = existing.id;
            } else {
                payload.offerte_id = offerteId;
                payload.type = 'Zakelijk';
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

        const workflow = await runAcceptanceWorkflow(sb as any, {
            eventId,
            offerteId,
            offerteData: { ...offerte, items },
            settings,
            facturenCount: facturenNummers.length,
            facturenNummers,
        });

        return NextResponse.json({
            success: true,
            message: 'Offerte geaccepteerd en workflow uitgevoerd',
            eventId,
            workflow,
        });

    } catch (e: any) {
        console.error('[ACCEPT-API] Error:', e);
        return NextResponse.json({ error: 'Server fout: ' + (e.message || '') }, { status: 500 });
    }
}
