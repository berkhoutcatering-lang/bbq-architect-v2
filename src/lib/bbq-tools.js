// src/lib/bbq-tools.js
// Alle tool-schema's voor Groq native function calling.
// Gegroepeerd per module. Groq gebruikt OpenAI-compatible format.

export var TOOL_SCHEMAS = [

    // ══════════════════════════════════════════════════════
    // EVENTS & PLANNING
    // ══════════════════════════════════════════════════════
    {
        type: 'function',
        function: {
            name: 'getUpcomingEvents',
            description: 'Haal de aankomende catering-events op uit de agenda. Gebruik dit als de gebruiker vraagt naar planning, wat er deze/volgende week staat, of voor wie er geprept moet worden.',
            parameters: {
                type: 'object',
                properties: {
                    days_ahead: { type: 'number', description: 'Hoeveel dagen vooruit kijken (default: 14)' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getEventDetail',
            description: 'Haal de volledige details van één specifiek event op, inclusief menu, gasten, locatie en recepten.',
            parameters: {
                type: 'object',
                properties: {
                    event_id: { type: 'number', description: 'ID van het event' }
                },
                required: ['event_id']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'plan_event_full',
            description: 'PLAN EEN EVENT END-TO-END. Maak het event aan, selecteer het menu, en plan direct de afgeleide prep-taken (-3 dg, -2 dg, -1 dg) in de agenda op basis van het gekozen menu.',
            parameters: {
                type: 'object',
                properties: {
                    klant_naam: { type: 'string' },
                    datum: { type: 'string', description: 'YYYY-MM-DD' },
                    aantal_gasten: { type: 'number' },
                    menu_selectie: { type: 'array', items: { type: 'string' } },
                    notities: { type: 'string' },
                    prep_taken: {
                        type: 'array',
                        description: 'Automatisch berekende voorbereidingstaken gebaseerd op de gekozen gerechten.',
                        items: {
                            type: 'object',
                            properties: {
                                taak: { type: 'string' },
                                dagen_vooraf: { type: 'number', description: 'bv. 3 voor -3 dagen' },
                                datum_uitvoer: { type: 'string', description: 'YYYY-MM-DD (live berekend o.b.v. event datum)' },
                                context_gerecht: { type: 'string', description: 'Voor welk gerecht is deze taak?' }
                            },
                            required: ['taak', 'dagen_vooraf', 'datum_uitvoer']
                        }
                    }
                },
                required: ['klant_naam', 'datum', 'aantal_gasten', 'menu_selectie', 'prep_taken']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'createEvent',
            description: 'Maak een nieuw catering-event aan in het systeem.',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Naam van het event (bijv. "Bruiloft Familie Janssen")' },
                    date: { type: 'string', description: 'Datum in YYYY-MM-DD formaat' },
                    guests: { type: 'number', description: 'Aantal gasten' },
                    location: { type: 'string', description: 'Locatie' },
                    ppp: { type: 'number', description: 'Prijs per persoon in euro' },
                    client_naam: { type: 'string', description: 'Naam van de klant' },
                    type: { type: 'string', description: 'Type event: Particulier, Zakelijk, of Festival' }
                },
                required: ['name', 'date', 'guests']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'updateEventStatus',
            description: 'Wijzig de status van een event.',
            parameters: {
                type: 'object',
                properties: {
                    event_id: { type: 'number', description: 'ID van het event' },
                    status: { type: 'string', enum: ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'] }
                },
                required: ['event_id', 'status']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'generatePrepList',
            description: 'Genereer een volledige prep-lijst en MEP-lijst (Mise-en-place) voor een aankomend event. Kijkt naar het gekoppelde menu en de recepten in The Vault. Gebruik dit als gebruiker vraagt om een prep-schema, bereidingsplan of tijdlijn.',
            parameters: {
                type: 'object',
                properties: {
                    event_id: { type: 'number', description: 'ID van het event (optioneel, pakt het eerstvolgende als niet opgegeven)' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'generateTimeline',
            description: 'Maak een dag-voor-dag tijdlijn voor een event op basis van aantal gasten en menu.',
            parameters: {
                type: 'object',
                properties: {
                    event_id: { type: 'number', description: 'ID van het event' },
                    event_date: { type: 'string', description: 'Datum van het event (YYYY-MM-DD)' }
                },
                required: []
            }
        }
    },

    // ══════════════════════════════════════════════════════
    // MENU ONTWIKKELAAR (GERECHTEN)
    // ══════════════════════════════════════════════════════
    {
        type: 'function',
        function: {
            name: 'getGerechten',
            description: 'Haal alle gerechten op uit de Menu Ontwikkelaar, gegroepeerd per gang.',
            parameters: {
                type: 'object',
                properties: {
                    gang_slug: { type: 'string', description: 'Filter op gang-slug (optioneel)' },
                    actief_only: { type: 'boolean', description: 'Alleen actieve gerechten (default: false)' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getGangen',
            description: 'Haal alle gangen op (categorieën zoals Bite, Hoofdgerecht, Vegetarisch, etc.).',
            parameters: { type: 'object', properties: {}, required: [] }
        }
    },
    {
        type: 'function',
        function: {
            name: 'createGerecht',
            description: 'Voeg één nieuw gerecht toe aan de Menu Ontwikkelaar.',
            parameters: {
                type: 'object',
                properties: {
                    naam: { type: 'string', description: 'Naam van het gerecht' },
                    gang_slug: { type: 'string', description: 'Slug van de gang (bijv. "bite", "hoofdgerecht", "vegetarisch")' },
                    beschrijving: { type: 'string', description: 'Korte beschrijving' },
                    bereidingswijze: { type: 'string', description: 'Bereidingswijze' },
                    ingredienten: { type: 'array', items: { type: 'string' }, description: 'Lijst van ingrediënten' },
                    tags: { type: 'array', items: { type: 'string' }, description: 'Tags zoals Vegan, Populair, Nieuw' },
                    allergenen: { type: 'array', items: { type: 'string' } }
                },
                required: ['naam', 'gang_slug']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'createGerechtBulk',
            description: 'Voeg meerdere gerechten tegelijk toe aan de Menu Ontwikkelaar. Gebruik dit voor: "20 gerechten met buikspek", "10 vegetarische hapjes", etc. Genereer de gerechten zelf op basis van de vraag van de chef.',
            parameters: {
                type: 'object',
                properties: {
                    gerechten: {
                        type: 'array',
                        description: 'Array van gerecht-objecten',
                        items: {
                            type: 'object',
                            properties: {
                                naam: { type: 'string' },
                                gang_slug: { type: 'string', description: 'bijv. bite, hoofdgerecht, vegetarisch, dessert' },
                                beschrijving: { type: 'string' },
                                bereidingswijze: { type: 'string' },
                                ingredienten: { type: 'array', items: { type: 'string' } },
                                tags: { type: 'array', items: { type: 'string' } }
                            },
                            required: ['naam', 'gang_slug', 'beschrijving']
                        }
                    }
                },
                required: ['gerechten']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'updateGerecht',
            description: 'Bewerk een bestaand gerecht in de Menu Ontwikkelaar.',
            parameters: {
                type: 'object',
                properties: {
                    gerecht_id: { type: 'number' },
                    naam: { type: 'string' },
                    beschrijving: { type: 'string' },
                    bereidingswijze: { type: 'string' },
                    gang_slug: { type: 'string' },
                    tags: { type: 'array', items: { type: 'string' } }
                },
                required: ['gerecht_id']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'deleteGerecht',
            description: 'Verwijder een gerecht uit de Menu Ontwikkelaar.',
            parameters: {
                type: 'object',
                properties: {
                    gerecht_id: { type: 'number', description: 'ID van het te verwijderen gerecht' }
                },
                required: ['gerecht_id']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'deactivateGerechten',
            description: 'Deactiveer of verwijder meerdere gerechten tegelijk. Gebruik dit als chef zegt: "haal de 5 minst interessante eruit", "verwijder alles met varkensvlees", etc.',
            parameters: {
                type: 'object',
                properties: {
                    gerecht_ids: { type: 'array', items: { type: 'number' }, description: 'IDs van gerechten om te deactiveren/verwijderen' },
                    actie: { type: 'string', enum: ['deactiveer', 'verwijder'], description: 'Deactiveer (verbergen) of verwijder (permanent)' },
                    reden: { type: 'string', description: 'Toelichting: waarom worden deze gerechten verwijderd?' }
                },
                required: ['gerecht_ids', 'actie']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'analyzeMenuBalance',
            description: 'Analyseer de balans van het menu: verhouding Bite/VG/HG, allergenen-dekking, seizoensgebondenheid, uniekheid.',
            parameters: { type: 'object', properties: {}, required: [] }
        }
    },

    // ══════════════════════════════════════════════════════
    // RECEPTEN (THE VAULT)
    // ══════════════════════════════════════════════════════
    {
        type: 'function',
        function: {
            name: 'engineer_menu_profitability',
            description: 'Zoek naar "Plowhorses" in het systeem (hoge verkoop, lage marge). Reken live de foodcost door en stel slimme ingrediënt-vervangingen voor die de marge verhogen zonder kwaliteitsverlies.',
            parameters: {
                type: 'object',
                properties: {
                    analyse_resultaten: {
                        type: 'array',
                        description: 'Lijst van geanalyseerde gerechten en voorgestelde verbeteringen.',
                        items: {
                            type: 'object',
                            properties: {
                                gerecht_id: { type: 'number' },
                                gerecht_naam: { type: 'string' },
                                huidige_marge: { type: 'number' },
                                knelpunt_ingredient: { type: 'string', description: 'Het ingrediënt dat de marge drukt' },
                                suggestie_vervanging: { type: 'string', description: 'Door welk ingrediënt kunnen we dit vervangen?' },
                                nieuwe_geschatte_marge: { type: 'number', description: 'Marge na vervanging' },
                                reden: { type: 'string', description: 'Chef-waardige uitleg voor deze aanpassing' }
                            },
                            required: ['gerecht_naam', 'huidige_marge', 'knelpunt_ingredient', 'suggestie_vervanging', 'nieuwe_geschatte_marge', 'reden']
                        }
                    },
                    totaal_winstpotentieel: { type: 'string', description: 'Bv. +8% marge op het totale menu' }
                },
                required: ['analyse_resultaten', 'totaal_winstpotentieel']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getRecepten',
            description: 'Haal alle recepten op uit The Vault (het receptenboek van de chef).',
            parameters: {
                type: 'object',
                properties: {
                    categorie: { type: 'string', description: 'Filter op categorie: Vlees, Vis, Bijgerecht, Saus, Dessert, Drank' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getReceptDetail',
            description: 'Haal het volledige recept op inclusief ingrediënten, bereiding en notities.',
            parameters: {
                type: 'object',
                properties: {
                    recept_id: { type: 'number' }
                },
                required: ['recept_id']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'createRecept',
            description: 'Voeg een nieuw recept toe aan The Vault.',
            parameters: {
                type: 'object',
                properties: {
                    naam: { type: 'string' },
                    categorie: { type: 'string', enum: ['Vlees', 'Vis', 'Bijgerecht', 'Saus', 'Dessert', 'Drank'] },
                    porties: { type: 'number', description: 'Aantal porties' },
                    preptime: { type: 'number', description: 'Bereidingstijd in minuten' },
                    ingredienten: { type: 'array', items: { type: 'string' } },
                    instructies: { type: 'string' },
                    notitie: { type: 'string' }
                },
                required: ['naam', 'categorie']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'updateRecept',
            description: 'Bewerk een bestaand recept in The Vault.',
            parameters: {
                type: 'object',
                properties: {
                    recept_id: { type: 'number' },
                    naam: { type: 'string' },
                    instructies: { type: 'string' },
                    porties: { type: 'number' },
                    preptime: { type: 'number' },
                    ingredienten: { type: 'array', items: { type: 'string' } },
                    notitie: { type: 'string' }
                },
                required: ['recept_id']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'calcPortiesVoor',
            description: 'Bereken hoeveel van een recept er nodig is voor X gasten, inclusief inkoop-hoeveelheden.',
            parameters: {
                type: 'object',
                properties: {
                    recept_id: { type: 'number' },
                    recept_naam: { type: 'string', description: 'Naam van het recept (als alternatief voor ID)' },
                    gasten: { type: 'number', description: 'Aantal gasten om voor te bereiden' }
                },
                required: ['gasten']
            }
        }
    },

    // ══════════════════════════════════════════════════════
    // OFFERTES
    // ══════════════════════════════════════════════════════
    {
        type: 'function',
        function: {
            name: 'generate_smart_quote',
            description: 'Genereer een complete, slimme offerte inclusief geselecteerde gerechten en perfect doorgerekende factuurregels om een specifieke marge te behalen.',
            parameters: {
                type: 'object',
                properties: {
                    client_naam: { type: 'string', description: 'Naam van de klant' },
                    client_adres: { type: 'string', description: 'Adres of vestiging' },
                    datum: { type: 'string', description: 'YYYY-MM-DD' },
                    aantal_gasten: { type: 'number', description: 'Totaal aantal gasten' },
                    basis_prijs_pp: { type: 'number', description: 'Prijs per persoon (excl BTW) om de marge >70% te checken' },
                    notitie: { type: 'string', description: 'Toelichting op het menu en de opzet' },
                    menu_selectie: {
                        type: 'array',
                        description: 'De gekozen of bedachte gerechten voor deze offerte',
                        items: {
                            type: 'object',
                            properties: {
                                gang_slug: { type: 'string' },
                                gerecht_naam: { type: 'string' },
                                beschrijving: { type: 'string' }
                            },
                            required: ['gang_slug', 'gerecht_naam']
                        }
                    },
                    items: {
                        type: 'array',
                        description: 'Factuurregels (Offerte Lines) zoals "BBQ Signature Menu p.p." of "Huur Kok"',
                        items: {
                            type: 'object',
                            properties: {
                                desc: { type: 'string', description: 'Omschrijving op de factuurregel' },
                                qty: { type: 'number', description: 'Aantal' },
                                prijs: { type: 'number', description: 'Prijs per eenheid (excl BTW)' },
                                btw: { type: 'number', description: 'BTW percentage (9 voor eten, 21 voor service/drank)' }
                            },
                            required: ['desc', 'qty', 'prijs', 'btw']
                        }
                    },
                    vaste_kosten: {
                        type: 'array',
                        description: 'Verwachte vaste kosten voor winst-calculatie (bijv. Uren Kok, Brandstof)',
                        items: {
                            type: 'object',
                            properties: {
                                naam: { type: 'string' },
                                bedrag: { type: 'number' }
                            },
                            required: ['naam', 'bedrag']
                        }
                    }
                },
                required: ['client_naam', 'datum', 'aantal_gasten', 'basis_prijs_pp', 'items']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getOffertes',
            description: 'Haal alle offertes op, inclusief berekende totaalbedragen.',
            parameters: {
                type: 'object',
                properties: {
                    status: { type: 'string', enum: ['concept', 'verzonden', 'goedgekeurd', 'afgewezen', 'betaald'], description: 'Filter op status' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getOpenOffertes',
            description: 'Haal alle open offertes op (status: concept of verzonden) met totaalbedragen.',
            parameters: { type: 'object', properties: {}, required: [] }
        }
    },
    {
        type: 'function',
        function: {
            name: 'calcOfferteOmzet',
            description: 'Bereken de totale omzet van offertes per status of periode.',
            parameters: {
                type: 'object',
                properties: {
                    periode: { type: 'string', description: 'bijv. "dit kwartaal", "dit jaar", "deze maand"' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'updateOfferteStatus',
            description: 'Wijzig de status van een offerte.',
            parameters: {
                type: 'object',
                properties: {
                    offerte_id: { type: 'number' },
                    status: { type: 'string', enum: ['concept', 'verzonden', 'goedgekeurd', 'afgewezen', 'betaald'] }
                },
                required: ['offerte_id', 'status']
            }
        }
    },

    // ══════════════════════════════════════════════════════
    // FACTUREN
    // ══════════════════════════════════════════════════════
    {
        type: 'function',
        function: {
            name: 'getFacturen',
            description: 'Haal alle facturen op met totaalbedragen en vervaldatums.',
            parameters: {
                type: 'object',
                properties: {
                    status: { type: 'string', enum: ['concept', 'verzonden', 'betaald', 'vervallen'] }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getOpenFacturen',
            description: 'Haal alle onbetaalde facturen op, inclusief welke al vervallen zijn.',
            parameters: { type: 'object', properties: {}, required: [] }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getVervaldatumsFacturen',
            description: 'Haal facturen op die binnen X dagen vervallen of al vervallen zijn.',
            parameters: {
                type: 'object',
                properties: {
                    dagen: { type: 'number', description: 'Aantal dagen vooruit kijken (default: 7)' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'calcCashflow',
            description: 'Bereken de verwachte cashflow op basis van openstaande facturen en offertes.',
            parameters: { type: 'object', properties: {}, required: [] }
        }
    },

    // ══════════════════════════════════════════════════════
    // VOORRAAD
    // ══════════════════════════════════════════════════════
    {
        type: 'function',
        function: {
            name: 'getVoorraad',
            description: 'Haal de volledige voorraadlijst op.',
            parameters: {
                type: 'object',
                properties: {
                    laag_only: { type: 'boolean', description: 'Alleen items onder min. par-level tonen' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getLageVoorraadItems',
            description: 'Haal alle items op die onder het minimum par-level zitten. Gebruik bij "wat moet ik bijbestellen" of "lage voorraad check".',
            parameters: { type: 'object', properties: {}, required: [] }
        }
    },
    {
        type: 'function',
        function: {
            name: 'updateVoorraadItem',
            description: 'Pas de hoeveelheid of par-level van een voorraad-item aan.',
            parameters: {
                type: 'object',
                properties: {
                    item_id: { type: 'number' },
                    hoeveelheid: { type: 'number', description: 'Nieuwe hoeveelheid' },
                    min_par: { type: 'number', description: 'Nieuw minimum par-level' }
                },
                required: ['item_id']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'calcBenodigdVoorEvent',
            description: 'Bereken hoeveel van elk ingrediënt er nodig is voor een event op basis van het menu en aantal gasten.',
            parameters: {
                type: 'object',
                properties: {
                    event_id: { type: 'number' },
                    gasten: { type: 'number' }
                },
                required: []
            }
        }
    },

    // ══════════════════════════════════════════════════════
    // INKOOP
    // ══════════════════════════════════════════════════════
    {
        type: 'function',
        function: {
            name: 'getInkoopLijst',
            description: 'Genereer een inkooplijst op basis van lage voorraad en aankomende events.',
            parameters: {
                type: 'object',
                properties: {
                    groepeer_per_winkel: { type: 'boolean', description: 'Groepeer per leverancier/winkel' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'generateInkoopVoorEvent',
            description: 'Maak een specifieke inkooplijst voor een event.',
            parameters: {
                type: 'object',
                properties: {
                    event_id: { type: 'number' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getInkoopPerWinkel',
            description: 'Haal de inkooplijst gegroepeerd per winkel (Sligro, Crisp, PLUS, etc.) op.',
            parameters: { type: 'object', properties: {}, required: [] }
        }
    },
    {
        type: 'function',
        function: {
            name: 'process_receipt',
            description: 'Lees een geüpload bonnetje of inkoopfactuur in en update automatisch de voorraad-aantallen, inkoopprijzen en registreer de BTW-uitsplitsing in de boekhouding.',
            parameters: {
                type: 'object',
                properties: {
                    winkel: { type: 'string', description: 'Naam van de winkel/makro/sligro' },
                    datum: { type: 'string', description: 'YYYY-MM-DD' },
                    totaal_bedrag: { type: 'number', description: 'Totaalbedrag inclusief BTW' },
                    btw_hoog: { type: 'number', description: 'Totaalbedrag aan 21% BTW' },
                    btw_laag: { type: 'number', description: 'Totaalbedrag aan 9% BTW' },
                    btw_nul: { type: 'number', description: 'Totaalbedrag vrij van BTW (0%)' },
                    items: {
                        type: 'array',
                        description: 'Lijst van gekochte items (voorraad update)',
                        items: {
                            type: 'object',
                            properties: {
                                naam: { type: 'string' },
                                aantal: { type: 'number' },
                                prijs: { type: 'number', description: 'Prijs per eenheid ex. BTW (Update inkoopprijs!)' },
                                btw_tarief: { type: 'number', description: '9 of 21' }
                            },
                            required: ['naam', 'aantal', 'prijs', 'btw_tarief']
                        }
                    }
                },
                required: ['winkel', 'datum', 'totaal_bedrag', 'items']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'optimize_shopping_list',
            description: 'Genereer een slimme, netto inkooplijst voor een specifieke periode. Bereken (Recepturen x Gasten) - Huidige Voorraad + 5% Waste, uitgesplitst per leverancier.',
            parameters: {
                type: 'object',
                properties: {
                    periode_start: { type: 'string', description: 'YYYY-MM-DD' },
                    periode_eind: { type: 'string', description: 'YYYY-MM-DD' },
                    event_nummers: { type: 'array', items: { type: 'string' }, description: 'Optioneel: Specifieke events (bijv. EVT-001) om in te kopen.' },
                    leveranciers_lijsten: {
                        type: 'array',
                        description: 'De gegenereerde netto inkooplijsten, gegroepeerd per leverancier (Sligro, Crisp, Slager, etc.)',
                        items: {
                            type: 'object',
                            properties: {
                                leverancier: { type: 'string' },
                                items: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            naam: { type: 'string' },
                                            bruto_nodig: { type: 'number', description: 'Wat de recepten exact vragen' },
                                            voorraad_af: { type: 'number', description: 'Wat we al in huis hebben' },
                                            waste_marge: { type: 'number', description: '5% extra buffer' },
                                            netto_inkoop: { type: 'number', description: 'Bruto - Voorraad + Waste (Wat we écht moeten kopen)' },
                                            eenheid: { type: 'string' },
                                            geschatte_kosten: { type: 'number', description: 'Netto inkoop x verwachte inkoopprijs' }
                                        },
                                        required: ['naam', 'netto_inkoop', 'eenheid']
                                    }
                                },
                                subtotaal_kosten: { type: 'number' }
                            },
                            required: ['leverancier', 'items']
                        }
                    },
                    totaal_geschatte_kosten: { type: 'number' }
                },
                required: ['periode_start', 'periode_eind', 'leveranciers_lijsten', 'totaal_geschatte_kosten']
            }
        }
    },

    // ══════════════════════════════════════════════════════
    // HACCP
    // ══════════════════════════════════════════════════════
    {
        type: 'function',
        function: {
            name: 'getHaccpLogs',
            description: 'Haal recente HACCP temperatuurlogs op.',
            parameters: {
                type: 'object',
                properties: {
                    event_id: { type: 'number' },
                    days: { type: 'number', description: 'Hoeveel dagen terug (default: 7)' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'createHaccpLog',
            description: 'Registreer een nieuwe temperatuurmeting in het HACCP-systeem.',
            parameters: {
                type: 'object',
                properties: {
                    product: { type: 'string' },
                    temperatuur: { type: 'number', description: 'Gemeten temperatuur in Celsius' },
                    chef: { type: 'string' },
                    event_id: { type: 'number' },
                    notitie: { type: 'string' }
                },
                required: ['product', 'temperatuur']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getMissingHaccpLogs',
            description: 'Check welke events of producten nog geen HACCP-log hebben.',
            parameters: { type: 'object', properties: {}, required: [] }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getTemperatureAlerts',
            description: 'Haal alle temperatuurmetingen op die buiten de veilige zone vielen.',
            parameters: { type: 'object', properties: {}, required: [] }
        }
    },

    // ══════════════════════════════════════════════════════
    // UREN
    // ══════════════════════════════════════════════════════
    {
        type: 'function',
        function: {
            name: 'getUrenRegistraties',
            description: 'Haal urenregistraties op voor de opgegeven periode.',
            parameters: {
                type: 'object',
                properties: {
                    periode: { type: 'string', description: 'bijv. deze week, deze maand, dit kwartaal' },
                    medewerker: { type: 'string' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getUrenPerMedewerker',
            description: 'Overzicht van gewerkte uren per medewerker.',
            parameters: {
                type: 'object',
                properties: {
                    maand: { type: 'string', description: 'YYYY-MM formaat' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'calcOveruren',
            description: 'Bereken het aantal overuren op basis van contracturen vs. geregistreerde uren.',
            parameters: {
                type: 'object',
                properties: {
                    medewerker: { type: 'string' },
                    contract_uren_per_week: { type: 'number' }
                },
                required: []
            }
        }
    },

    // ══════════════════════════════════════════════════════
    // MATERIEEL
    // ══════════════════════════════════════════════════════
    {
        type: 'function',
        function: {
            name: 'predict_hardware_needs',
            description: 'Lees het menu van een gepland event en voorspel exact welke hardware (smokers, ovens, gas, koelboxen) mee in de bus moet. Genereert de "Bus-Check" lijst.',
            parameters: {
                type: 'object',
                properties: {
                    event_id: { type: 'number' },
                    event_naam: { type: 'string' },
                    benodigd_materieel: {
                        type: 'array',
                        description: 'De voorspelde hardware items gebaseerd op de gekozen gerechten en het aantal gasten.',
                        items: {
                            type: 'object',
                            properties: {
                                item_naam: { type: 'string' },
                                aantal: { type: 'number' },
                                reden: { type: 'string', description: 'Waarom is dit nodig? (Bv. "Nodig voor de Pulled Pork")' }
                            },
                            required: ['item_naam', 'aantal', 'reden']
                        }
                    }
                },
                required: ['event_id', 'benodigd_materieel']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getMaterieel',
            description: 'Haal de volledige materieellijst op (BBQs, servies, tenten, etc.).',
            parameters: {
                type: 'object',
                properties: {
                    categorie: { type: 'string' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getMaterieelVoorEvent',
            description: 'Bereken welk materieel nodig is voor een specifiek event op basis van het menu en gasten.',
            parameters: {
                type: 'object',
                properties: {
                    event_id: { type: 'number' },
                    gasten: { type: 'number' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'updateMaterieelStatus',
            description: 'Markeer materieel als beschikbaar, in gebruik, of in onderhoud.',
            parameters: {
                type: 'object',
                properties: {
                    item_id: { type: 'number' },
                    status: { type: 'string', enum: ['beschikbaar', 'in_gebruik', 'onderhoud', 'kapot'] }
                },
                required: ['item_id', 'status']
            }
        }
    },

    // ══════════════════════════════════════════════════════
    // LOGISTIEK
    // ══════════════════════════════════════════════════════
    {
        type: 'function',
        function: {
            name: 'getBusCheck',
            description: 'Genereer de bus-check lijst voor het inladen vóór een event.',
            parameters: {
                type: 'object',
                properties: {
                    event_id: { type: 'number' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getLogistiekVoorEvent',
            description: 'Volledige logistiek-overzicht voor een event: materieel, voedsel, personeel.',
            parameters: {
                type: 'object',
                properties: {
                    event_id: { type: 'number' }
                },
                required: []
            }
        }
    },

    // ══════════════════════════════════════════════════════
    // BOEKHOUDING
    // ══════════════════════════════════════════════════════
    {
        type: 'function',
        function: {
            name: 'getOmzetPerPeriode',
            description: 'Haal de gerealiseerde omzet op per periode op basis van betaalde facturen.',
            parameters: {
                type: 'object',
                properties: {
                    periode: { type: 'string', description: 'bijv. "Q1 2025", "maart 2025", "dit jaar"' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getKwartaalOmzet',
            description: 'Haal de omzet van het huidige of een specifiek kwartaal op.',
            parameters: {
                type: 'object',
                properties: {
                    kwartaal: { type: 'number', enum: [1, 2, 3, 4] },
                    jaar: { type: 'number' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'calcFoodCostRatio',
            description: 'Bereken de food cost ratio voor een event of het gehele menu.',
            parameters: {
                type: 'object',
                properties: {
                    event_id: { type: 'number' }
                },
                required: []
            }
        }
    },

    // ══════════════════════════════════════════════════════
    // AI GESPREKKEN (AI CHAT PAGINA)
    // ══════════════════════════════════════════════════════
    {
        type: 'function',
        function: {
            name: 'saveConversation',
            description: 'Sla dit gesprek op in het systeem. Gebruik ALLEEN als de gebruiker expliciet vraagt om op te slaan, of als jij detecteert dat het gesprek waardevolle ideeën bevat en toestemming vraagt.',
            parameters: {
                type: 'object',
                properties: {
                    titel: { type: 'string', description: 'Titel voor het gesprek' },
                    folder_naam: { type: 'string', description: 'Map om het gesprek in te plaatsen (optioneel)' }
                },
                required: ['titel']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getConversations',
            description: 'Haal opgeslagen gesprekken op.',
            parameters: {
                type: 'object',
                properties: {
                    folder_id: { type: 'number' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'createFolder',
            description: 'Maak een nieuwe map aan voor het opslaan van gesprekken.',
            parameters: {
                type: 'object',
                properties: {
                    naam: { type: 'string' },
                    kleur: { type: 'string', description: 'Hex kleurcode, bijv. #FFBF00' }
                },
                required: ['naam']
            }
        }
    },

    // ══════════════════════════════════════════════════════
    // CROSS-MODULE
    // ══════════════════════════════════════════════════════
    {
        type: 'function',
        function: {
            name: 'getWeekOverzicht',
            description: 'Haal een volledig overzicht van de komende week op: events, prep-taken, te bestellen voorraad, open offertes.',
            parameters: { type: 'object', properties: {}, required: [] }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getDashboardSummary',
            description: 'Haal een samenvatting op van het dashboard: KPIs, alerts, aankomende events.',
            parameters: { type: 'object', properties: {}, required: [] }
        }
    },
    {
        type: 'function',
        function: {
            name: 'filterSystemData',
            description: 'Verberg of verwijder data uit het systeem op basis van criteria. Bijv. "verwijder alles met varkensvlees", "haal de niet-interessante gerechten weg". Altijd toestemming vragen voor uitvoering.',
            parameters: {
                type: 'object',
                properties: {
                    module: { type: 'string', enum: ['gerechten', 'recepten', 'events', 'offertes'], description: 'In welke module filteren' },
                    criteria: { type: 'string', description: 'Beschrijving van de filtercriteria, bijv. "bevat varkensvlees" of "culinair minst interessant"' },
                    actie: { type: 'string', enum: ['deactiveer', 'verwijder'], description: 'Deactiveer (verbergen) of permanent verwijderen' }
                },
                required: ['module', 'criteria']
            }
        }
    }
];

// Tool namen als Set voor snelle lookup
export var TOOL_NAMES = new Set(TOOL_SCHEMAS.map(function (t) { return t.function.name; }));
