/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lock workspace root naar deze worktree om de multi-lockfile warning + trage
  // tracing-scan over de parent-repo te voorkomen.
  outputFileTracingRoot: process.cwd(),
  // Sluit grote dev/test-bestanden uit van de production-trace zodat Vercel
  // build niet hangt op het scannen van miljoenen irrelevant files.
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
  experimental: {
    // Single-process compile — voorkomt het patroon waar jest-worker child-processen
    // op 99% CPU komen in een tight loop tijdens production build op Vercel's 2-core/8GB box.
    workerThreads: false,
    cpus: 1,
  },
};

export default nextConfig;
