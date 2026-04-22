/**
 * Enable Supabase Auth leaked-password-protection via Management API.
 *
 * Waarom dit een los script is (geen MCP-migration):
 * - De auth-config zit niet in Postgres maar bij de Supabase Auth-service
 * - Vereist een Personal Access Token (PAT), niet de service-role-key
 * - Is een eenmalige actie per project
 *
 * Gebruik (Sam):
 *   1. Maak een PAT op https://supabase.com/dashboard/account/tokens
 *      → klik "Generate new token" → kopieer
 *   2. Run één keer:
 *      SUPABASE_ACCESS_TOKEN=<jouw_pat> npx tsx scripts/enable-leaked-password-protection.ts
 *   3. Klaar — advisor warning verdwijnt binnen een minuut
 *
 * Vereist Pro Plan of hoger (leaked-password-protection is niet beschikbaar op Free).
 */

const PROJECT_REF = 'oheilybckvtsczmbczot';
const ENDPOINT = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    console.error('FOUT: SUPABASE_ACCESS_TOKEN env var ontbreekt.');
    console.error('');
    console.error('Maak een Personal Access Token op:');
    console.error('  https://supabase.com/dashboard/account/tokens');
    console.error('');
    console.error('Run vervolgens:');
    console.error('  SUPABASE_ACCESS_TOKEN=sbp_xxx npx tsx scripts/enable-leaked-password-protection.ts');
    process.exit(2);
  }

  const payload = {
    password_hibp_enabled: true,
    // Ook meteen een redelijke minimum-password-lengte afdwingen
    password_min_length: 8,
    // Lowercase + digits verplichten (strongest option behalve symbols)
    password_required_characters: 'lower_upper_letters_digits',
  };

  console.log(`[setup] PATCH ${ENDPOINT}`);
  console.log(`[setup] payload:`, payload);

  const res = await fetch(ENDPOINT, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const body = await res.text();

  if (!res.ok) {
    console.error(`[setup] FOUT HTTP ${res.status}: ${body}`);
    if (res.status === 401) {
      console.error('Token ongeldig of geen toegang tot dit project.');
    } else if (res.status === 403 || /plan/i.test(body)) {
      console.error('Leaked-password-protection vereist Pro Plan. Zie https://supabase.com/pricing');
    }
    process.exit(1);
  }

  console.log(`[setup] OK — HIBP leaked-password-check is nu aan voor project ${PROJECT_REF}.`);
  console.log(`[setup] Response: ${body.slice(0, 200)}...`);
  console.log('');
  console.log('Advisor warning `auth_leaked_password_protection` verdwijnt binnen ~1 minuut.');
}

main().catch(e => {
  console.error('[setup] FATAL:', e);
  process.exit(1);
});
