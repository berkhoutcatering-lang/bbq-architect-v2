import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

export async function POST(req: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY niet geconfigureerd in .env' }, { status: 500 });
  }

  const resend = new Resend(apiKey);

  try {
    const body = await req.json();
    const { to, subject, html, text, from, replyTo, attachments } = body;

    if (!to || !subject) {
      return NextResponse.json({ error: 'to en subject zijn verplicht' }, { status: 400 });
    }

    const result = await resend.emails.send({
      from: from || process.env.RESEND_FROM_EMAIL || 'Hop & Bites <onboarding@resend.dev>',
      to: Array.isArray(to) ? to : [to],
      subject,
      html: html || undefined,
      text: text || undefined,
      replyTo: replyTo || undefined,
      attachments: attachments || undefined,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[send-email] Error:', error);
    return NextResponse.json({ error: error.message || 'Email verzenden mislukt' }, { status: 500 });
  }
}
