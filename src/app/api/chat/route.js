import { NextResponse } from 'next/server';

var PAGE_CONTEXTS = {
    '/': 'Dashboard — overzicht van events, omzet en dagelijkse taken.',
    '/recepten': 'Recepten — beheer van recepten, ingrediënten en bereidingswijzen.',
    '/gerechten': 'Gerechten & Menu — gerechten, gangs, hardware en menuopbouw.',
    '/menu-engineering': 'Menu Engineering — analyse van winstmarges en menu-aantrekkelijkheid.',
    '/events': 'Events — aanmaken en beheren van catering events.',
    '/service': 'Service Mode — live bediening tijdens een event, HACCP temperaturen, bonnen.',
    '/offertes': 'Offertes — het aanmaken en beheren van catering offertes voor klanten.',
    '/facturen': 'Facturen — facturatie en betalingsoverzicht.',
    '/agenda': 'Agenda — planning van events en prep-taken.',
    '/inkoop': 'Inkoop — leveranciersbeheer en boodschappenlijsten.',
    '/voorraad': 'Voorraad — voorraadbeheer en lage-voorraad alerts.',
    '/logistiek': 'Logistiek & Bus-Check — laden van materieel en buspreparatie voor events.',
    '/haccp': 'HACCP — temperatuurregistraties en voedselveiligheidscontroles.',
    '/uren': 'Urenregistratie — uren bijhouden per medewerker.',
    '/materieel': 'Materieel — apparatuur en uitrusting bijhouden.',
    '/boekhouding': 'Boekhouding — overzicht van inkomsten en uitgaven.',
    '/price-intelligence': 'Prijsintelligentie — vergelijken van leveranciersprijzen via CSV import.',
    '/foto-archief': 'Foto-archief — beheer van event- en gerechtenfotos.',
    '/instellingen': 'Instellingen — bedrijfsgegevens en PDF configuratie.',
};

export async function POST(req) {
    try {
        var body = await req.json();
        var { messages, pageContext, mode } = body;

        if (!messages || !Array.isArray(messages)) {
            return NextResponse.json({ error: 'Berichten zijn onjuist geformatteerd' }, { status: 400 });
        }

        var apiKey = process.env.GROQ_API_KEY;

        if (!apiKey) {
            return NextResponse.json({ error: 'Groq API Key ontbreekt' }, { status: 500 });
        }

        var pageName = pageContext ? (PAGE_CONTEXTS[pageContext] || 'Onbekende pagina') : null;

        var systemContent;
        if (mode === 'general') {
            systemContent = 'Je bent BBQ Copilot, de slimme AI-assistent van BBQ Architect (Hop & Bites). ' +
                'In dit venster beantwoord je algemene vragen over catering, horeca, recepten, inkoop, planning en bedrijfsvoering. ' +
                'Je antwoordt altijd in het Nederlands. Wees behulpzaam, enthousiast en professioneel. ' +
                'Gebruik markdown voor overzichtsantwoorden (headers, bullets, bold).';
        } else {
            systemContent = 'Je bent BBQ Copilot, de slimme AI-assistent ingebouwd in de BBQ Architect catering applicatie van Hop & Bites. ' +
                'Je helpt medewerkers direct met de pagina waar ze op staan. ' +
                (pageName ? `De gebruiker bevindt zich momenteel op: **${pageName}**. Richt je antwoorden specifiek op die functionaliteit. ` : '') +
                'Geef praktische, concrete adviezen die direct bruikbaar zijn in de dagelijkse catering praktijk. ' +
                'Je antwoordt altijd in het Nederlands. Wees beknopt maar volledig. ' +
                'Gebruik markdown (bullets, bold, code) voor structuur waar nuttig.';
        }

        var systemMessage = { role: 'system', content: systemContent };
        var groqMessages = [systemMessage, ...messages];

        var response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: groqMessages,
                temperature: 0.7,
                max_tokens: 1024,
            }),
        });

        if (!response.ok) {
            var errorData = await response.text();
            console.error('Groq API Error:', errorData);
            return NextResponse.json({ error: 'Fout bij communicatie met Groq API' }, { status: response.status });
        }

        var data = await response.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error('Chat API Route Error:', error);
        return NextResponse.json({ error: 'Interne serverfout' }, { status: 500 });
    }
}
