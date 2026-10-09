'use client';

/**
 * "Nieuw op de site" — een bier, wijn of worst in één keer (blok C7).
 * Soort, naam en (als je hem weet) de brouwerij of producent. Daarna opent de
 * productkaart: foto erin, de AI laten zoeken, prijs en allergenen invullen,
 * bekijken, op de site zetten. Het product, het artikel voor de losse
 * verkoop en de koppeling ertussen ontstaan hier samen.
 */
import { useState } from 'react';
import { Beer, Drumstick, Plus, Wine } from 'lucide-react';
import Button from '@/components/Button';
import type { Paginasoort } from '@/lib/winkel/productsoorten';
import Drawer from './Drawer';
import { nieuwPaginaProduct } from '../catalogus-actions';

type Melding = (tekst: string, soort?: 'success' | 'error' | 'info') => void;

const SOORTEN: { soort: Paginasoort; label: string; icoon: typeof Beer; maker: string | null; voorbeeld: string }[] = [
    { soort: 'bier', label: 'Bier', icoon: Beer, maker: 'Brouwerij', voorbeeld: 'Tripel Karmeliet' },
    { soort: 'wijn', label: 'Wijn', icoon: Wine, maker: 'Producent', voorbeeld: 'Rioja Crianza' },
    { soort: 'vlees', label: 'Worst of vlees', icoon: Drumstick, maker: null, voorbeeld: 'Droge worst met venkel' },
];

export default function NieuwOpDeSite({ onClose, onAangemaakt, melding }: { onClose: () => void; onAangemaakt: (id: string) => void; melding: Melding }) {
    const [soort, setSoort] = useState<Paginasoort>('bier');
    const [naam, setNaam] = useState('');
    const [maker, setMaker] = useState('');
    const [vleessoort, setVleessoort] = useState<'vers' | 'droge-worst'>('droge-worst');
    const [ean, setEan] = useState('');
    const [bezig, setBezig] = useState(false);
    const s = SOORTEN.find((x) => x.soort === soort)!;

    async function maak() {
        setBezig(true);
        try {
            const r = await nieuwPaginaProduct({ soort, naam, maker: maker.trim() || null, vleessoort, ean: ean.trim() || null });
            if ('error' in r) { melding(r.error, 'error'); return; }
            melding(`${naam} staat klaar als concept: nog niet op de site.`, 'success');
            onAangemaakt(r.data.id);
        } finally { setBezig(false); }
    }

    return (
        <Drawer title="Nieuw op de site" subtitle="Eerst het concept; foto, AI en prijs doe je op de volgende kaart" onClose={onClose} width={520}
            footer={<><Button icon={<Plus size={14} />} loading={bezig} disabled={!naam.trim()} onClick={maak}>Maak het concept</Button><Button variant="ghost" onClick={onClose}>Annuleren</Button></>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div className="field"><label>Wat is het?</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {SOORTEN.map((x) => <button key={x.soort} type="button" className="ws-chip" aria-pressed={soort === x.soort} onClick={() => setSoort(x.soort)}><x.icoon size={14} />{x.label}</button>)}
                    </div>
                </div>
                <div className="field"><label>Naam</label><input autoFocus value={naam} onChange={(e) => setNaam(e.target.value)} placeholder={s.voorbeeld} onKeyDown={(e) => { if (e.key === 'Enter' && naam.trim()) maak(); }} /></div>
                {s.maker && <div className="field"><label>{s.maker}</label><input value={maker} onChange={(e) => setMaker(e.target.value)} placeholder="Mag leeg; de AI zoekt het op" /></div>}
                {soort === 'vlees' && (
                    <div className="field"><label>Groep</label>
                        <div className="ws-keuze" style={{ width: 260 }}>
                            <button type="button" aria-pressed={vleessoort === 'droge-worst'} onClick={() => setVleessoort('droge-worst')}>droge worst</button>
                            <button type="button" aria-pressed={vleessoort === 'vers'} onClick={() => setVleessoort('vers')}>vers</button>
                        </div>
                    </div>
                )}
                <div className="field"><label>Streepjescode</label><input inputMode="numeric" value={ean} onChange={(e) => setEan(e.target.value.replace(/\D/g, ''))} placeholder="Mag leeg" /><div className="field-hint">Helpt de AI het juiste product te vinden, en straks de kassa.</div></div>
            </div>
        </Drawer>
    );
}
