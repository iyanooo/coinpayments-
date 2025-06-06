import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

// Environment-based configuration
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001';
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3002';

// Middleware - More flexible CORS for development and production
const allowedOrigins = [
  FRONTEND_URL,
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://127.0.0.1:3001',
  'https://checkout.coinpayments.net',
  'https://coinpayments.net',
  'https://beecracker.live'  // ✅ Added your production domain
];

// If in production, you can add your production frontend URL here
if (process.env.NODE_ENV === 'production' && process.env.PRODUCTION_FRONTEND_URL) {
  allowedOrigins.push(process.env.PRODUCTION_FRONTEND_URL);
}

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      console.log('Allowed origins:', allowedOrigins);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());

// Supabase configuration
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase configuration. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// CoinPayments V2 API configuration
const COINPAYMENTS_CLIENT_ID = process.env.COINPAYMENTS_CLIENT_ID;
const COINPAYMENTS_CLIENT_SECRET = process.env.COINPAYMENTS_CLIENT_SECRET;
const COINPAYMENTS_API_URL = 'https://a-api.coinpayments.net/api/v2/merchant/invoices';

if (!COINPAYMENTS_CLIENT_ID || !COINPAYMENTS_CLIENT_SECRET) {
  console.error('Missing CoinPayments configuration. Please set COINPAYMENTS_CLIENT_ID and COINPAYMENTS_CLIENT_SECRET environment variables.');
  process.exit(1);
}

// Helper function to generate CoinPayments V2 HMAC signature
function generateCoinPaymentsV2Signature(method, url, clientId, timestamp, payload) {
  const message = `\ufeff${method}${url}${clientId}${timestamp}${payload}`;
  const hmac = crypto.createHmac('sha256', COINPAYMENTS_CLIENT_SECRET);
  hmac.update(message);
  return hmac.digest('base64');
}

// Create CoinPayments transaction endpoint using V2 API
app.post('/api/payments/create-coinpayments', async (req, res) => {
  try {
    console.log('Received request body:', req.body);
    
    const { userId, amount, orderId, userEmail } = req.body;

    if (!userId || !amount || !orderId) {
      console.log('Missing required fields:', { userId, amount, orderId });
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate amount
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount < 10 || numAmount > 10000) {
      console.log('Invalid amount:', numAmount);
      return res.status(400).json({ error: 'Invalid amount. Must be between $10 and $10,000' });
    }

    console.log('Creating CoinPayments V2 invoice for amount:', numAmount);

    // Create invoice using CoinPayments V2 API
    const invoiceData = {
      currency: 'USD',
      amount: {
        total: numAmount.toString()
      },
      items: [
        {
          name: `Add funds to account - $${numAmount}`,
          quantity: { value: 1, type: 1 },
          amount: numAmount.toString()
        }
      ],
      payment: {
        paymentCurrency: 'USDT.TRC20',
        refundEmail: userEmail || 'noreply@example.com'
      },
      webhooks: [
        {
          notificationsUrl: `${SERVER_URL}/api/payments/coinpayments-webhook`,
          notifications: ['invoicePaid', 'invoiceCompleted']
        }
      ],
      redirects: {
        returnUrl: `https://beecracker.live/buy-proxies?payment=success`,  // ✅ Updated to use production URL
        cancelUrl: `https://beecracker.live/buy-proxies?payment=cancelled`  // ✅ Updated to use production URL
      },
      customData: {
        orderId: orderId,
        userId: userId
      }
    };

    console.log('CoinPayments V2 invoice data:', invoiceData);

    // Generate timestamp and signature
    const timestamp = new Date().toISOString().split('.')[0]; // Remove milliseconds
    const payload = JSON.stringify(invoiceData);
    const signature = generateCoinPaymentsV2Signature('POST', COINPAYMENTS_API_URL, COINPAYMENTS_CLIENT_ID, timestamp, payload);

    console.log('Generated V2 signature:', signature.substring(0, 20) + '...');

    const response = await fetch(COINPAYMENTS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CoinPayments-Client': COINPAYMENTS_CLIENT_ID,
        'X-CoinPayments-Timestamp': timestamp,
        'X-CoinPayments-Signature': signature,
      },
      body: payload
    });

    console.log('CoinPayments V2 response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('CoinPayments V2 API error response:', errorText);
      throw new Error(`CoinPayments V2 API error: ${response.status} - ${errorText}`);
    }

    const responseText = await response.text();
    console.log('CoinPayments V2 raw response:', responseText);
    
    let data;
    
    try {
      data = JSON.parse(responseText);
      console.log('Parsed CoinPayments V2 response:', data);
    } catch (parseError) {
      console.error('Failed to parse CoinPayments V2 response as JSON');
      console.error('Raw response:', responseText);
      console.error('Parse error:', parseError);
      throw new Error('Invalid response from CoinPayments V2 - not valid JSON');
    }

    if (!data.invoices || data.invoices.length === 0) {
      console.error('CoinPayments V2 API error: No invoices returned');
      throw new Error('Failed to create funding payment - no invoice returned');
    }

    const invoice = data.invoices[0];
    console.log('CoinPayments V2 invoice created successfully:', invoice.id);

    // Store funding payment info in database
    console.log('Storing payment in database...');
    const { error: paymentError } = await supabase
      .from('funding_payments')
      .insert({
        user_id: userId,
        payment_id: invoice.id,
        coinpayments_txn_id: invoice.id,
        amount: numAmount,
        currency: 'USD',
        crypto_currency: 'USDT.TRC20',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (paymentError) {
      console.error('Database error:', paymentError);
      throw new Error(`Failed to register funding payment: ${paymentError.message}`);
    }

    console.log('Payment stored in database successfully');

    // Return success response with payment URL
    const responseData = {
      success: true,
      invoice_id: invoice.id,
      status_url: invoice.link,
      checkout_url: invoice.link // Use dashboard link instead of checkout link to avoid host configuration issues
    };

    console.log('Returning success response:', responseData);
    res.json(responseData);

  } catch (error) {
    console.error('Error creating funding payment:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to create funding payment. Please try again.' 
    });
  }
});

