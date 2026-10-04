/**
 * Een productfoto klaarzetten voor de website, in de browser (blok C5).
 *
 * De studiofoto komt uit ChatGPT (2 : 3, 1024 × 1536 — het fotorecept van de
 * site). Hier: bijsnijden naar 2 : 3 als het net niet klopt, en drie breedtes
 * als WebP (640, 960, 1024), zoals het beeldregister van de website. Geen
 * server, geen extra pakket: canvas doet het.
 */

export const BREEDTES = [640, 960, 1024] as const;
export const VERHOUDING = 2 / 3;

export interface Versie {
    w: number;
    h: number;
    blob: Blob;
}

export interface Fotocheck {
    breedte: number;
    hoogte: number;
    /** Afwijking van 2 : 3 in procent. */
    afwijking: number;
    waarschuwing: string | null;
}

export function check(breedte: number, hoogte: number): Fotocheck {
    const afwijking = Math.abs(breedte / hoogte - VERHOUDING) / VERHOUDING * 100;
    const waarschuwing =
        breedte < 640 ? 'Deze foto is te klein (minder dan 640 pixels breed). Maak hem opnieuw in ChatGPT.'
            : breedte < 1024 ? 'Deze foto is kleiner dan 1024 pixels breed: op een groot scherm wordt hij zacht.'
                : afwijking > 3 ? `Niet staand 2 : 3 (${breedte} × ${hoogte}): hij wordt in het midden bijgesneden.`
                    : null;
    return { breedte, hoogte, afwijking, waarschuwing };
}

/** De uitsnede in 2 : 3 uit het midden. */
export function uitsnede(breedte: number, hoogte: number): { x: number; y: number; w: number; h: number } {
    if (breedte / hoogte > VERHOUDING) {
        const w = Math.round(hoogte * VERHOUDING);
        return { x: Math.round((breedte - w) / 2), y: 0, w, h: hoogte };
    }
    const h = Math.round(breedte / VERHOUDING);
    return { x: 0, y: Math.round((hoogte - h) / 2), w: breedte, h };
}

/** De breedtes die de foto aankan (nooit opschalen); minstens één. */
export function bruikbareBreedtes(bronBreedte: number): number[] {
    const b = BREEDTES.filter((w) => w <= bronBreedte);
    return b.length ? [...b] : [Math.min(bronBreedte, BREEDTES[0])];
}

export async function maakVersies(bestand: File): Promise<{ check: Fotocheck; versies: Versie[] }> {
    const beeld = await createImageBitmap(bestand);
    const c = check(beeld.width, beeld.height);
    const u = uitsnede(beeld.width, beeld.height);
    const versies: Versie[] = [];
    for (const w of bruikbareBreedtes(u.w)) {
        const h = Math.round(w / VERHOUDING);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Deze browser kan de foto niet verwerken.');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(beeld, u.x, u.y, u.w, u.h, 0, 0, w, h);
        const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/webp', 0.86));
        if (!blob) throw new Error('Deze browser kan geen WebP maken.');
        versies.push({ w, h, blob });
    }
    beeld.close();
    return { check: c, versies };
}

/** Een etiketfoto voor de AI: hooguit 1568 px aan de lange kant, JPEG, base64 zonder kop. */
export async function etiketVoorAi(bestand: File): Promise<{ media_type: 'image/jpeg'; data: string }> {
    const beeld = await createImageBitmap(bestand);
    const schaal = Math.min(1, 1568 / Math.max(beeld.width, beeld.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(beeld.width * schaal);
    canvas.height = Math.round(beeld.height * schaal);
    canvas.getContext('2d')!.drawImage(beeld, 0, 0, canvas.width, canvas.height);
    beeld.close();
    const url = canvas.toDataURL('image/jpeg', 0.85);
    return { media_type: 'image/jpeg', data: url.slice(url.indexOf(',') + 1) };
}
