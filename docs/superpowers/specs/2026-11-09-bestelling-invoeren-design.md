# Bestelling invoeren — ontwerp

**Datum:** 9 november 2026 · **Aanleiding:** Nienke mailde voor Kerst: een Kerst-Box voor 2 met het vlees in ovenschaaltjes, plus een kerstavonddiner op maat. Zo'n bestelling kon niet in het systeem, want bestellingen kwamen alleen via de website binnen.

**Mathijs:** "Ik vul letterlijk alleen maar balkjes in … dan komt het systeem eraan met een uitgewerkt pakket." En: "Als ik ga koken, moet ik weten wat ik allemaal moet doen, niet dat ik alles zelf na moet lopen."

## Kernding

**Bestelling.** Een zelf ingevoerde bestelling is een gewone webshoporder (`winkel_orders`). Hij komt in dezelfde vakjes, op dezelfde agenda-afspraak, in dezelfde productietelling en in dezelfde afhaallijst van de kassa als een websitebestelling. Er komt geen tweede bestelmodel bij.

## Wat Mathijs invult

- **Klant:** naam, e-mail, telefoon. Is er een aanvraag of klant met precies hetzelfde e-mailadres, dan wordt de bestelling daaraan gekoppeld. Bij twijfel wordt er niets gekoppeld.
- **Hoe binnengekomen:** mail, telefoon, balie of anders.
- **Afhaaldag**, voor elke datum (ook april), en een **tijd** als die er is.
- **Regels:**
  - een product uit het eigen assortiment (Kerst-Box, borrelplank, …): de catalogusprijs staat er al, en Mathijs kan die per bestelling aanpassen;
  - een **regel op maat**: een eigen naam, een toelichting ("en dit en dit"), het aantal, de prijs en de btw. De prijs mag leeg blijven: dan staat er **prijs volgt**.
- **Let op:** het aantal vegetariërs, de allergenen en de harde regels ("geen olijven"). Alles daarvan krijgt overal een **!**.
- **Opmerking:** vrije tekst.
- **Vinkje "afrekenen in de kassa":**
  - aan: de kassa vraagt bij het afhalen het hele bedrag (net als de Kerst-Box van de website);
  - uit: de kassa vraagt niets, want het gaat via een factuur of is al betaald.

  De bestelling staat in beide gevallen op de afhaaldag in de afhaallijst, zodat hij als opgehaald kan worden afgevinkt.

Er gaat **nooit een mail naar de klant**. De app verzint **geen prijzen**.

## Wat het systeem daarmee doet

1. Het maakt de order aan (sleutel `handmatig-<uuid>`, zodat dubbelklikken geen tweede order geeft) en zet hem op betaald voor het online deel, dat hier nul is. Zo telt hij overal mee.
2. Het zet hem op de afhaaldag in de agenda. Een product met vaste afhaaldagen, zoals de Kerst-Box, gaat in het vakje van die dag, zodat hij meetelt in het Kerst-overzicht. De rest gaat in een eigen moment in de groep `op-maat`, die de website nooit toont.
3. Op de agenda-afspraak komt per order één regel, met de **!**-punten voorop.
4. **Een week van tevoren** staat de bestelling op Vandaag: "Over 5 dagen: Nienke — 2× Kerst-Box + diner op maat ! allergie". Staat er een regel op "prijs volgt", dan zegt die taak dat ook.
5. Een regel op "prijs volgt" kan later een prijs krijgen. Het totaal en het bedrag voor de kassa worden dan opnieuw uitgerekend.

## Hoe het in de database komt

- `winkel_orders.bron`: `website` (leeg = website, alle bestaande orders), `mail`, `telefoon`, `balie` of `anders`.
- `winkel_order_regels.prijs_volgt` en `toelichting`.
- Regels op maat hangen aan een verborgen artikel `op-maat` per organisatie: actief, maar niet publiek en niet op de Toonbank. De regel zelf draagt de naam, de prijs en de btw. Zo werken de bestaande databasefuncties ongewijzigd.

## Bewust nog niet

- **Kassa toont 3 dagen vooruit, met zoeken op naam:** stuk 2, in de Toonbank.
- **Vooruitkijken per week of maand in de agenda:** stuk 3.
- **Etiket met !-punten:** de etiketten van de webshop worden op de Zebra gedrukt. Dit komt mee als het label er ruimte voor heeft; anders apart.
- **Capaciteit:** een zelf ingevoerde plank telt niet mee voor de grens van een webmoment op dezelfde dag. Mathijs kiest zelf of het past.

## Calls van Claude (niet door Mathijs beslist)

- Plek van de knop: Webshop → Vakjes, plus een snelkoppeling op Kerst → Bestellingen.
- Vinkje uit = de kassa vraagt geen geld. De order staat wel op de afhaallijst.
- Het weekseintje komt voorlopig alleen voor zelf ingevoerde bestellingen.
