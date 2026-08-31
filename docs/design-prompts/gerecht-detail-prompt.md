# Claude Design-prompt — Gerecht/component-detailpagina ("het boek")

> Versie 2 — aangepast nadat Claude Design het designsysteem en het Gerechten-lijstscherm
> al had gebouwd. Plak alles onder de streep als vervolgbericht in dezelfde sessie.

---

Bouw nu het detailscherm van één gerecht/component, in het designsysteem dat je zojuist hebt gemaakt. Gebruik dezelfde tokens, componenten en lade-patronen — niets nieuws verzinnen.

Dit is het scherm achter een rij in de Gerechten-lijst. Vandaag is dat in de echte app een dunne kostprijspagina: live kostprijs, ingrediënt-opbouw, componenten-editor. Functioneel prima, maar statisch — een stapel blokken die niets doet.

Het moet **het boek** worden: elk gerecht is een herbruikbare bouwsteen met een volledig bekend profiel, zoals Gastronomixs maar dan met de eigen kostprijzen, machines en leveranciers eraan gekoppeld. Dit is het scherm waar de kok naar kijkt om te beslissen of hij deze component in een nieuw gerecht gebruikt.

Neem als voorbeeld **Texas-style Brisket** — het signatuurgerecht: 10 porties, 12 uur preptijd, smoker op 110°C tot kerntemperatuur 95°C, daarna een uur rusten in folie.

## Wat er op moet

**Kop** — naam, foto, status (`voorstel` / `getest` / `vrijgegeven`), en meteen de drie cijfers die ertoe doen: kostprijs per portie, aandeel in de menuprijs, aantal handelingen per portie. Geen marge per gerecht — dat is een signaal, geen oordeel; marge hoort op menuniveau.

**Smaakprofiel** — zes assen: zoet, zuur, bitter, umami, zout, vetgevoel. Dit is de kern en moet in één oogopslag leesbaar zijn, als visualisatie en niet als tabel met getallen. Daarnaast smaakpalet als trefwoorden (rokerig, vlezig, komijn) en smaakregister (Amerikaans-BBQ, mediterraan, Mexicaans).

**Structuur & rol** — eindtextuur (luchtig, romig, krokant, plakkerig, vezelig, vast), serveertemperatuur, en de luidheid: hoofdrol, ondersteunend, accent of correctie. Precies één component in een gerecht mag hoofdrol zijn.

**Balans-oordeel** — zit dit binnen het zoutvenster (0,8–1,2% van het totaalgewicht)? Binnen de eigen huisbalans? Zo niet: wat eraan te doen is, uit een vaste correctietabel ("te zoet → zuur, zout of bitter erbij"). Dit is een uitkomst, geen invoerveld.

**Bereiding** — de stappen in volgorde, elk met handtijd, wachttijd, of er toezicht nodig is, welk station, en waar het gebeurt: **thuis, in de bus of op locatie**. Dat laatste onderscheid is essentieel — voorbereiden en afwerken zijn twee verschillende budgetten. Toon de optelsom van beide apart.

**Techniek & machine** — welke techniek dit is (roken, schuim, gel, karamel, crumble), welk apparaat nodig is, en welke machine het sneller of gelijkmatiger maakt. Plus standtijd op de uitgifte en of het de busrit overleeft.

**Kosten** — kostprijs per ingrediënt, opgeteld tot de portieprijs. Elk ingrediënt met leverancier en of het nú bestelbaar is. Een ingrediënt dat niet te bestellen is, moet opvallen.

**Allergenen** — afgeleid uit de ingrediënten, nooit met de hand ingevoerd. Laat zichtbaar zijn dát het afgeleid is.

**Het boek-verband** — in welke gerechten en menu's komt deze component terug, en welke componenten combineren er goed mee.

## Wat "moderner" hier betekent

Niet meer chrome, maar beweging en directheid:

- Waarden lopen live mee wanneer je aan het aantal gasten of een hoeveelheid draait — geen opslaan-dan-herladen.
- Uitklappen, sorteren en filteren voelen vloeiend, niet als een paginasprong.
- Bewerken gebeurt in de rechter-lade, nooit in een gecentreerde modal.
- Eén primaire actie in beeld, de rest onder een menu.
- Een blok zonder data verdwijnt in plaats van leeg te pronken.
- Elk getal telt ergens naartoe. Een stat die nergens toe leidt hoort er niet.

## Randvoorwaarden

- Nederlands, in mensentaal. Geen jargon.
- Werkt op telefoon (staand, in de keuken) én op breed scherm. De telefoon is niet de bijzaak.
- Bedragen in euro's met een komma.
- Donkere én lichte variant.
- Laat ook de lege staat zien: een component die net is aangemaakt en nog geen profiel heeft.
