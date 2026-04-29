// E2E test van de twee-staps brainstorm-flow op /gerechten:
// 1. AI presenteert 8 concept-kaartjes
// 2. User selecteert er 5 → AI levert volledige uitwerking met marge/pijn/top/foto-prompt

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

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: members } = await admin.from('organization_members').select('user_id,organization_id').eq('status', 'active').limit(1);
const userId = members[0].user_id;
const userRes = await admin.auth.admin.getUserById(userId);
const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email: userRes.data.user.email });
const sb = createClient(url, anonKey, { auth: { persistSession: false } });
const { data: otpData } = await sb.auth.verifyOtp({ token_hash: linkData.properties.hashed_token, type: 'magiclink' });
const session = otpData.session;
const projectRef = url.match(/https:\/\/([^.]+)\./)[1];
const cookieName = 'sb-' + projectRef + '-auth-token';
const cookieValue = 'base64-' + Buffer.from(JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: 'bearer',
    user: session.user,
})).toString('base64');

async function chat(messages, thinkingMode = 'deep') {
    const t0 = Date.now();
    const res = await fetch('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieName + '=' + cookieValue },
        body: JSON.stringify({
            messages,
            pageContext: '/gerechten',
            mode: 'context',
            thinkingMode,
            userRole: 'Admin',
        }),
    });
    const ct = res.headers.get('content-type') || '';
    if (!res.ok || !ct.includes('event-stream')) {
        return { error: 'HTTP ' + res.status + ' ct=' + ct + ': ' + (await res.text()).slice(0, 300) };
    }
    let text = '';
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
            } catch {}
        }
    }
    return { text, ms: Date.now() - t0 };
}

console.log('═══ STAP 1: brainstorm 8 zomerhapjes ═══');
const r1 = await chat([{ role: 'user', content: 'Bedenk 8 zomerse hapjes voor een bedrijfsfeest van 80 gasten' }], 'deep');
if (r1.error) {
    console.error('STAP 1 FAILED:', r1.error);
    process.exit(1);
}
console.log('Lengte:', r1.text.length, 'chars in', r1.ms, 'ms');
const conceptsMatch = r1.text.match(/<<<ACTION:({"type":"brainstorm_gerechten_concepts"[\s\S]+?})>>>/);
if (!conceptsMatch) {
    console.error('❌ Geen brainstorm_gerechten_concepts ACTION in output');
    console.log(r1.text.slice(0, 1000));
    process.exit(1);
}
let actionData;
try {
    actionData = JSON.parse(conceptsMatch[1]);
} catch (e) {
    console.error('❌ Kon ACTION niet parsen:', e.message);
    console.log(conceptsMatch[1].slice(0, 500));
    process.exit(1);
}
const concepts = actionData.data?.concepts || [];
console.log('✅ ACTION concepts gevonden:', concepts.length, 'stuks');
concepts.slice(0, 3).forEach((c, i) => console.log('  ' + (i + 1) + '. ' + c.naam + ' (' + (c.gang_slug || '?') + ') — ' + (c.smaakprofiel || '?').slice(0, 60)));

console.log('\n═══ STAP 2: werk 3 geselecteerde uit ═══');
const selected = concepts.slice(0, 3);
const lijst = selected.map(c => '- ' + c.naam + ' (' + (c.gang_slug || 'anders') + ')').join('\n');
const r2 = await chat([
    { role: 'user', content: 'Bedenk 8 zomerse hapjes voor een bedrijfsfeest van 80 gasten' },
    { role: 'assistant', content: r1.text },
    { role: 'user', content: 'Werk deze 3 gerechten volledig uit met receptuur, marge%, pijnpunten, toppunten en foto-prompt:\n' + lijst + '\n\nGebruik bulk_create_gerechten met alle velden ingevuld.' },
], 'deep');
if (r2.error) {
    console.error('STAP 2 FAILED:', r2.error);
    process.exit(1);
}
console.log('Lengte:', r2.text.length, 'chars in', r2.ms, 'ms');
const bulkMatch = r2.text.match(/<<<ACTION:({"type":"bulk_create_gerechten"[\s\S]+?})>>>/);
if (!bulkMatch) {
    console.error('❌ Geen bulk_create_gerechten ACTION');
    console.log(r2.text.slice(0, 1500));
    process.exit(1);
}
let bulkData;
try { bulkData = JSON.parse(bulkMatch[1]); } catch (e) { console.error('Parse error:', e.message); process.exit(1); }
const gerechten = bulkData.data?.gerechten || [];
console.log('✅ ACTION bulk_create_gerechten met', gerechten.length, 'gerechten');

const checkFields = ['naam', 'gang_slug', 'beschrijving', 'bereidingswijze', 'ingredienten', 'allergenen', 'kostprijs_pp', 'verkoopprijs', 'marge_pct', 'pijnpunten', 'toppunten', 'foto_prompt'];
gerechten.forEach((g, i) => {
    console.log('\n— Gerecht ' + (i + 1) + ': ' + g.naam);
    checkFields.forEach(f => {
        const val = g[f];
        const has = val !== undefined && val !== null && (Array.isArray(val) ? val.length > 0 : (typeof val === 'string' ? val.length > 0 : true));
        const sample = Array.isArray(val) ? val.length + ' items' : (typeof val === 'string' ? val.slice(0, 50) : val);
        console.log('  ' + (has ? '✅' : '⚠️ ') + ' ' + f.padEnd(20) + ' ' + (has ? sample : '(leeg)'));
    });
});

console.log('\n═══ TOTAAL ═══');
console.log('Stap 1: concepts ✅');
console.log('Stap 2: uitwerking met ' + gerechten.length + ' gerechten');
console.log('Velden marge_pct/pijnpunten/toppunten/foto_prompt ingevuld:', gerechten.every(g => g.marge_pct && g.pijnpunten?.length && g.toppunten?.length && g.foto_prompt) ? '✅' : '⚠️ niet allemaal');
