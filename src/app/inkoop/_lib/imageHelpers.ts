'use client';
/* Helpers voor het Scanner-component: HEIC → JPEG conversie, resize, file
   naar data-URL. HEIC is Safari/iPhone-only en niet door <canvas> ondersteund
   zonder library — voor MVP detecteren we het en geven een nette foutmelding
   ipv stilletjes te falen. (Latere iteratie: heic2any als HEIC blijkbaar
   dominant is voor de gebruikers.) */

export const ACCEPTED_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
];

export const ACCEPTED_EXTENSIONS = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif';

export function isAccepted(file: File): boolean {
    if (ACCEPTED_TYPES.includes(file.type)) return true;
    const ext = file.name.toLowerCase().split('.').pop();
    return !!ext && ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext);
}

export function isPdf(file: File): boolean {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export function isHeic(file: File): boolean {
    return ['image/heic', 'image/heif'].includes(file.type)
        || /\.heic$|\.heif$/i.test(file.name);
}

/* Lees image-file → resized JPEG data-URL. Hergebruikt de bestaande
   resizeImage-helper uit @/lib/utils zodat we dezelfde optimalisatie hebben
   als de single-file flow. */
export async function imageToDataUrl(file: File): Promise<string> {
    return new Promise<string>(function (resolve, reject) {
        const reader = new FileReader();
        reader.onload = function (ev) {
            const result = ev.target?.result;
            if (typeof result === 'string') resolve(result);
            else reject(new Error('FileReader leverde geen string-result'));
        };
        reader.onerror = function () { reject(new Error('Lezen mislukt')); };
        reader.readAsDataURL(file);
    });
}

/* Kort: extract filename zonder extensie voor display. */
export function shortName(file: File, maxLen = 36): string {
    const base = file.name.replace(/\.[^.]+$/, '');
    if (base.length <= maxLen) return base;
    return base.slice(0, maxLen - 1) + '…';
}
