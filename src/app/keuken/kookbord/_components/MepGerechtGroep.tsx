'use client';

import type { MepComponentItem, MepGerecht, MepStatus } from './KookbordClient';
import MepItemCard from './MepItemCard';

interface MepGerechtGroepProps {
  gerecht: MepGerecht;
  guests: number;
  onItemTap: (item: MepComponentItem) => void;
  onStatusToggle: (itemId: number, newStatus: MepStatus) => void | Promise<void>;
}

export default function MepGerechtGroep({ gerecht, guests, onItemTap, onStatusToggle }: MepGerechtGroepProps) {
  if (!gerecht.components || gerecht.components.length === 0) return null;

  const totaal = gerecht.components.length;
  const klaar = gerecht.components.filter(c => c.status === 'klaar').length;

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-2">
        <h2 className="text-2xl font-semibold text-white">{gerecht.naam}</h2>
        <p className="shrink-0 text-sm text-gray-300">{klaar}/{totaal} klaar</p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {gerecht.components.map(item => (
          <MepItemCard
            key={item.mep_item_id}
            item={item}
            guests={guests}
            onTap={() => onItemTap(item)}
            onStatusToggle={onStatusToggle}
          />
        ))}
      </div>
    </section>
  );
}
