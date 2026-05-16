/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lock workspace root naar deze repo zodat Next.js niet de hele parent-mono-repo
  // scant. Voorkomt trage tracing + multi-lockfile warning.
  outputFileTracingRoot: process.cwd(),

  // Sluit zware niet-runtime folders uit van de productie-trace zodat de
  // Vercel build niet hangt op het scannen van miljoenen irrelevant files.
  outputFileTracingExcludes: {
    '*': [
      'node_modules/@types/**',
      'node_modules/typescript/**',
      'node_modules/playwright/**',
      'node_modules/@playwright/**',
      'node_modules/.cache/**',
      '.next/cache/**',
      'docs/**',
      'evals/**',
      'promptfoo/**',
      'chrome-extension/**',
      'cloudflare/**',
      'scripts/**',
      'supabase/migrations/**',
    ],
  },

  // Externalize zware server-only packages — Next.js bundelt ze niet maar laat
  // node ze bij runtime laden. Voorkomt compile-loops bij grote SDK's met
  // diepe dependency-trees (Anthropic, Supabase, pdf-libs, etc.).
  serverExternalPackages: [
    '@anthropic-ai/sdk',
    '@supabase/supabase-js',
    '@supabase/ssr',
    'pdf-lib',
    'pdfjs-dist',
    'jszip',
    'konva',
    'react-konva',
    'maplibre-gl',
    'jspdf',
    'jspdf-autotable',
    'resend',
    'recharts',
  ],

  // experimental.workerThreads:false + cpus:1 stond hier maar bleek zelf de
  // build te laten hangen op "Creating an optimized production build..." —
  // Next.js 16.2.6 heeft die flags niet meer stabiel. Standaard parallelism
  // werkt prima zolang we serverExternalPackages goed gevuld houden.
};

export default nextConfig;
