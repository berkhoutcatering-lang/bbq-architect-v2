import { NextResponse } from 'next/server';

export async function POST(req) {
    try {
        var body = await req.json();
        var { messages } = body;

        if (!messages || !Array.isArray(messages)) {
            return NextResponse.json({ error: 'Berichten zijn onjuist geformatteerd' }, { status: 400 });
        }

        var apiKey = process.env.GROQ_API_KEY;

        if (!apiKey) {
            return NextResponse.json({ error: 'Groq API Key ontbreekt' }, { status: 500 });
        }

        var systemMessage = {
            role: 'system',
            content: 'Je bent BBQ Copilot, de behulpzame en professionele AI-assistent voor de BBQ Architect catering applicatie van Hop & Bites. ' +
                'Je helpt medewerkers met vragen over catering, logistiek, menu engineering, recepten en calculaties. ' +
                'Je antwoordt altijd in het Nederlands. Je bent beknopt, direct en behulpzaam. ' +
                'Gebruik indien nodig markdown voor formattering.'
        };

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
