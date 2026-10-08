/**
 * De Kerst-Box-mails, letterlijk overgenomen uit de website-repo
 * (hop-en-bites-website/mail-sjablonen/, 5 oktober 2026). Niet hier aan de
 * woorden zitten: wijzigingen gaan via Mathijs en daarna in beide repo's.
 *
 * Velden: {{voornaam}} {{nummer}} {{personen}} {{vegetarisch}} {{afhaaldag}} {{totaal}}.
 * Invullen doet kerstMail.ts.
 */

export const KERSTBOX_ONTVANGEN = `<!doctype html>
<html lang="nl" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>Je Kerst-Box-bestelling staat vast</title>
<!--
  Hop & Bites · mail 1 van 2: de bevestiging, meteen na het formulier. Er komt geen tweede bevestiging.
  Velden die BBQ Architect invult: {{voornaam}} {{nummer}} {{personen}} {{vegetarisch}} {{afhaaldag}} {{totaal}}
  {{afhaaldag}} voluit: "donderdag 24 december". {{totaal}} met euroteken: "€ 141,00".
  Is {{vegetarisch}} 0, laat dan de hele rij "Waarvan vegetarisch" weg.
  Big Shoulders laadt alleen in Apple Mail en iOS; elders valt hij terug op Arial Narrow / Arial. Newsreader valt terug op Georgia.
-->
<link href="https://fonts.googleapis.com/css2?family=Big+Shoulders:wght@700;800&family=Newsreader:ital,wght@0,400;1,400&display=swap" rel="stylesheet">
<style>
  body { margin: 0; padding: 0; background: #141311; }
  a { color: #F5F1E7; }
  @media (max-width: 620px) {
    .binnen { padding-left: 24px !important; padding-right: 24px !important; }
    .kop { font-size: 38px !important; }
  }
</style>
</head>
<body style="margin: 0; padding: 0; background: #141311;">
<div style="display: none; max-height: 0; overflow: hidden; color: #141311;">Kerst-Box voor {{personen}} personen, afhalen {{afhaaldag}}. Je betaalt bij het afhalen.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #141311;">
  <tr>
    <td align="center" style="padding: 24px 12px 40px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 600px; background: #141311;">

        <!-- het deelbeeld: het logo en de getekende doos -->
        <tr>
          <td style="padding: 0;">
            <img src="https://hopbites.nl/kerst/deelbeeld.png" width="600" alt="Hop &amp; Bites · Kerst-Box 2026" style="display: block; width: 100%; max-width: 600px; height: auto; border: 0;">
          </td>
        </tr>

        <tr>
          <td class="binnen" style="padding: 40px 48px 0; font-family: Newsreader, Georgia, 'Times New Roman', serif; color: rgba(245,241,231,0.86); font-size: 18px; line-height: 1.55;">
            <!-- label met het streepje -->
            <div style="width: 40px; height: 2px; background: #A47B2C; font-size: 0; line-height: 0;">&nbsp;</div>
            <p style="margin: 14px 0 0; font-family: 'Big Shoulders', 'Arial Narrow', Arial, sans-serif; font-weight: 700; font-size: 14px; letter-spacing: 3px; text-transform: uppercase; color: #D3AE62;">Kerst-Box 2026 · bestelling {{nummer}}</p>
            <h1 class="kop" style="margin: 14px 0 0; font-family: 'Big Shoulders', 'Arial Narrow', Arial, sans-serif; font-weight: 800; font-size: 46px; line-height: 0.95; letter-spacing: 0.5px; text-transform: uppercase; color: #F5F1E7;">Je bestelling is binnen, {{voornaam}}.</h1>
            <p style="margin: 22px 0 0;">Dank je. Je bestelling staat vast: we zien je {{afhaaldag}} in onze winkel.</p>
          </td>
        </tr>

        <!-- de bon -->
        <tr>
          <td class="binnen" style="padding: 32px 48px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top: 1px solid #A47B2C; font-family: Newsreader, Georgia, 'Times New Roman', serif; font-size: 17px; line-height: 1.4; color: #F5F1E7;">
              <tr>
                <td style="padding: 14px 0; border-bottom: 1px solid rgba(245,241,231,0.12); width: 42%; font-family: 'Big Shoulders', 'Arial Narrow', Arial, sans-serif; font-weight: 700; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: #D3AE62; vertical-align: top;">Wat</td>
                <td style="padding: 14px 0; border-bottom: 1px solid rgba(245,241,231,0.12); vertical-align: top;">Kerst-Box voor {{personen}} personen</td>
              </tr>
              <tr>
                <td style="padding: 14px 0; border-bottom: 1px solid rgba(245,241,231,0.12); font-family: 'Big Shoulders', 'Arial Narrow', Arial, sans-serif; font-weight: 700; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: #D3AE62; vertical-align: top;">Waarvan vegetarisch</td>
                <td style="padding: 14px 0; border-bottom: 1px solid rgba(245,241,231,0.12); vertical-align: top;">{{vegetarisch}}</td>
              </tr>
              <tr>
                <td style="padding: 14px 0; border-bottom: 1px solid rgba(245,241,231,0.12); font-family: 'Big Shoulders', 'Arial Narrow', Arial, sans-serif; font-weight: 700; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: #D3AE62; vertical-align: top;">Afhalen</td>
                <td style="padding: 14px 0; border-bottom: 1px solid rgba(245,241,231,0.12); vertical-align: top;">{{afhaaldag}}, tussen 10:00 en 18:00</td>
              </tr>
              <tr>
                <td style="padding: 14px 0; border-bottom: 1px solid rgba(245,241,231,0.12); font-family: 'Big Shoulders', 'Arial Narrow', Arial, sans-serif; font-weight: 700; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: #D3AE62; vertical-align: top;">Waar</td>
                <td style="padding: 14px 0; border-bottom: 1px solid rgba(245,241,231,0.12); vertical-align: top;">Tramstraat 13, Schoonoord</td>
              </tr>
              <tr>
                <td style="padding: 14px 0; border-bottom: 1px solid rgba(245,241,231,0.12); font-family: 'Big Shoulders', 'Arial Narrow', Arial, sans-serif; font-weight: 700; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: #D3AE62; vertical-align: middle;">Totaal</td>
                <td style="padding: 12px 0; border-bottom: 1px solid rgba(245,241,231,0.12); vertical-align: middle;"><span style="font-family: 'Big Shoulders', 'Arial Narrow', Arial, sans-serif; font-weight: 800; font-size: 26px; color: #D3AE62;">{{totaal}}</span></td>
              </tr>
              <tr>
                <td style="padding: 14px 0; border-bottom: 1px solid rgba(245,241,231,0.12); font-family: 'Big Shoulders', 'Arial Narrow', Arial, sans-serif; font-weight: 700; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: #D3AE62; vertical-align: top;">Betalen</td>
                <td style="padding: 14px 0; border-bottom: 1px solid rgba(245,241,231,0.12); vertical-align: top;">Bij het afhalen, met pin of contant</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- de gouden knop -->
        <tr>
          <td class="binnen" style="padding: 36px 48px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background: #D3AE62; border-radius: 2px;">
                  <a href="https://hopbites.nl/kerst" style="display: inline-block; padding: 16px 28px; font-family: 'Big Shoulders', 'Arial Narrow', Arial, sans-serif; font-weight: 700; font-size: 15px; letter-spacing: 2px; text-transform: uppercase; color: #141311; text-decoration: none;">Kijk nog eens in de box</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- wijzigen, ondertekening -->
        <tr>
          <td class="binnen" style="padding: 36px 48px 0; font-family: Newsreader, Georgia, 'Times New Roman', serif; font-size: 17px; line-height: 1.55; color: rgba(245,241,231,0.86);">
            <p style="margin: 0;">Iets wijzigen of annuleren? Bel <a href="tel:+31613734453" style="color: #F5F1E7; text-decoration: underline;">06 13 73 44 53</a> of mail <a href="mailto:info@hopbites.nl" style="color: #F5F1E7; text-decoration: underline;">info@hopbites.nl</a>.</p>
            <p style="margin: 28px 0 0; font-style: italic; color: #F5F1E7;"><span style="color: #A47B2C;">——</span>&nbsp; Mathijs Berkhout · chef en eigenaar</p>
          </td>
        </tr>

        <!-- voet -->
        <tr>
          <td class="binnen" style="padding: 44px 48px 0;">
            <div style="height: 1px; background: rgba(245,241,231,0.12); font-size: 0; line-height: 0;">&nbsp;</div>
            <p style="margin: 18px 0 0; font-family: 'Big Shoulders', 'Arial Narrow', Arial, sans-serif; font-weight: 700; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: rgba(245,241,231,0.66); line-height: 1.7;">Hop &amp; Bites · Ambacht voor thuis<br>Tramstraat 13 · 7848 BG Schoonoord · KvK 80189458</p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>
`;

