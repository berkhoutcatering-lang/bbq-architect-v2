import { redirect } from 'next/navigation';

/**
 * /boekhouding is gemerged in /financien — alle 4 tabs (Winst & Verlies,
 * Uitgaven, BTW, Top Klanten) zitten nu samen met het Dashboard onder
 * /financien?tab=...
 *
 * Audit 2026-04-30 sectie 9: één finance-pagina i.p.v. twee. Sam zei zelf
 * "twee aparte AI-prompts die hetzelfde zeggen".
 */
export default function BoekhoudingRedirect() {
  redirect('/financien?tab=wv');
}
