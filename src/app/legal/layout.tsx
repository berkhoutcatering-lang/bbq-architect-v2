import Link from 'next/link';
import { Flame } from 'lucide-react';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] text-white font-['Outfit']">
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[var(--color-bg-primary)]/80 border-b border-[var(--card-solid)]">
        <div className="max-w-[900px] mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/welkom" className="flex items-center gap-3 no-underline">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#222228] to-[#111115] flex items-center justify-center border border-[var(--color-border-hover)]">
              <Flame className="w-4 h-4 text-[var(--color-accent-gold)]" />
            </div>
            <div>
              <div className="text-[13px] font-semibold tracking-[0.08em] text-white">BBQ ARCHITECT</div>
              <div className="text-[9px] tracking-[0.25em] text-[var(--muted)] uppercase">Juridisch</div>
            </div>
          </Link>
          <nav className="flex items-center gap-5 text-[12px]">
            <Link href="/legal/voorwaarden" className="text-[var(--muted)] hover:text-white no-underline">Voorwaarden</Link>
            <Link href="/legal/privacy" className="text-[var(--muted)] hover:text-white no-underline">Privacy</Link>
            <Link href="/legal/dpa" className="text-[var(--muted)] hover:text-white no-underline">Verwerkersovereenkomst</Link>
            <Link href="/welkom" className="text-[var(--color-accent-gold)] hover:brightness-110 no-underline">← Terug</Link>
          </nav>
        </div>
      </header>
      <main className="max-w-[800px] mx-auto px-6 py-16">
        <article className="prose prose-invert max-w-none [&_h1]:text-3xl [&_h1]:font-extralight [&_h1]:mb-6 [&_h2]:text-xl [&_h2]:font-light [&_h2]:mt-10 [&_h2]:mb-3 [&_h3]:text-base [&_h3]:font-bold [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:text-[14px] [&_p]:leading-relaxed [&_p]:text-white/85 [&_p]:mb-3 [&_li]:text-[14px] [&_li]:text-white/85 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-3">
          {children}
        </article>
      </main>
      <footer className="border-t border-[var(--card-solid)] py-8 text-center text-[11px] text-[var(--muted)]">
        © {new Date().getFullYear()} BBQ Architect — versie 1.0 · Laatst bijgewerkt: 2026-04-21
      </footer>
    </div>
  );
}
