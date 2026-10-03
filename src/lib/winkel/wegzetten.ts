/**
 * Wegzet-taken (BA-6) — rekenwerk zonder scherm.
 * Plan v5 §M1 (BA-6) · Contract toonbank/v1 §1.10 · Migratie 20261005140000_winkel_wegzetten.
 *
 * Een wegzet-taak is een betaalde webshoporder met losse winkelwaar (artikel
 * met afhandeling 'wegzetten') die nog uit het schap moet: "Zet 4 × Naober
 * apart voor HB-2026-1042 (Jansen, za)". De rijen komen uit de view
 * winkel_wegzet_taken; afvinken gaat via winkel_zet_order_apart, die per regel
 * winkel_zet_klaargezet aanroept (−n als verkoop_online).
 *
 * Puur: geen database, de klok komt altijd van buiten. Tijden in
 * Europe/Amsterdam, net als de database.
 */

export type Afhandeling = 'inpakken' | 'wegzetten';

export interface WegzetProduct {
    product_id: string | null;
    naam: string;
    hoeveelheid: number;
    eenheid?: 'stuk' | 'gram' | null;
}

export interface WegzetRegel {
    regel_id: number;
    artikel: string;
    aantal: number;
    producten: WegzetProduct[];
}

/** Eén rij van winkel_wegzet_taken: alleen ordernummer en naam, geen contactgegevens. */
export interface WegzetTaak {
    order_id: number;
    nummer: string;
    naam: string;
    /** ISO-tijdstip; zonder tijdvak 00:00 in Amsterdam. */
    afhaalmoment: string | null;
    /** Zoals de database het rekende bij het ophalen; isRood rekent opnieuw met de klok van nu. */
    ophalen_binnen_24u: boolean;
    regels: WegzetRegel[];
}

const ZONE = 'Europe/Amsterdam';
const DAG_MS = 24 * 60 * 60 * 1000;
const DAGEN = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'] as const;

/* ── Een rij uit de view ─────────────────────────────────────────────────── */

const getal = (x: unknown): number => {
    const n = typeof x === 'number' ? x : Number(x);
    return Number.isFinite(n) ? n : 0;
};

/**
 * Een rij uit winkel_wegzet_taken in vaste vorm. Supabase geeft numeric soms
 * als tekst en jsonb als object; wat niet klopt wordt overgeslagen, nooit geraden.
 */
export function taakUitRij(rij: unknown): WegzetTaak | null {
    if (!rij || typeof rij !== 'object') return null;
    const r = rij as Record<string, unknown>;
    const orderId = getal(r.order_id ?? r.id);
    if (!orderId || typeof r.nummer !== 'string') return null;
    const regels = Array.isArray(r.regels) ? r.regels : [];
    return {
        order_id: orderId,
        nummer: r.nummer,
        naam: typeof r.naam === 'string' ? r.naam : '',
        afhaalmoment: typeof r.afhaalmoment === 'string' ? r.afhaalmoment : null,
        ophalen_binnen_24u: r.ophalen_binnen_24u === true,
        regels: regels.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object').map((x) => ({
            regel_id: getal(x.regel_id),
            artikel: typeof x.artikel === 'string' ? x.artikel : '',
            aantal: getal(x.aantal),
            producten: (Array.isArray(x.producten) ? x.producten : [])
                .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
                .map((p) => ({
                    product_id: typeof p.product_id === 'string' ? p.product_id : null,
                    naam: typeof p.naam === 'string' ? p.naam : '',
                    hoeveelheid: getal(p.hoeveelheid),
                    eenheid: p.eenheid === 'gram' ? 'gram' : p.eenheid === 'stuk' ? 'stuk' : null,
                })),
        })),
    };
}

/* ── Wat er apart moet ───────────────────────────────────────────────────── */

/** De producten van alle regels samen, per product opgeteld. Een regel zonder inhoud telt als het artikel zelf. */
export function wegzetProducten(taak: Pick<WegzetTaak, 'regels'>): WegzetProduct[] {
    const per = new Map<string, WegzetProduct>();
    for (const r of taak.regels) {
        const lijst = r.producten.length > 0 ? r.producten : [{ product_id: null, naam: r.artikel, hoeveelheid: r.aantal, eenheid: 'stuk' as const }];
        for (const p of lijst) {
            const sleutel = p.product_id ?? `naam:${p.naam}`;
            const bestaand = per.get(sleutel);
            if (bestaand) bestaand.hoeveelheid = rond(bestaand.hoeveelheid + p.hoeveelheid);
            else per.set(sleutel, { ...p });
        }
    }
    return [...per.values()];
}

