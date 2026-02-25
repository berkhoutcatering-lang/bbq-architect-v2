// Format number as Euro currency
export function fmt(n) {
    if (n == null || isNaN(n)) return '€ 0,00';
    return '€ ' + Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// HTML escape
export function escH(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ISO date to NL format
export function fmtNl(d) {
    if (!d) return '';
    var parts = d.split('-');
    if (parts.length !== 3) return d;
    return parts[2] + '-' + parts[1] + '-' + parts[0];
}

// Today as ISO string
export function today() {
    return new Date().toISOString().slice(0, 10);
}

// Add days to ISO date string
export function addDays(dateStr, days) {
    var d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

// Calculate line totals
export function calcLineTotals(items) {
    var subtotaal = 0;
    (items || []).forEach(function (item) {
        subtotaal += (item.qty || 0) * (item.prijs || 0);
    });
    var btwBedrag = 0;
    (items || []).forEach(function (item) {
        var lineTotal = (item.qty || 0) * (item.prijs || 0);
        btwBedrag += lineTotal * ((item.btw || 0) / 100);
    });
    return { subtotaal: subtotaal, btw: btwBedrag, totaal: subtotaal + btwBedrag };
}

// Month names in Dutch
export var MAANDEN = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'];
export var MAANDEN_KORT = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
export var DAGEN = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];

// Generate invoice/quote number
export function genNummer(prefix, nr) {
    return prefix + String(nr).padStart(3, '0');
}
