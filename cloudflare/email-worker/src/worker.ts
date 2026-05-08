/**
 * Cloudflare Email Worker — bbqarchitect inbound mail
 *
 * Routing flow:
 *   Sam's leverancier mailt naar: pl-{slug}@in.bbqarchitect.app
 *      → Cloudflare Email Routing (catch-all op `in.bbqarchitect.app`)
 *      → deze Worker
 *      → POST {APP_URL}/api/email/inbound met x-cf-signature HMAC
 *      → Next.js dedupt + stagest attachments + triggert universal parser
 *
 * Deploy: `wrangler deploy` vanuit deze map.
 *
 * Required env-vars (via wrangler secret put):
 *   APP_URL                e.g. https://app.bbqarchitect.app
 *   EMAIL_INBOUND_SECRET   shared HMAC-secret (zelfde als Next.js .env)
 *
 * Required wrangler.toml:
 *   name = "bbqarchitect-email-router"
 *   main = "src/worker.ts"
 *   compatibility_date = "2026-04-01"
 *   [[email]]
 *   destination_addresses = ["pl-*@in.bbqarchitect.app"]
 */

export interface Env {
    APP_URL: string;
    EMAIL_INBOUND_SECRET: string;
}

const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_BODY_PREVIEW = 500;

interface Attachment {
    filename: string;
    mimeType: string;
    base64: string;
    sizeBytes: number;
}

async function readAttachments(message: ForwardableEmailMessage): Promise<Attachment[]> {
    const attachments: Attachment[] = [];
    /* Cloudflare Email Workers heeft geen native attachments-API; we parsen
       de raw RFC822-stream zelf met `postal-mime` of vergelijkbaar. Voor
       deze stub-implementatie loggen we; Sam moet `pnpm add postal-mime`
       in de worker-folder en hier importeren. */
    /*
       import PostalMime from 'postal-mime';
       const reader = message.raw.getReader();
       const chunks: Uint8Array[] = [];
       while (true) {
           const { done, value } = await reader.read();
           if (done) break;
           chunks.push(value);
       }
       const raw = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
       let offset = 0;
       for (const c of chunks) { raw.set(c, offset); offset += c.length; }
       const parser = new PostalMime();
       const parsed = await parser.parse(raw);
       for (const att of parsed.attachments ?? []) {
           if (attachments.length >= MAX_ATTACHMENTS) break;
           const buf = att.content as Uint8Array;
           if (buf.byteLength > MAX_ATTACHMENT_BYTES) continue;
           let bin = '';
           for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
           attachments.push({
               filename: att.filename ?? 'attachment.bin',
               mimeType: att.mimeType ?? 'application/octet-stream',
               base64: btoa(bin),
               sizeBytes: buf.byteLength,
           });
       }
    */
    return attachments;
}

async function hmacHex(secret: string, body: string): Promise<string> {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        enc.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
    const arr = new Uint8Array(sig);
    let hex = '';
    for (let i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, '0');
    return hex;
}

export default {
    async email(message: ForwardableEmailMessage, env: Env, _ctx: ExecutionContext): Promise<void> {
        const subject = message.headers.get('subject') ?? '';
        const messageId = message.headers.get('message-id') ?? `cf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

        /* SPF/DKIM-resultaten uit Authentication-Results header */
        const authResults = message.headers.get('authentication-results') ?? '';
        const spfPass = /spf=pass/i.test(authResults);
        const dkimPass = /dkim=pass/i.test(authResults);

        const attachments = await readAttachments(message);

        /* Body excerpt (eerste 500 chars uit text/plain part) — TODO via postal-mime */
        const bodyExcerpt: string = ''; // parsed.text?.slice(0, MAX_BODY_PREVIEW);

        const payload = {
            to: message.to,
            from: message.from,
            fromName: undefined as string | undefined,
            subject,
            messageId,
            bodyExcerpt: bodyExcerpt || undefined,
            spfPass,
            dkimPass,
            attachments,
        };

        const body = JSON.stringify(payload);
        const sig = await hmacHex(env.EMAIL_INBOUND_SECRET, body);

        const resp = await fetch(`${env.APP_URL}/api/email/inbound`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-cf-signature': sig,
            },
            body,
        });

        if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            console.error(`[cf-email-worker] forward faal status=${resp.status} text=${text.slice(0, 200)}`);
            /* Niet message.setReject — leveranciersmail mag niet gebounced worden */
            return;
        }
    },
};