export const KERSTBOX_HERINNERING = `<!doctype html>
<html lang="nl" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>Morgen staat je Kerst-Box klaar</title>
<!--
  Hop & Bites · mail 2 van 2: de herinnering, de dag vóór de afhaaldag om 10:00. Niet voor bestellingen die al opgehaald of geannuleerd zijn.
  Velden die BBQ Architect invult: {{voornaam}} {{nummer}} {{personen}} {{vegetarisch}} {{afhaaldag}} {{totaal}}
  {{afhaaldag}} voluit: "donderdag 24 december". {{totaal}} met euroteken: "€ 141,00".
  Is {{vegetarisch}} 0, laat dan de hele rij "Waarvan vegetarisch" weg.
  Big Shoulders laadt alleen in Apple Mail en iOS; elders valt hij terug op Arial Narrow / Arial. Newsreader valt terug op Georgia.
-->
<link href="https://fonts.googleapis.com/css2?family=Big+Shoulders:wght@700;800&family=Newsreader:ital,wght@0,400;1,400&display=swap" rel="stylesheet">
<style>
  body { margin: 0; padding: 0; background: #141311; }
  a { color: #F5F1E7; }
  @media (max-width: 620px) {
    .binnen { padding-left: 24px !important; padding-right: 24px !important; }
    .kop { font-size: 38px !important; }
  }
</style>
</head>
<body style="margin: 0; padding: 0; background: #141311;">
<div style="display: none; max-height: 0; overflow: hidden; color: #141311;">Morgen staat je Kerst-Box klaar, tussen 10:00 en 18:00 in onze winkel.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #141311;">
  <tr>
    <td align="center" style="padding: 24px 12px 40px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 600px; background: #141311;">

        <!-- het deelbeeld: het logo en de getekende doos -->
        <tr>
          <td style="padding: 0;">
            <img src="https://hopbites.nl/kerst/deelbeeld.png" width="600" alt="Hop &amp; Bites · Kerst-Box 2026" style="display: block; width: 100%; max-width: 600px; height: auto; border: 0;">
          </td>
        </tr>

        <tr>
          <td class="binnen" style="padding: 40px 48px 0; font-family: Newsreader, Georgia, 'Times New Roman', serif; color: rgba(245,241,231,0.86); font-size: 18px; line-height: 1.55;">
            <!-- label met het streepje -->
            <div style="width: 40px; height: 2px; background: #A47B2C; font-size: 0; line-height: 0;">&nbsp;</div>
            <p style="margin: 14px 0 0; font-family: 'Big Shoulders', 'Arial Narrow', Arial, sans-serif; font-weight: 700; font-size: 14px; letter-spacing: 3px; text-transform: uppercase; color: #D3AE62;">Kerst-Box 2026 · morgen afhalen · {{nummer}}</p>
            <h1 class="kop" style="margin: 14px 0 0; font-family: 'Big Shoulders', 'Arial Narrow', Arial, sans-serif; font-weight: 800; font-size: 46px; line-height: 0.95; letter-spacing: 0.5px; text-transform: uppercase; color: #F5F1E7;">Morgen staat hij klaar, {{voornaam}}.</h1>
            <p style="margin: 22px 0 0;">Je haalt je Kerst-Box {{afhaaldag}} op in onze winkel, tussen 10:00 en 18:00. Betalen kan met pin of contant.</p>
          </td>
        </tr>

        <!-- de bon -->
        <tr>
          <td class="binnen" style="padding: 32px 48px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top: 1px solid #A47B2C; font-family: Newsreader, Georgia, 'Times New Roman', serif; font-size: 17px; line-height: 1.4; color: #F5F1E7;">
              <tr>
                <td style="padding: 14px 0; border-bottom: 1px solid rgba(245,241,231,0.12); width: 42%; font-family: 'Big Shoulders', 'Arial Narrow', Arial, sans-serif; font-weight: 700; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: #D3AE62; vertical-align: top;">Wat</td>
                <td style="padding: 14px 0; border-bottom: 1px solid rgba(245,241,231,0.12); vertical-align: top;">Kerst-Box voor {{personen}} personen</td>
              </tr>
              <tr>
                <td style="padding: 14px 0; border-bottom: 1px solid rgba(245,241,231,0.12); font-family: 'Big Shoulders', 'Arial Narrow', Arial, sans-serif; font-weight: 700; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: #D3AE62; vertical-align: top;">Waarvan vegetarisch</td>
                <td style="padding: 14px 0; border-bottom: 1px solid rgba(245,241,231,0.12); vertical-align: top;">{{vegetarisch}}</td>
              </tr>
              <tr>
                <td style="padding: 14px 0; border-bottom: 1px solid rgba(245,241,231,0.12); font-family: 'Big Shoulders', 'Arial Narrow', Arial, sans-serif; font-weight: 700; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: #D3AE62; vertical-align: top;">Afhalen</td>
                <td style="padding: 14px 0; border-bottom: 1px solid rgba(245,241,231,0.12); vertical-align: top;">{{afhaaldag}}, tussen 10:00 en 18:00</td>
              </tr>
              <tr>
                <td style="padding: 14px 0; border-bottom: 1px solid rgba(245,241,231,0.12); font-family: 'Big Shoulders', 'Arial Narrow', Arial, sans-serif; font-weight: 700; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: #D3AE62; vertical-align: top;">Waar</td>
                <td style="padding: 14px 0; border-bottom: 1px solid rgba(245,241,231,0.12); vertical-align: top;">Tramstraat 13, Schoonoord</td>
              </tr>
              <tr>
                <td style="padding: 14px 0; border-bottom: 1px solid rgba(245,241,231,0.12); font-family: 'Big Shoulders', 'Arial Narrow', Arial, sans-serif; font-weight: 700; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: #D3AE62; vertical-align: middle;">Totaal</td>
                <td style="padding: 12px 0; border-bottom: 1px solid rgba(245,241,231,0.12); vertical-align: middle;"><span style="font-family: 'Big Shoulders', 'Arial Narrow', Arial, sans-serif; font-weight: 800; font-size: 26px; color: #D3AE62;">{{totaal}}</span></td>
              </tr>
              <tr>
                <td style="padding: 14px 0; border-bottom: 1px solid rgba(245,241,231,0.12); font-family: 'Big Shoulders', 'Arial Narrow', Arial, sans-serif; font-weight: 700; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: #D3AE62; vertical-align: top;">Betalen</td>
                <td style="padding: 14px 0; border-bottom: 1px solid rgba(245,241,231,0.12); vertical-align: top;">Bij het afhalen, met pin of contant</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- thuis -->
        <tr>
          <td class="binnen" style="padding: 36px 48px 0; font-family: Newsreader, Georgia, 'Times New Roman', serif; font-size: 17px; line-height: 1.55; color: rgba(245,241,231,0.86);">
            <p style="margin: 0; font-family: 'Big Shoulders', 'Arial Narrow', Arial, sans-serif; font-weight: 700; font-size: 14px; letter-spacing: 3px; text-transform: uppercase; color: #D3AE62;">Thuis</p>
            <p style="margin: 10px 0 0;">Zet je gourmetstel op tafel en bak alles kort af, voor de korst. Op de doos zit een QR-code: die opent de app, met bij elk stuk vlees een frisse of een umami-route en wat je erbij op tafel zet.</p>
            <p style="margin: 12px 0 0;">Geen gourmetstel? Een grillplaat of koekenpan werkt ook.</p>
          </td>
        </tr>

        <!-- de gouden knop -->
        <tr>
          <td class="binnen" style="padding: 36px 48px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background: #D3AE62; border-radius: 2px;">
                  <a href="https://hopbites.nl/kerst" style="display: inline-block; padding: 16px 28px; font-family: 'Big Shoulders', 'Arial Narrow', Arial, sans-serif; font-weight: 700; font-size: 15px; letter-spacing: 2px; text-transform: uppercase; color: #141311; text-decoration: none;">Kijk nog eens in de box</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- wijzigen, ondertekening -->
        <tr>
          <td class="binnen" style="padding: 36px 48px 0; font-family: Newsreader, Georgia, 'Times New Roman', serif; font-size: 17px; line-height: 1.55; color: rgba(245,241,231,0.86);">
            <p style="margin: 0;">Lukt het morgen niet? Bel <a href="tel:+31613734453" style="color: #F5F1E7; text-decoration: underline;">06 13 73 44 53</a> of mail <a href="mailto:info@hopbites.nl" style="color: #F5F1E7; text-decoration: underline;">info@hopbites.nl</a>, dan zoeken we samen een oplossing.</p>
            <p style="margin: 28px 0 0; font-style: italic; color: #F5F1E7;"><span style="color: #A47B2C;">——</span>&nbsp; Mathijs Berkhout · chef en eigenaar</p>
          </td>
        </tr>

        <!-- voet -->
        <tr>
          <td class="binnen" style="padding: 44px 48px 0;">
            <div style="height: 1px; background: rgba(245,241,231,0.12); font-size: 0; line-height: 0;">&nbsp;</div>
            <p style="margin: 18px 0 0; font-family: 'Big Shoulders', 'Arial Narrow', Arial, sans-serif; font-weight: 700; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: rgba(245,241,231,0.66); line-height: 1.7;">Hop &amp; Bites · Ambacht voor thuis<br>Tramstraat 13 · 7848 BG Schoonoord · KvK 80189458</p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>
`;
