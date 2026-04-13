import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/billing/stripe-client';
import { processStripeEvent } from '@/lib/billing/webhook-handlers';

export const runtime = 'nodejs';

/**
 * Stripe webhook — raw body required for signature verification.
 */
export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !whSecret) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  const sig = request.headers.get('stripe-signature');
  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: import('stripe').Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, whSecret);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    await processStripeEvent(event);
  } catch {
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
