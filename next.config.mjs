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
