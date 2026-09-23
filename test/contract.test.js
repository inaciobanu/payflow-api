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
            .send({ amount: 4999, currency: 'gbp', customer_id: 'cus_9KZFXWr' });

        expect(res.status).toBe(200);

        const { valid, errors } = validateAgainst('Payment', res.body);
        expect(errors).toBeNull();
        expect(valid).toBe(true);
    });

    it('a missing-parameter response matches the Error schema in payflow.yaml', async () => {
        const res = await request(app)
            .post('/v2/payments')
            .send({ currency: 'gbp' });

        expect(res.status).toBe(400);

        const { valid, errors } = validateAgainst('Error', res.body);
        expect(errors).toBeNull();
        expect(valid).toBe(true);
    });
});
