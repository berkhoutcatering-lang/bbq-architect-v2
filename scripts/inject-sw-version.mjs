/* Vervangt CACHE_VERSION in public/sw.js door de huidige build-versie zodat
   elke deploy een nieuwe service-worker cache krijgt. Zonder deze stap blijven
   oude clients hun oude JS-bundle gebruiken (zelfde cache-key = zelfde inhoud)
   en zien gebruikers na een release niets nieuws tot ze handmatig de SW
   unregisteren. Runt automatisch als onderdeel van `next build`. */

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const SW_PATH = 'public/sw.js';

function resolveVersion() {
  /* Op Vercel is VERCEL_GIT_COMMIT_SHA altijd beschikbaar tijdens build.
     Lokale fallback: `git rev-parse HEAD`. Als ook dat faalt (shallow clone,
     geen git context), valt terug op een tijdstempel zodat de cache toch
     ververst — beter een random key dan een vaste die nooit verandert. */
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA;
  }
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return `ts-${Date.now()}`;
  }
}

const sw = readFileSync(SW_PATH, 'utf8');
const version = resolveVersion().slice(0, 12);
const next = sw.replace(
  /const CACHE_VERSION = '[^']*';/,
  `const CACHE_VERSION = '${version}';`,
);

if (next === sw) {
  console.warn(
    `[inject-sw-version] CACHE_VERSION pattern niet gevonden in ${SW_PATH} — sw.js niet aangepast`,
  );
  process.exit(0);
}

writeFileSync(SW_PATH, next);
console.log(`[inject-sw-version] ${SW_PATH} CACHE_VERSION → ${version}`);
