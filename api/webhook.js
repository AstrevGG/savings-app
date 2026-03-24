const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

// Vercel raw body needed for webhook signature verification
export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // Payment succeeded — upgrade the user
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { userId, tier } = session.metadata;

    if (userId && tier) {
      const { error } = await sb
        .from('profiles')
        .update({ tier, stripe_customer_id: session.customer })
        .eq('id', userId);

      if (error) console.error('Supabase update failed:', error);
    }
  }

  // Subscription cancelled — downgrade back to free
  if (event.type === 'customer.subscription.deleted') {
    const customerId = event.data.object.customer;

    const { error } = await sb
      .from('profiles')
      .update({ tier: 'free' })
      .eq('stripe_customer_id', customerId);

    if (error) console.error('Supabase downgrade failed:', error);
  }

  res.status(200).json({ received: true });
};
