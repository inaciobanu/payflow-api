const crypto = require('crypto');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

const SUPPORTED_CURRENCIES = ['gbp', 'usd', 'eur'];

// Sandbox-only trigger values, documented in payflow.yaml's 402 response.
const CARD_ERROR_PREFIXES = {
    cus_declined: { error: 'card_declined', message: 'The card was declined by the issuing bank.' },
    cus_insufficient: { error: 'insufficient_funds', message: 'The card has insufficient funds.' },
    cus_expired: { error: 'expired_card', message: 'The card expiry date has passed.' },
    cus_cvc: { error: 'incorrect_cvc', message: 'The CVC number is incorrect.' },
    cus_processing: { error: 'processing_error', message: 'An error occurred while processing the card.' }
};

// In-memory stores for the mock — reset whenever the process restarts.
const payments = new Map();
const idempotencyKeys = new Map();

// Enable JSON parsing middleware so the server can read request data
app.use(express.json());

// 🔌 1. The OpenAPI Schema Endpoint
// This serves your raw specification file dynamically
app.get('/openapi.yaml', (req, res) => {
    res.sendFile(__dirname + '/payflow.yaml');
});

// 🔐 Require a Bearer API key on every /v2 route, per the spec's bearerAuth security scheme
app.use('/v2', (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            error: "no_api_key",
            message: "No API key was provided in the request."
        });
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({
            error: "invalid_api_key",
            message: "The API key provided is not valid."
        });
    }

    next();
});

// 💳 2. The Payments Endpoint
// This matches the exact payload structure shown on your portfolio intro page!
app.post('/v2/payments', (req, res) => {
    const { amount, currency, customer_id, description } = req.body;

    // Validate that the mandatory parameters exist
    if (!amount || !currency || !customer_id) {
        return res.status(400).json({
            error: "missing_param",
            message: "A required parameter was not provided."
        });
    }

    if (!SUPPORTED_CURRENCIES.includes(currency.toLowerCase())) {
        return res.status(400).json({
            error: "invalid_param",
            message: "A parameter value is invalid."
        });
    }

    // Sandbox card-error simulation, keyed off a test customer_id prefix
    const cardError = Object.entries(CARD_ERROR_PREFIXES)
        .find(([prefix]) => customer_id.startsWith(prefix));
    if (cardError) {
        return res.status(402).json(cardError[1]);
    }

    const idempotencyKey = req.headers['idempotency-key'];
    const bodyHash = crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex');

    if (idempotencyKey) {
        const existing = idempotencyKeys.get(idempotencyKey);
        if (existing) {
            if (existing.bodyHash !== bodyHash) {
                return res.status(409).json({
                    error: "idempotency_conflict",
                    message: "A request with this idempotency key already exists with different parameters."
                });
            }
            return res.status(200).json(existing.response);
        }
    }

    const payment = {
        id: "pay_" + Math.random().toString(36).substring(2, 10), // Generates a dummy transaction ID
        object: "payment",
        status: "succeeded",
        amount: amount,
        currency: currency.toLowerCase(),
        created: new Date().toISOString() // Outputs standard ISO 8601 timeline format
    };

    payments.set(payment.id, payment);
    if (idempotencyKey) {
        idempotencyKeys.set(idempotencyKey, { bodyHash, response: payment });
    }

    res.status(200).json(payment);
});

// 🔍 3. Retrieve a Payment
app.get('/v2/payments/:id', (req, res) => {
    const payment = payments.get(req.params.id);

    if (!payment) {
        return res.status(404).json({
            error: "resource_not_found",
            message: "The requested resource ID does not exist."
        });
    }

    res.status(200).json(payment);
});

// Fire up the engine listener (skip when required by tests)
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`🚀 PayFlow Core API running on port ${PORT}`);
    });
}

module.exports = app;