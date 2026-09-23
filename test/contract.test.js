const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const request = require('supertest');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const app = require('../server');

const spec = yaml.load(
    fs.readFileSync(path.join(__dirname, '..', 'payflow.yaml'), 'utf8')
);

const ajv = new Ajv({ strict: false });
addFormats(ajv);

// Register every component schema so $ref: '#/components/schemas/X' resolves.
for (const [name, schema] of Object.entries(spec.components.schemas)) {
    ajv.addSchema(schema, `#/components/schemas/${name}`);
}

function validateAgainst(schemaName, payload) {
    const validate = ajv.getSchema(`#/components/schemas/${schemaName}`);
    const valid = validate(payload);
    return { valid, errors: validate.errors };
}

describe('POST /v2/payments contract', () => {
    it('a successful response matches the Payment schema in payflow.yaml', async () => {
        const res = await request(app)
            .post('/v2/payments')
            .set('Authorization', 'Bearer sk_test_123')
            .send({ amount: 4999, currency: 'gbp', customer_id: 'cus_9KZFXWr' });

        expect(res.status).toBe(200);

        const { valid, errors } = validateAgainst('Payment', res.body);
        expect(errors).toBeNull();
        expect(valid).toBe(true);
    });

    it('a missing-parameter response matches the Error schema in payflow.yaml', async () => {
        const res = await request(app)
            .post('/v2/payments')
            .set('Authorization', 'Bearer sk_test_123')
            .send({ currency: 'gbp' });

        expect(res.status).toBe(400);

        const { valid, errors } = validateAgainst('Error', res.body);
        expect(errors).toBeNull();
        expect(valid).toBe(true);
    });

    it('a request without a bearer token matches the Error schema and is rejected with 401 no_api_key', async () => {
        const res = await request(app)
            .post('/v2/payments')
            .send({ amount: 4999, currency: 'gbp', customer_id: 'cus_9KZFXWr' });

        expect(res.status).toBe(401);
        expect(res.body.error).toBe('no_api_key');

        const { valid, errors } = validateAgainst('Error', res.body);
        expect(errors).toBeNull();
        expect(valid).toBe(true);
    });

    it('an invalid currency is rejected as invalid_param', async () => {
        const res = await request(app)
            .post('/v2/payments')
            .set('Authorization', 'Bearer sk_test_123')
            .send({ amount: 4999, currency: 'zzz', customer_id: 'cus_9KZFXWr' });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('invalid_param');

        const { valid, errors } = validateAgainst('Error', res.body);
        expect(errors).toBeNull();
        expect(valid).toBe(true);
    });

    it('a sandbox test customer_id simulates a card decline', async () => {
        const res = await request(app)
            .post('/v2/payments')
            .set('Authorization', 'Bearer sk_test_123')
            .send({ amount: 4999, currency: 'gbp', customer_id: 'cus_declined_1' });

        expect(res.status).toBe(402);
        expect(res.body.error).toBe('card_declined');

        const { valid, errors } = validateAgainst('Error', res.body);
        expect(errors).toBeNull();
        expect(valid).toBe(true);
    });

    it('replaying an Idempotency-Key with a different body returns 409 idempotency_conflict', async () => {
        const idempotencyKey = `test-key-${Date.now()}`;

        const first = await request(app)
            .post('/v2/payments')
            .set('Authorization', 'Bearer sk_test_123')
            .set('Idempotency-Key', idempotencyKey)
            .send({ amount: 4999, currency: 'gbp', customer_id: 'cus_9KZFXWr' });
        expect(first.status).toBe(200);

        const conflict = await request(app)
            .post('/v2/payments')
            .set('Authorization', 'Bearer sk_test_123')
            .set('Idempotency-Key', idempotencyKey)
            .send({ amount: 1000, currency: 'gbp', customer_id: 'cus_9KZFXWr' });

        expect(conflict.status).toBe(409);
        expect(conflict.body.error).toBe('idempotency_conflict');

        const { valid, errors } = validateAgainst('Error', conflict.body);
        expect(errors).toBeNull();
        expect(valid).toBe(true);
    });

    it('replaying an Idempotency-Key with the same body returns the original response', async () => {
        const idempotencyKey = `test-key-replay-${Date.now()}`;
        const payload = { amount: 2500, currency: 'gbp', customer_id: 'cus_9KZFXWr' };

        const first = await request(app)
            .post('/v2/payments')
            .set('Authorization', 'Bearer sk_test_123')
            .set('Idempotency-Key', idempotencyKey)
            .send(payload);

        const replay = await request(app)
            .post('/v2/payments')
            .set('Authorization', 'Bearer sk_test_123')
            .set('Idempotency-Key', idempotencyKey)
            .send(payload);

        expect(replay.status).toBe(200);
        expect(replay.body).toEqual(first.body);
    });
});

describe('GET /v2/payments/:id contract', () => {
    it('retrieves a payment created via POST and matches the Payment schema', async () => {
        const created = await request(app)
            .post('/v2/payments')
            .set('Authorization', 'Bearer sk_test_123')
            .send({ amount: 4999, currency: 'gbp', customer_id: 'cus_9KZFXWr' });

        const res = await request(app)
            .get(`/v2/payments/${created.body.id}`)
            .set('Authorization', 'Bearer sk_test_123');

        expect(res.status).toBe(200);
        expect(res.body).toEqual(created.body);

        const { valid, errors } = validateAgainst('Payment', res.body);
        expect(errors).toBeNull();
        expect(valid).toBe(true);
    });

    it('an unknown payment id returns 404 resource_not_found matching the Error schema', async () => {
        const res = await request(app)
            .get('/v2/payments/pay_doesnotexist')
            .set('Authorization', 'Bearer sk_test_123');

        expect(res.status).toBe(404);
        expect(res.body.error).toBe('resource_not_found');

        const { valid, errors } = validateAgainst('Error', res.body);
        expect(errors).toBeNull();
        expect(valid).toBe(true);
    });
});
