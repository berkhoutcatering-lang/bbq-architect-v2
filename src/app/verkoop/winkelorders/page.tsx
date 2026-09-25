import { redirect } from 'next/navigation';

/**
 * /verkoop/winkelorders is opgegaan in /verkoop/webshop (de vakjes, 25 sep
 * 2026). De orders staan daar in het vakje van de dag waarop ze klaar moeten
 * zijn. Redirect blijft voor oude bookmarks.
 */
export default function WinkelordersRedirect() {
  redirect('/verkoop/webshop');
}