/** "4 × Naober", "450 g BBQ-amandelen". */
export function productKort(p: WegzetProduct): string {
    const n = p.hoeveelheid.toLocaleString('nl-NL', { maximumFractionDigits: 2 });
    return p.eenheid === 'gram' ? `${n} g ${p.naam}` : `${n} × ${p.naam}`;
}

/** "a", "a en b", "a, b en c". */
function opsomming(delen: string[]): string {
    if (delen.length <= 1) return delen[0] ?? '';
    return `${delen.slice(0, -1).join(', ')} en ${delen[delen.length - 1]}`;
}

/* ── Tijd ────────────────────────────────────────────────────────────────── */

/** Datum en tijd in Amsterdam: { datum: 'jjjj-mm-dd', tijd: 'uu:mm', dag: 0–6 (zo–za) }. */
function inAmsterdam(iso: string | Date): { datum: string; tijd: string; dag: number } | null {
    const d = typeof iso === 'string' ? new Date(iso) : iso;
    if (Number.isNaN(d.getTime())) return null;
    const delen = new Intl.DateTimeFormat('en-GB', {
        timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(d);
    const v = (t: string) => delen.find((x) => x.type === t)?.value ?? '';
    const datum = `${v('year')}-${v('month')}-${v('day')}`;
    const [j, m, dd] = datum.split('-').map(Number);
    return { datum, tijd: `${v('hour')}:${v('minute')}`, dag: new Date(Date.UTC(j!, m! - 1, dd!)).getUTCDay() };
}

/** "za" — de dag van het afhaalmoment in Amsterdam; leeg als er geen moment is. */
export function dagKort(iso: string | null): string {
    const a = iso ? inAmsterdam(iso) : null;
    return a ? DAGEN[a.dag]! : '';
}

/** "za 6 mrt 16:30", of zonder tijd als het afhaalmoment op 00:00 valt (alleen een dag). */
export function afhaalTekst(iso: string | null): string {
    if (!iso) return 'geen afhaalmoment';
    const a = inAmsterdam(iso);
    if (!a) return 'geen afhaalmoment';
    const datum = new Intl.DateTimeFormat('nl-NL', { timeZone: ZONE, day: 'numeric', month: 'short' }).format(new Date(iso)).replace('.', '');
    return `${DAGEN[a.dag]} ${datum}${a.tijd === '00:00' ? '' : ` ${a.tijd}`}`;
}

/** Dezelfde bedrijfsdag in Amsterdam (ongedaan maken kan alleen dan). */
export function zelfdeBedrijfsdag(a: string | Date, b: string | Date): boolean {
    const x = inAmsterdam(a);
    const y = inAmsterdam(b);
    return !!x && !!y && x.datum === y.datum;
}

/* ── De twee dingen die een scherm vraagt ────────────────────────────────── */

/** "Zet 4 × Naober apart voor HB-2026-1042 (Jansen, za)" — voor Vandaag, het paneel en de Toonbank. */
export function taakTekst(taak: WegzetTaak): string {
    const wat = opsomming(wegzetProducten(taak).map(productKort));
    const dag = dagKort(taak.afhaalmoment);
    const wie = [taak.naam.trim(), dag].filter(Boolean).join(', ');
    return `Zet ${wat || 'de bestelling'} apart voor ${taak.nummer}${wie ? ` (${wie})` : ''}`;
}

/** Rood = ophalen binnen 24 uur, of al voorbij. Zonder moment: wat de database zei. */
export function isRood(taak: Pick<WegzetTaak, 'afhaalmoment' | 'ophalen_binnen_24u'>, nu: Date): boolean {
    if (!taak.afhaalmoment) return taak.ophalen_binnen_24u;
    const t = new Date(taak.afhaalmoment).getTime();
    if (Number.isNaN(t)) return taak.ophalen_binnen_24u;
    return t - nu.getTime() <= DAG_MS;
}

/* ── Vandaag apart gezet: wat nog terug kan ──────────────────────────────── */

/** Een order die vandaag apart is gezet en nog terug kan: dezelfde bedrijfsdag, niet opgehaald. */
export interface ApartGezet {
    order_id: number;
    nummer: string;
    naam: string;
    /** Het vroegste vinkje van de wegzet-regels. */
    apart_gezet_at: string;
    regels: { regel_id: number; artikel: string; aantal: number }[];
}

interface OrderMetRegels {
    id: number;
    nummer: string;
    contact_naam: string;
    status: string;
    winkel_order_regels: readonly { id: number; artikel_id: string; naam: string; aantal: number; klaargezet_at: string | null; opgehaald_at?: string | null }[];
}

/**
 * De orders die winkel_zet_order_apart_terug nu nog zou terugdraaien: betaald,
 * met wegzet-regels die apart staan, niets opgehaald, en apart gezet op de
 * bedrijfsdag van `nu`. Nieuwste eerst.
 */
export function vandaagApartGezet(orders: readonly OrderMetRegels[], wegzetArtikelIds: ReadonlySet<string>, nu: Date): ApartGezet[] {
    const uit: ApartGezet[] = [];
    for (const o of orders) {
        if (o.status !== 'betaald') continue;
        const wegzet = o.winkel_order_regels.filter((r) => wegzetArtikelIds.has(r.artikel_id));
        if (wegzet.some((r) => r.opgehaald_at)) continue;
        const apart = wegzet.filter((r) => r.klaargezet_at);
        if (apart.length === 0) continue;
        const eerste = apart.map((r) => r.klaargezet_at!).reduce((a, b) => (new Date(b) < new Date(a) ? b : a));
        if (!zelfdeBedrijfsdag(eerste, nu)) continue;
        uit.push({
            order_id: o.id, nummer: o.nummer, naam: o.contact_naam, apart_gezet_at: eerste,
            regels: apart.map((r) => ({ regel_id: r.id, artikel: r.naam, aantal: r.aantal })),
        });
    }
    return uit.sort((a, b) => new Date(b.apart_gezet_at).getTime() - new Date(a.apart_gezet_at).getTime());
}

/* ── Ligt er genoeg? (dezelfde regel als winkel_zet_order_apart) ─────────── */

export interface Tekort {
    product_id: string;
    naam: string;
    ligt_er: number;
    nodig: number;
}

/**
 * Wat het schap tekortkomt om deze componenten apart te zetten. Alleen
 * bijgehouden producten tellen: een product zonder voorraadgetal (null)
 * blokkeert nooit. Leeg = er ligt genoeg.
 */
export function tekortenVoorApart(
    componenten: { product_id: string | null; hoeveelheid: number }[],
    producten: { id: string; naam: string; voorraad: number | null }[],
): Tekort[] {
    const nodig = new Map<string, number>();
    for (const c of componenten) if (c.product_id) nodig.set(c.product_id, rond((nodig.get(c.product_id) ?? 0) + c.hoeveelheid));
    const uit: Tekort[] = [];
    for (const [id, n] of nodig) {
        const p = producten.find((x) => x.id === id);
        if (!p || p.voorraad == null || p.voorraad >= n) continue;
        uit.push({ product_id: id, naam: p.naam, ligt_er: p.voorraad, nodig: n });
    }
    return uit.sort((a, b) => a.naam.localeCompare(b.naam, 'nl') || a.product_id.localeCompare(b.product_id));
}

/** "Naober: er liggen er 3, deze order vraagt er 4" — één zin per tekort. */
export function tekortTekst(tekorten: Pick<Tekort, 'naam' | 'ligt_er' | 'nodig'>[]): string {
    return tekorten
        .map((t) => `${t.naam}: er ${t.ligt_er === 1 ? 'ligt er' : 'liggen er'} ${fmt(t.ligt_er)}, deze order vraagt er ${fmt(t.nodig)}`)
        .join('; ');
}

const fmt = (n: number) => n.toLocaleString('nl-NL', { maximumFractionDigits: 2 });

function rond(n: number): number {
    return Math.round(n * 1000) / 1000;
}
