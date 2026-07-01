import { readWebhookReceipts } from '../../../../lib/webhookReceipts.js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const receipts = await readWebhookReceipts();
    return NextResponse.json({ receipts });
  } catch (err) {
    return NextResponse.json({ error: err.message, receipts: [] }, { status: 500 });
  }
}
