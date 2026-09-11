/**
 * Geen mail zonder token.
 * Plan: docs/bestelstroom-bouwplan.md §3 en §9.
 *
 * De bevestigingsmail bevat de persoonlijke link naar de doospagina. Die link
 * bestaat pas als de koppeling met de Experience-app geslaagd is. Gaat de mail
 * eerder de deur uit, dan heeft de klant een dode link in zijn inbox — en die
 * mail is de plek waar hij hem bewaart voor als het deksel wegraakt.
 *
 * Drie pogingen van tien seconden dekken een hapering af. Een echte storing
 * hoort dan een zichtbare handeling in de hub te worden ("wacht op koppeling"
 * én "mail niet verstuurd"), niet een lege link bij de klant.
 *
 * Deze functie is de poort. Hij staat los van het versturen zelf, zodat de
 * regel te testen is zonder dat er een mail bestaat — en zodat er straks maar
 * één plek is die hem kan overtreden.
 */

export interface MailPoortInvoer {
    status: string;
    koppel_status: string;
    experience_token: string | null;
    mail_status: string;
    email?: string | null;
}

export interface MailOordeel {
    mag: boolean;
    /** Machineleesbaar, zodat de hub er iets mee kan zonder tekst te ontleden. */
    reden: 'mag_verstuurd'
        | 'geen_token'
        | 'al_verstuurd'
        | 'geannuleerd'
        | 'geen_adres';
    /** Voor de operator in de hub. */
    uitleg: string;
}

export function magMailVerstuurd(b: MailPoortInvoer): MailOordeel {
    if (b.status === 'geannuleerd') {
        return { mag: false, reden: 'geannuleerd', uitleg: 'Deze bestelling is geannuleerd.' };
    }
    if (b.mail_status === 'verstuurd') {
        return { mag: false, reden: 'al_verstuurd', uitleg: 'De bevestiging is al verstuurd.' };
    }
    if (!b.email) {
        return { mag: false, reden: 'geen_adres', uitleg: 'Deze bestelling heeft geen e-mailadres.' };
    }

    /* De kern. Er wordt op het TOKEN gecontroleerd en niet alleen op
       koppel_status: die twee horen gelijk te lopen, maar als ze ooit uit elkaar
       lopen is het token de waarheid — dat is wat er in de link staat. */
    if (!b.experience_token || b.koppel_status !== 'gekoppeld') {
        return {
            mag: false,
            reden: 'geen_token',
            uitleg: 'De mail wacht op de koppeling — hij bevat de persoonlijke link.',
        };
    }

    return { mag: true, reden: 'mag_verstuurd', uitleg: 'Klaar om te versturen.' };
}
