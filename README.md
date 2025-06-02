# Beeline Payment Server

Payment processing backend for Beeline proxy service using CoinPayments V2 API.

## Features

- ✅ CoinPayments V2 API integration
- ✅ USDT.TRC20 payments
- ✅ Supabase database integration
- ✅ Webhook payment notifications
- ✅ Automatic balance updates
- ✅ CORS protection
- ✅ Health monitoring

## Railway Deployment

### 1. Prerequisites

- Railway account ([sign up here](https://railway.app))
- CoinPayments merchant account
- Supabase project

### 2. Deploy to Railway

1. **Connect your repository** to Railway
2. **Set environment variables** in Railway dashboard:

```env
# Required Environment Variables
FRONTEND_URL=https://your-frontend-domain.com
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
COINPAYMENTS_CLIENT_ID=your-coinpayments-client-id
COINPAYMENTS_CLIENT_SECRET=your-coinpayments-client-secret
```

3. **Deploy** - Railway will automatically build and deploy

### 3. Post-Deployment Setup

1. **Get your Railway domain** (e.g., `https://your-app.railway.app`)
2. **Update CoinPayments webhook URL** in your merchant dashboard to:
   ```
   https://your-app.railway.app/api/payments/coinpayments-webhook
   ```
3. **Update your frontend** to use the Railway domain for API calls

### 4. Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `FRONTEND_URL` | Your frontend application URL | ✅ |
| `SUPABASE_URL` | Your Supabase project URL | ✅ |
| `SUPABASE_ANON_KEY` | Your Supabase anonymous key | ✅ |
| `COINPAYMENTS_CLIENT_ID` | CoinPayments V2 client ID | ✅ |
| `COINPAYMENTS_CLIENT_SECRET` | CoinPayments V2 client secret | ✅ |
| `PORT` | Server port (Railway sets automatically) | ❌ |

### 5. API Endpoints

- `POST /api/payments/create-coinpayments` - Create payment
- `POST /api/payments/coinpayments-webhook` - Webhook handler
- `GET /payment-success` - Payment success redirect
- `GET /payment-cancelled` - Payment cancel redirect
- `GET /health` - Health check

### 6. Database Setup

Make sure these tables exist in your Supabase database:

```sql
-- User balance table
CREATE TABLE user_balance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  balance DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Funding payments table
CREATE TABLE funding_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_id TEXT NOT NULL,
  coinpayments_txn_id TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  crypto_currency TEXT DEFAULT 'USDT.TRC20',
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Local Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy environment variables to `.env`
4. Run: `npm run dev`

## Support

For deployment issues, contact the development team. 