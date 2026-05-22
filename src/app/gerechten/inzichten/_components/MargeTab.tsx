import { Sparkles } from 'lucide-react';
import MenuAnalyseClient from './MenuAnalyseClient';

/**
 * Marge-tab — BCG-matrix (populariteit × marge). Direct wrapper rond de bestaande
 * client-component zodat we de data-fetches niet hoeven te dupliceren. De redirect
 * /gerechten/menu-analyse → /gerechten/inzichten?tab=marge bewaart bestaande bookmarks.
 */
export default function MargeTab() {
    return (
        <>
            <div style={{ marginTop: 'var(--space-4)', padding: '14px 16px', background: 'rgba(255,255,255,.02)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, color: 'var(--muted-light)' }}>
                <Sparkles size={12} style={{ verticalAlign: 'middle', marginRight: 6 }} aria-hidden />
                <strong style={{ color: 'var(--text)' }}>Menu-engineering</strong> — gerechten in 4 kwadranten o.b.v. populariteit (verkocht via offertes) × marge (verkoopprijs t.o.v. kostprijs).
                <em style={{ marginLeft: 6, color: 'var(--muted)' }}>Was /gerechten/menu-analyse.</em>
            </div>
            <MenuAnalyseClient />
        </>
    );
}
