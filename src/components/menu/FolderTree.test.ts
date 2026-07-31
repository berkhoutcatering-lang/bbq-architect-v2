import { describe, it, expect } from 'vitest';
import { isMapOpen, toggleMap, parseDropId } from './FolderTree';

/* De mappen komen ná de eerste render binnen. Deze tests bewaken dat een
   hoofdmap die later binnenkomt open staat (anders lijkt een net gemaakte
   submap verdwenen) en dat handmatig dichtklappen blijft staan. */
describe('isMapOpen', () => {
    it('een map die later binnenkomt staat open', () => {
        /* De stand is leeg zolang de mappen nog niet geladen zijn — precies het
           moment waarop de oude begin-waarde werd berekend. */
        expect(isMapOpen({}, 'sauzen')).toBe(true);
        expect(isMapOpen({ vlees: true }, 'sauzen')).toBe(true);
    });

    it('een map die de gebruiker dichtklapte blijft dicht', () => {
        expect(isMapOpen({ sauzen: false }, 'sauzen')).toBe(false);
    });
});

describe('toggleMap', () => {
    it('klapt een standaard-open map dicht, en daarna weer open', () => {
        const dicht = toggleMap({}, 'sauzen');
        expect(isMapOpen(dicht, 'sauzen')).toBe(false);

        const weerOpen = toggleMap(dicht, 'sauzen');
        expect(isMapOpen(weerOpen, 'sauzen')).toBe(true);
    });

    it('raakt de andere mappen niet aan', () => {
        const na = toggleMap({ vlees: false }, 'sauzen');
        expect(na.vlees).toBe(false);
        expect(isMapOpen(na, 'sauzen')).toBe(false);
    });
});

describe('parseDropId', () => {
    it('"Alle componenten" is geen sleep-doel', () => {
        expect(parseDropId('folder:all')).toBeUndefined();
    });

    it('"Zonder folder" haalt de map weg', () => {
        expect(parseDropId('folder:__root__')).toBeNull();
    });

    it('een echte map geeft het id terug', () => {
        expect(parseDropId('folder:9f1c')).toBe('9f1c');
    });

    it('alles daarbuiten telt niet als drop', () => {
        expect(parseDropId(null)).toBeUndefined();
        expect(parseDropId('card:12')).toBeUndefined();
    });
});
