/* Types voor /archief — gedeeld tussen server-component en client-componenten. */

export interface ArchiefBon {
    id: number;
    winkel: string | null;
    datum: string | null;
    totaal_bedrag: number | null;
    image_url: string | null;
    status: string | null;
    categorie: string | null;
    btw_pct: number | null;
    tags: string[] | null;
    leverancier_id: number | null;
    notities: string | null;
    created_at: string | null;
}

export interface ArchiefFilters {
    q?: string;
    from?: string;       // YYYY-MM-DD
    to?: string;         // YYYY-MM-DD
    leverancier_id?: number;
    status?: string;
    tags?: string[];
}
