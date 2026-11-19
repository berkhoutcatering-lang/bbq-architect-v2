'use client';

/**
 * Een datum kiezen met je vinger: het veld toont de gekozen dag voluit, een
 * tik opent de maand eronder met grote vlakken (minstens 48 px), grote knoppen
 * voor de vorige en volgende maand, vandaag omcirkeld en de gekozen dag gevuld.
 * Nederlands, de week begint op maandag. Gemaakt voor de touchscreen van de
 * kassacomputer, waar <input type="date"> te klein is.
 *
 * Waarde als 'jjjj-mm-dd' (of '' voor leeg), net als <input type="date">.
 * Niet in een <label> zetten: het onderschrift staat er zelf in, en een
 * label zou elke tik doorsturen naar de eerste knop.
 */
import { useId, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import '@/styles/datum-kiezer.css';
import Button from '@/components/Button';
import { WEEKDAGEN_KORT, datumKort, datumVoluit, maandNaam, maandRooster, maandVan, vandaagIso, verschuifMaand } from '@/lib/datumKiezer';

interface Props {
    label: string;
    value: string;
    onChange: (iso: string) => void;
    /** Eerste dag die gekozen mag worden ('jjjj-mm-dd'). */
    min?: string;
    /** Tekst in het veld zolang er niets gekozen is. */
    leegTekst?: string;
    /** Laat een knop "Geen datum" zien als er iets gekozen is. */
    wisbaar?: boolean;
    disabled?: boolean;
    /** Meteen open zolang er nog niets gekozen is (bijvoorbeeld als dit het eerste is wat je doet). */
    openAlsLeeg?: boolean;
    /** Na het kiezen, bijvoorbeeld om de cursor terug in het scanveld te zetten. */
    onGekozen?: (iso: string) => void;
    /** Kleiner veld, voor een datum in een regel van een lijst. */
    compact?: boolean;
}

export default function DatumKiezer({ label, value, onChange, min, leegTekst = 'Kies een datum', wisbaar, disabled, openAlsLeeg, onGekozen, compact }: Props) {
    const id = useId();
    const vandaag = vandaagIso();
    const [open, setOpen] = useState(!!openAlsLeeg && !value);
    const start = maandVan(value) ?? maandVan(min && min > vandaag ? min : vandaag)!;
    const [maand, setMaand] = useState(start);

    const kies = (iso: string) => {
        onChange(iso);
        setOpen(false);
        onGekozen?.(iso);
    };
    const openen = () => {
        if (!open) setMaand(maandVan(value) ?? start);
        setOpen(!open);
    };

    return (
        <div className={`dk${compact ? ' dk-compact' : ''}`}>
            <span className={compact ? 'dk-label-klein' : 'kf-eyebrow'} id={`${id}-label`}>{label}</span>
            <Button type="button" variant="ghost" className="dk-veld" disabled={disabled} aria-expanded={open} aria-labelledby={`${id}-label ${id}-waarde`}
                icon={<CalendarDays size={compact ? 15 : 18} />} onClick={openen}>
                <span id={`${id}-waarde`} className={value ? undefined : 'dk-leeg'}>{value ? (compact ? datumKort(value) : datumVoluit(value)) : leegTekst}</span>
            </Button>

            {open && (
                <div className="dk-paneel" role="group" aria-label={`${label}: kies een dag`}>
                    <div className="dk-kop">
                        <Button type="button" variant="ghost" className="dk-pijl" aria-label="Vorige maand" icon={<ChevronLeft size={22} />}
                            onClick={() => setMaand(verschuifMaand(maand.jaar, maand.maand0, -1))} />
                        <span className="dk-maand">{maandNaam(maand.jaar, maand.maand0)}</span>
                        <Button type="button" variant="ghost" className="dk-pijl" aria-label="Volgende maand" icon={<ChevronRight size={22} />}
                            onClick={() => setMaand(verschuifMaand(maand.jaar, maand.maand0, 1))} />
                    </div>
                    <div className="dk-rooster" role="grid">
                        {WEEKDAGEN_KORT.map((w) => <span key={w} className="dk-weekdag" role="columnheader">{w}</span>)}
                        {maandRooster(maand.jaar, maand.maand0).flat().map((d) => {
                            const gekozen = d.iso === value;
                            const isVandaag = d.iso === vandaag;
                            const teVroeg = !!min && d.iso < min;
                            return (
                                <Button key={d.iso} type="button" variant={gekozen ? 'brand' : 'ghost'} disabled={teVroeg}
                                    className={`dk-dag${d.inMaand ? '' : ' dk-buiten'}${isVandaag ? ' dk-vandaag' : ''}`}
                                    aria-pressed={gekozen} aria-label={`${datumVoluit(d.iso)}${isVandaag ? ', vandaag' : ''}`}
                                    onClick={() => kies(d.iso)}>
                                    {d.dag}
                                </Button>
                            );
                        })}
                    </div>
                    {wisbaar && value && (
                        <Button type="button" variant="ghost" className="dk-wis" onClick={() => kies('')}>Geen datum</Button>
                    )}
                </div>
            )}
        </div>
    );
}
