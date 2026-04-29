// E2E test: roept de echte /api/chat route aan via een ingelogde sessie.
// Gebruikt service-role om een test-user op te zoeken en een access-token te
// genereren, zodat de middleware doorlaat. Test of mode-param werkt door de stack.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(join(__dirname, '..', '.env.local'), 'utf8');
for (const line of envFile.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceKey || !anonKey) {
    console.error('Missing supabase env');
    process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

// Vind eerste user met een active membership
const { data: members } = await admin
    .from('organization_members')
    .select('user_id, organization_id')
    .eq('status', 'active')
    .limit(1);

if (!members || members.length === 0) {
    console.error('Geen actieve user/org gevonden');
    process.exit(1);
}

const userId = members[0].user_id;
console.log('Test-user id:', userId);

// Genereer een magic-link voor deze user → access_token
const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: (await admin.auth.admin.getUserById(userId)).data.user.email,
});

if (linkErr || !linkData) {
    console.error('Magic link fail:', linkErr?.message);
    process.exit(1);
}

// Gebruik de hashed_token om in te loggen via verifyOtp
const sb = createClient(url, anonKey, { auth: { persistSession: false } });
const { data: otpData, error: otpErr } = await sb.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
});

if (otpErr || !otpData?.session) {
    console.error('Verify fail:', otpErr?.message);
    process.exit(1);
}

const accessToken = otpData.session.access_token;
const refreshToken = otpData.session.refresh_token;
console.log('Got access token, length:', accessToken.length);

// Bouw cookie-header in Supabase SSR-formaat (>=0.5.0: base64- prefix).
const sessionJson = JSON.stringify({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: otpData.session.expires_at,
    expires_in: otpData.session.expires_in,
    token_type: 'bearer',
    user: otpData.session.user,
});
const cookieValue = 'base64-' + Buffer.from(sessionJson).toString('base64');
const projectRef = url.match(/https:\/\/([^.]+)\./)[1];
const cookieName = `sb-${projectRef}-auth-token`;

async function callChat(thinkingMode, vraag, pageContext) {
    const t0 = Date.now();
    const res = await fetch('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Cookie': `${cookieName}=${cookieValue}`,
        },
        body: JSON.stringify({
            messages: [{ role: 'user', content: vraag }],
            pageContext,
            mode: 'context',
            thinkingMode,
            userRole: 'Admin',
        }),
    });

    const ct = res.headers.get('content-type') || '';
    if (!res.ok || !ct.includes('event-stream')) {
        const body = await res.text();
        return { error: `HTTP ${res.status} ct=${ct}: ${body.slice(0, 300)}` };
    }

    let text = '';
    let thinking = '';
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
                const data = JSON.parse(line.slice(6));
                if (data.delta) text += data.delta;
                if (data.thinking) thinking += data.thinking;
            } catch {}
        }
    }
    return { text, thinking, ms: Date.now() - t0 };
}

console.log('\n═══ E2E /api/chat live test ═══');
const cases = [
    { mode: 'fast', page: '/voorraad', q: 'Wat moet ik bestellen voor het volgende event?' },
    { mode: 'fast', page: '/service', q: 'Mag de kip op? Laatste meting 78°C.' },
    { mode: 'standard', page: '/', q: 'Wat moet ik vandaag regelen?' },
    { mode: 'standard', page: '/offertes', q: 'Welke offertes lopen vast?' },
    { mode: 'deep', page: '/recepten', q: 'Bedenk een nieuw signatuur-recept met buikspek.' },
];

for (const c of cases) {
    process.stdout.write(`\n[${c.mode.padEnd(8)}] ${c.page.padEnd(20)} → "${c.q.slice(0, 50)}"\n`);
    const r = await callChat(c.mode, c.q, c.page);
    if (r.error) {
        console.log(`  ✗ ${r.error}`);
    } else {
        console.log(`  ✓ ${r.text.length} chars in ${r.ms}ms`);
        console.log(`  ${r.text.slice(0, 200).replace(/\n/g, ' ')}…`);
    }
}
