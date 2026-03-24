const Stripe = require('stripe');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  const { tier, userId, email } = req.body;

  const prices = {
    plus: process.env.STRIPE_PLUS_PRICE_ID,
    pro:  process.env.STRIPE_PRO_PRICE_ID,
  };

  if (!prices[tier]) return res.status(400).json({ error: 'Invalid tier' });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: prices[tier], quantity: 1 }],
      customer_email: email,
      metadata: { userId, tier },
      success_url: `${process.env.APP_URL}/app.html?upgraded=true`,
      cancel_url:  `${process.env.APP_URL}/app.html?upgraded=false`,
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
