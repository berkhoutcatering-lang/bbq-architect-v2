/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Server-only CJS packages die Turbopack niet schoon kan bundelen.
   * archiver heeft `module.exports = archiver` (geen ESM default-export),
   * waardoor `import archiver from 'archiver'` faalt onder strict Turbopack.
   * serverExternalPackages laat ze ongebundled als require() draaien op de
   * Node runtime — werkt voor /api routes en server-actions.
   */
  serverExternalPackages: ['archiver'],
};

export default nextConfig;
