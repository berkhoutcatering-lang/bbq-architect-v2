/** Kolomlijsten voor de labelprinter-tabellen — één plek, zodat routes en pagina's hetzelfde teruggeven. */

export const PRINTER_KOLOMMEN =
    'id, naam, transport, device_uid, model, dpi, label_breedte_mm, label_hoogte_mm, actief, laatst_gezien_at, laatste_status, created_at, updated_at';

/** Zonder `zpl`: die kan tienduizenden tekens zijn en hoort niet in een lijst. */
export const JOB_KOLOMMEN =
    'id, soort, partij_id, eenheid_ids, template_code, template_versie, printer_id, transport, aantal_labels, status, geprint_eenheid_ids, onzeker_eenheid_ids, geprint_aantal, foutmelding, printer_status, label_data, by_user_id, device_naam, created_at, sent_at, finished_at';
