'use client';

import type { MepComponentItem, MepGerecht, MepStatus } from './KookbordClient';
import { ACCENT } from './mep-ui';
import MepItemCard from './MepItemCard';

interface MepGerechtGroepProps {
  gerecht: MepGerecht;
  guests: number;
  onItemTap: (item: MepComponentItem, gerechtNaam: string) => void;
  onStatusToggle: (itemId: number, newStatus: MepStatus) => void | Promise<void>;
}

export default function MepGerechtGroep({ gerecht, guests, onItemTap, onStatusToggle }: MepGerechtGroepProps) {
  if (!gerecht.components || gerecht.components.length === 0) return null;

  const totaal = gerecht.components.length;
  const klaar = gerecht.components.filter(c => c.status === 'klaar').length;
  const pct = totaal ? klaar / totaal : 0;

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 15 }}>
        <span style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 500, fontSize: 20, letterSpacing: '-.01em', color: '#f3f3f3' }}>{gerecht.naam}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
          <span style={{ width: 80, height: 5, borderRadius: 3, background: 'rgba(130,130,130,.16)', overflow: 'hidden', display: 'block' }}>
            <span style={{ display: 'block', height: '100%', width: `${pct * 100}%`, background: pct === 1 ? '#22c55e' : ACCENT, borderRadius: 3, transition: 'width .4s ease' }} />
          </span>
          <span style={{ fontSize: 12.5, color: '#949494', fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '.01em' }}>{klaar}/{totaal}</span>
        </span>
        <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,rgba(130,130,130,.16),transparent)' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(330px,1fr))', gap: 16 }}>
        {gerecht.components.map(item => (
          <MepItemCard
            key={item.mep_item_id}
            item={item}
            guests={guests}
            onTap={() => onItemTap(item, gerecht.naam)}
            onStatusToggle={onStatusToggle}
          />
        ))}
      </div>
    </section>
  );
}
