import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Decision 0010: the website serves the JSON Schemas of the repository's schema/ at stable URLs. A fixture build,
// served the way production serves it (Workers Static Assets), answers /schema/modelspec-ast.schema.json with the schema itself.
const file = readFileSync(new URL('../schema/modelspec-ast.schema.json', import.meta.url), 'utf8');

test('the latest JSON Schema is served at /schema/modelspec-ast.schema.json', async ({ request }) => {
  const response = await request.get('/schema/modelspec-ast.schema.json');
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(JSON.parse(body).$id).toBe('https://modelspec.org/schema/modelspec-ast.schema.json');
  expect(body).toBe(file);
});