// Payment redirect endpoints - Updated for production
app.get('/payment-success', (req, res) => {
  res.redirect(`https://beecracker.live/buy-proxies?payment=success`);  // ✅ Updated to production URL
});

app.get('/payment-cancelled', (req, res) => {
  res.redirect(`https://beecracker.live/buy-proxies?payment=cancelled`);  // ✅ Updated to production URL
});

// CoinPayments V2 webhook endpoint  
app.post('/api/payments/coinpayments-webhook', async (req, res) => {
  try {
    console.log('CoinPayments V2 webhook received:', req.body);

    // CoinPayments V2 sends data in this structure:
    // { id: 'webhook-id', type: 'InvoicePaid', timestamp: '...', invoice: { id: 'invoice-id', state: 'Paid', customData: {...} } }
    const { invoice } = req.body;

    if (!invoice || !invoice.id || !invoice.customData) {
      console.error('Invalid webhook data - missing invoice or custom data');
      console.error('Expected: { invoice: { id: "...", customData: {...} } }');
      console.error('Received:', JSON.stringify(req.body, null, 2));
      return res.status(400).json({ error: 'Invalid webhook data' });
    }

    const invoiceId = invoice.id;
    const { orderId, userId } = invoice.customData;
    const invoiceState = invoice.state; // 'Pending', 'Paid', 'Expired', etc.

    if (!orderId || !userId) {
      console.error('Invalid custom data - missing orderId or userId');
      console.error('CustomData received:', invoice.customData);
      return res.status(400).json({ error: 'Invalid custom data' });
    }

    console.log(`Processing webhook for invoice ${invoiceId}, state: ${invoiceState}, order: ${orderId}, user: ${userId}`);

    // Find the payment record in database
    const { data: payment, error: fetchError } = await supabase
      .from('funding_payments')
      .select('*')
      .eq('coinpayments_txn_id', invoiceId)
      .single();

    if (fetchError || !payment) {
      console.error('Payment not found:', invoiceId, fetchError);
      return res.status(404).json({ error: 'Payment not found' });
    }

    let paymentStatus = 'pending';
    
    // Map CoinPayments V2 states to our payment statuses
    if (invoiceState === 'Paid' || invoiceState === 'Completed') {
      paymentStatus = 'completed';
    } else if (invoiceState === 'Cancelled' || invoiceState === 'Expired') {
      paymentStatus = 'failed';
    } else if (invoiceState === 'Pending') {
      paymentStatus = 'pending';
    }

    console.log(`Updating payment ${invoiceId} status from ${payment.status} to ${paymentStatus}`);

    // Update payment status
    const { error: updateError } = await supabase
      .from('funding_payments')
      .update({
        status: paymentStatus,
        updated_at: new Date().toISOString()
      })
      .eq('coinpayments_txn_id', invoiceId);

    if (updateError) {
      console.error('Error updating payment:', updateError);
      return res.status(500).json({ error: 'Failed to update payment' });
    }

    // If payment is completed, add funds to user balance
    if (paymentStatus === 'completed') {
      const amount = parseFloat(payment.amount);

      console.log(`Payment completed! Adding $${amount} to user ${userId} balance`);

      // Get current balance or create new record
      const { data: balanceData, error: balanceError } = await supabase
        .from('user_balance')
        .select('balance')
        .eq('user_id', userId)
        .single();

      if (balanceError && balanceError.code !== 'PGRST116') {
        console.error('Error fetching balance:', balanceError);
        return res.status(500).json({ error: 'Failed to fetch balance' });
      }

      const currentBalance = balanceData?.balance || 0;
      const newBalance = currentBalance + amount;

      if (balanceData) {
        // Update existing balance
        const { error: updateBalanceError } = await supabase
          .from('user_balance')
          .update({
            balance: newBalance,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId);

        if (updateBalanceError) {
          console.error('Error updating balance:', updateBalanceError);
          return res.status(500).json({ error: 'Failed to update balance' });
        }
      } else {
        // Create new balance record
        const { error: createBalanceError } = await supabase
          .from('user_balance')
          .insert({
            user_id: userId,
            balance: newBalance,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

        if (createBalanceError) {
          console.error('Error creating balance:', createBalanceError);
          return res.status(500).json({ error: 'Failed to create balance' });
        }
      }

      console.log(`Successfully added $${amount} to user ${userId} balance. New balance: $${newBalance}`);
    }

    console.log(`Webhook processed successfully. Payment ${invoiceId} status: ${paymentStatus}`);
    res.json({ success: true, status: paymentStatus });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Payment server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log('Allowed CORS origins:', allowedOrigins);
}); 
