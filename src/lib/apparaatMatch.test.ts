import { describe, it, expect } from 'vitest';
import { zoekApparaat, maakGemisRapport, type MaterieelItem } from './apparaatMatch';

const keuken: MaterieelItem[] = [
    { id: 1, naam: 'Yoder YS1500 smoker', type: 'BBQ' },
    { id: 2, naam: 'Wokpan RVS 30cm', type: 'Servies' },
    { id: 3, naam: 'yoder aanhanger', type: 'BBQ' },
];

describe('zoekApparaat', () => {
    it('vindt op trefwoord in de naam', () => {
        const t = zoekApparaat('smoker', keuken);
        expect(t.aanwezig).toBe(true);
        expect(t.item?.id).toBe(1);
        expect(t.zekerheid).toBe('geraden');
    });

    it('laat jouw eigen invoer winnen van het raden', () => {
        const met: MaterieelItem[] = [
            ...keuken,
            { id: 9, naam: 'Naamloze machine', maakt_mogelijk: ['groentesnijder'] },
        ];
        const t = zoekApparaat('groentesnijder', met);
        expect(t.item?.id).toBe(9);
        expect(t.zekerheid).toBe('expliciet');
    });

    it('zegt eerlijk wanneer je iets niet hebt', () => {
        const t = zoekApparaat('sifon', keuken);
        expect(t.aanwezig).toBe(false);
        expect(t.item).toBeNull();
        expect(t.zekerheid).toBe('geen');
    });

    it('herkent merknamen, want zo staan ze in een spullenlijst', () => {
        const met = [{ id: 5, naam: 'Bizerba VS12', type: 'Overig' }];
        expect(zoekApparaat('snijmachine', met).aanwezig).toBe(true);
        expect(zoekApparaat('mixer', [{ id: 6, naam: 'KitchenAid Artisan' }]).aanwezig).toBe(true);
        expect(zoekApparaat('groentesnijder', [{ id: 7, naam: 'Robot Coupe CL50' }]).aanwezig).toBe(true);
    });

    it('geeft toe dat het raden misgaat — een aanhanger is geen smoker', () => {
        // "yoder aanhanger" matcht niet op 'smoker', want yoder staat niet in de
        // trefwoorden. Zou dat wel zo zijn, dan meldde het rapport ten onrechte
        // dat je kunt roken. Daarom staan er geen merknamen bij smoker.
        const t = zoekApparaat('smoker', [{ id: 3, naam: 'yoder aanhanger', type: 'BBQ' }]);
        expect(t.aanwezig).toBe(false);
    });
});

describe('maakGemisRapport', () => {
    const technieken = [
        { slug: 'roken', naam: 'Roken', apparaat: 'smoker' },
        { slug: 'schuim', naam: 'Schuim', apparaat: 'sifon' },
        { slug: 'gel', naam: 'Gel', apparaat: 'blender' },
        { slug: 'puree', naam: 'Puree', apparaat: 'blender' },
        { slug: 'poeder', naam: 'Poeder', apparaat: 'blender' },
        { slug: 'snijden', naam: 'Snijden', apparaat: null },
    ];

    it('scheidt wat je kunt van wat gesloten is', () => {
        const r = maakGemisRapport(technieken, keuken);
        expect(r.open.map((o) => o.techniek.slug)).toEqual(['roken']);
        expect(r.zonderApparaat.map((t) => t.slug)).toEqual(['snijden']);
    });

    it('zet het apparaat dat de meeste deuren opent bovenaan', () => {
        const r = maakGemisRapport(technieken, keuken);
        expect(r.gesloten[0].apparaat).toBe('blender');
        expect(r.gesloten[0].technieken).toHaveLength(3);
        expect(r.gesloten[1].apparaat).toBe('sifon');
    });

    it('telt elke techniek precies één keer', () => {
        const r = maakGemisRapport(technieken, keuken);
        const totaal = r.open.length + r.zonderApparaat.length + r.gesloten.reduce((s, g) => s + g.technieken.length, 0);
        expect(totaal).toBe(technieken.length);
    });
});
