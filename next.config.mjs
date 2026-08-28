import withBundleAnalyzer from '@next/bundle-analyzer';

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
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
