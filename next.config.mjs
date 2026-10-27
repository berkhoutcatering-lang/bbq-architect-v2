import withBundleAnalyzer from '@next/bundle-analyzer';

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

/**
 * De Toonbank (de kassa-app, eigen repo hopbites-toonbank) verschijnt onder
 * het adres van BBQ Architect: /toonbank. Het blijft een apart programma op
 * een eigen Vercel-project; BBQ Architect geeft /toonbank/* alleen door
 * (besluit Mathijs, 27 oktober 2026). TOONBANK_UPSTREAM_URL is het adres van
 * dat Vercel-project, bijvoorbeeld https://hopbites-toonbank.vercel.app. Niet
 * gezet: geen doorgifte en geen tegel. Alleen https telt.
 */
export function toonbankUpstream(ruw = process.env.TOONBANK_UPSTREAM_URL) {
  const tekst = (ruw || '').trim();
  if (!tekst) return null;
  try {
    const adres = new URL(tekst);
    const lokaal = adres.hostname === 'localhost' || adres.hostname === '127.0.0.1';
    if (adres.protocol !== 'https:' && !(adres.protocol === 'http:' && lokaal)) return null;
    return adres.origin;
  } catch {
    return null;
  }
}

export function toonbankDoorgifte(upstream = toonbankUpstream()) {
  if (!upstream) return [];
  return [
    { source: '/toonbank', destination: upstream + '/' },
    { source: '/toonbank/', destination: upstream + '/' },
    { source: '/toonbank/:pad*', destination: upstream + '/:pad*' },
  ];
}

const toonbankAan = toonbankUpstream() !== null;

/** @type {import('next').NextConfig} */
const nextConfig = {
  /* Met een Toonbank-adres wijst de tegel "Winkel-kassa" naar /toonbank,
     tenzij NEXT_PUBLIC_TOONBANK_URL zelf al gezet is. */
  ...(toonbankAan && !process.env.NEXT_PUBLIC_TOONBANK_URL
    ? { env: { NEXT_PUBLIC_TOONBANK_URL: '/toonbank' } }
    : {}),

  /**
   * Server-only CJS packages die Turbopack niet schoon kan bundelen.
   * archiver heeft `module.exports = archiver` (geen ESM default-export),
   * waardoor `import archiver from 'archiver'` faalt onder strict Turbopack.
   * serverExternalPackages laat ze ongebundled als require() draaien op de
   * Node runtime — werkt voor /api routes en server-actions.
   */
  /* pdfjs-dist (legacy build) leest server-side de tekstlaag van prijslijst-PDFs.
     Ongebundeld laten voorkomt dat Turbopack z'n dynamische font/worker-imports
     probeert te resolven. */
  serverExternalPackages: ['archiver', 'pdfjs-dist'],
  /**
   * pdfjs wordt via een dynamische `import()` van een diep pad geladen; die
   * ziet de file-tracer niet, waardoor de bestanden buiten de deploy vielen en
   * de tekstlaag-extractie op productie stilletjes faalde (2026-07-26). Hier
   * expliciet meenemen zodat de API-routes 'm echt bij zich hebben.
   */
  outputFileTracingIncludes: {
    '/api/**': ['./node_modules/pdfjs-dist/legacy/build/**'],
  },
  /**
   * Barrel-imports van grote pakketten omzetten naar directe imports, zodat
   * alleen de gebruikte iconen/functies in de bundel komen. lucide-react staat
   * er ondanks de expliciete icoon-lijst in components/ai/blocks/icons.ts nog
   * bij: de app importeert op ~349 andere plekken direct uit 'lucide-react'.
   */
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      'framer-motion',
      'date-fns',
      '@tanstack/react-table',
    ],
  },

  /**
   * Er stond helemaal geen images-config, waardoor next/image niets kon
   * optimaliseren. De hero-PNG's in public/ zijn 321 KB per stuk en gingen
   * onbewerkt de deur uit. AVIF/WebP scheelt daar het grootste deel van.
   */
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
  },

  async rewrites() {
    return { beforeFiles: toonbankDoorgifte() };
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

/**
 * Bundle-analyzer wordt alleen geactiveerd bij `ANALYZE=true npm run build`.
 * Genereert HTML-rapporten in .next/analyze/{client,server,edge}.html
 * voor inspectie van bundle-grootte per chunk. Pre-launch audit P1:
 * meet de impact van code-splits op de 5 monolithen.
 */
const bundleAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

export default bundleAnalyzer(nextConfig);
