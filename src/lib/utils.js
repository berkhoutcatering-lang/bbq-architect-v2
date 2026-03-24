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

// Safe JSON Parse
export function safeJsonParse(val, fallback = {}) {
    if (!val) return fallback;
    if (typeof val !== 'string') return val;
    try { return JSON.parse(val); } catch (e) { return fallback; }
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

// Resize image to max dimensions to avoid API limits and 'expected pattern' errors
export function resizeImage(base64Str, maxWidth = 1200, maxHeight = 1200, quality = 0.8) {
    return new Promise(function (resolve) {
        var img = new Image();
        img.src = base64Str;
        img.onload = function () {
            var canvas = document.createElement('canvas');
            var width = img.width;
            var height = img.height;

            if (width > height) {
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width *= maxHeight / height;
                    height = maxHeight;
                }
            }

            canvas.width = width;
            canvas.height = height;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality)); // Dynamic quality
        };
        img.onerror = function () { resolve(base64Str); }; // Fallback
    });
}

// ── Marge Calculation Engine ──
export function calcMargeForOfferte(offerte, gerechtenData, inventoryData) {
    if (!offerte) return { omzet: 0, foodcostTotaal: 0, winst: 0, nettoWinst: 0, margePct: 0 };

    function getInv(naam) {
        if (!naam) return null;
        return (inventoryData || []).find(function (i) { return i.naam && i.naam.toLowerCase() === String(naam).toLowerCase(); });
    }

    function dishCost(name) {
        var g = (gerechtenData || []).find(function (x) { return x.naam === name; });
        if (!g || !g.ingredient_costs) return 0;
        return (g.ingredient_costs || []).reduce(function (sum, it) {
            var inv = getInv(it.naam);
            var p = inv ? inv.purchase_price : 0;
            var y = it.yield || (inv ? inv.yield_factor : 1.0) || 1.0;
            var f = 1;
            if (it.unit === 'g' && inv && inv.unit === 'kg') f = 0.001;
            if (it.unit === 'ml' && inv && inv.unit === 'L') f = 0.001;
            return sum + ((it.qty_pp || 0) * f / y) * p;
        }, 0);
    }

    var gasten = offerte.aantal_gasten || 0;
    var omzet = gasten * (offerte.basis_prijs_pp || 0);

    // Safely parse and flatten menu_selectie (which is an object grouped by gang slug, or an array)
    var parsedMenu = typeof offerte.menu_selectie === 'string' ? safeJsonParse(offerte.menu_selectie, {}) : (offerte.menu_selectie || {});
    var menuArray = [];
    if (Array.isArray(parsedMenu)) {
        menuArray = parsedMenu;
    } else if (parsedMenu && typeof parsedMenu === 'object') {
        Object.values(parsedMenu).forEach(function (arr) {
            if (Array.isArray(arr)) {
                arr.forEach(function (item) {
                    menuArray.push(typeof item === 'string' ? { naam: item } : item);
                });
            }
        });
    }

    var foodcostTotaal = menuArray.reduce(function (sum, sel) {
        return sum + dishCost(sel.gerecht_naam || sel.naam) * gasten;
    }, 0);
    var vk = (offerte.vaste_kosten || []).reduce(function (sum, k) { return sum + (parseFloat(k.bedrag) || 0); }, 0);

    var nettoWinst = omzet - foodcostTotaal - vk;
    var margePct = omzet > 0 ? (nettoWinst / omzet) * 100 : 0;

    return {
        omzet: omzet,
        foodcostTotaal: foodcostTotaal,
        winst: nettoWinst,
        nettoWinst: nettoWinst,
        margePct: margePct
    };
}

export function margeColor(pct) {
    if (pct > 70) return 'green';
    if (pct >= 60) return 'orange';
    return 'red';
}

// Normalize ingredients for DB storage
export function normalizeIngredienten(raw) {
    if (!raw) return '';
    var source = raw;
    if (typeof source === 'string') return source.split(',').map(function (s) { return s.trim(); }).filter(Boolean).join(', ');
    if (!Array.isArray(source)) return '';
    return source.map(function (i) {
        if (typeof i === 'object' && i !== null) return (i.hoeveelheid ? i.hoeveelheid + (i.eenheid ? ' ' + i.eenheid + ' ' : ' ') : '') + (i.naam || JSON.stringify(i));
        return String(i);
    }).join(', ');
}

// Normalize preparation steps for DB storage
export function normalizeBereidingswijze(data) {
    if (!data) return '';
    var raw = typeof data === 'object' ? (data.bereidingswijze || data.bereiding || data.stappenplan || data.instructies || data.preparation_steps || '') : data;
    return Array.isArray(raw) ? raw.join('\n') : String(raw || '');
}
