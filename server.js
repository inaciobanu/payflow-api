const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Enable JSON parsing middleware so the server can read request data
app.use(express.json());

// 🔌 1. The OpenAPI Schema Endpoint
// This serves your raw specification file dynamically
app.get('/openapi.yaml', (req, res) => {
    res.sendFile(__dirname + '/payflow.yaml');
});

// 💳 2. The Payments Endpoint
// This matches the exact payload structure shown on your portfolio intro page!
app.post('/v2/payments', (req, res) => {
    const { amount, currency, customer_id, description } = req.body;

    // Validate that the mandatory parameters exist
    if (!amount || !currency || !customer_id) {
        return res.status(400).json({
            error: "bad_request",
            message: "Missing required parameters: amount, currency, and customer_id are mandatory."
        });
    }

    // Return the successful JSON response block defined in your spec
    res.status(200).json({
        id: "pay_" + Math.random().toString(36).substring(2, 10), // Generates a dummy transaction ID
        status: "succeeded",
        amount: amount,
        currency: currency.toLowerCase(),
        created: new Date().toISOString() // Outputs standard ISO 8601 timeline format
    });
});

// Fire up the engine listener (skip when required by tests)
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`🚀 PayFlow Core API running on port ${PORT}`);
    });
}

module.exports = app;