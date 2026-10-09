// The JSON Schemas of the ModelSpec JSON form (schema/, published at https://modelspec.org/schema/, decision 0010),
// checked as JSON Schema 2020-12 with ajv. A schema describes shape only; these tests pin the shape the
// specification (spec/json-format.md) gives: what each vocabulary accepts and what it refuses.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import { REPO } from './helpers.mjs';

const DRAFT_2 = 'modelspec-ast-1.0-draft-2.schema.json';
const DRAFT = 'modelspec-ast-1.0-draft.schema.json';
const LATEST = 'modelspec-ast.schema.json';
const NAMES = [DRAFT_2, DRAFT, LATEST];
const DIALECT = 'https://json-schema.org/draft/2020-12/schema';

const readJson = path => JSON.parse(readFileSync(join(REPO, path), 'utf8'));
const schemas = Object.fromEntries(NAMES.map(name => [name, readJson(`schema/${name}`)]));

// One Ajv for all three (their $ids differ); strict mode, so an unknown keyword or a typo in a schema is an error.
// One of ajv's style checks is relaxed, and it is not part of JSON Schema: strictRequired (the member schema says "exactly one of
// type, component, record" with `oneOf: [{required: [...]}]` beside `properties`, which that check does not recognise). ajv's
// own default leaves that check off, so a consumer with default options compiles these schemas without a warning.
const ajv = new Ajv2020({ strict: true, strictRequired: false, allErrors: true });
const validators = Object.fromEntries(NAMES.map(name => [name, ajv.compile(schemas[name])]));
const verdict = (name, document) => {
  const validate = validators[name];
  return { valid: validate(document), errors: validate.errors ?? [] };
};
const errorText = errors => errors.map(error => `${error.instancePath || '/'} ${error.keyword}`).join('; ');

/** The vocabularies: which schema checks it, and the words it uses. The latest schema is the 1.0-draft-2 vocabulary. */
const VOCABULARIES = [
  { schema: DRAFT_2, modelspec: '1.0-draft-2', group: 'records', otherGroup: 'entities', fields: 'fields', reference: 'record' },
  { schema: LATEST, modelspec: '1.0-draft-2', group: 'records', otherGroup: 'entities', fields: 'fields', reference: 'record' },
  { schema: DRAFT, modelspec: '1.0-draft', group: 'entities', otherGroup: 'records', fields: 'properties', reference: 'entity' },
];

/** A small valid document in the vocabulary. */
function documentOf(vocabulary) {
  return {
    modelspec: vocabulary.modelspec,
    module: { id: 'example.org/shop', version: '0.1.0' },
    components: { Auditable: { fields: { createdAt: { type: 'datetime', required: true } } } },
    enums: { Colour: { values: ['red', 'green'] } },
    [vocabulary.group]: {
      Customer: {
        key: ['id'],
        use: ['Auditable'],
        [vocabulary.fields]: {
          id: { type: 'uuid' },
          colour: { type: 'string', enum: 'Colour' },
          audit: { component: 'Auditable' },
        },
      },
      Order: {
        key: ['id'],
        [vocabulary.fields]: {
          id: { type: 'uuid' },
          customer: { [vocabulary.reference]: 'Customer', required: true },
        },
      },
    },
  };
}

/** The refusals of shape that spec/json-format.md and schema/README.md state, each as a change to a valid document, with where ajv must object. */
function refusals(vocabulary) {
  const { group, otherGroup, fields, reference } = vocabulary;
  const member = (document, value) => { document[group].Customer[fields].extra = value; };
  const renamed = (document, from, to) => { document[group][to] = document[group][from]; delete document[group][from]; };
  return [
    ['a top-level collections', document => { document.collections = {}; }, /^\/collections false schema/],
    ['a top-level recordsets', document => { document.recordsets = {}; }, /^\/recordsets false schema/],
    ['a top-level projections', document => { document.projections = {}; }, /^\/projections false schema/],
    ['a top-level migrations', document => { document.migrations = {}; }, /^\/migrations false schema/],
    [`the other vocabulary's group key, ${otherGroup}`, document => { document[otherGroup] = {}; }, new RegExp(`^/${otherGroup} false schema`)],
    ['a member with none of type, component and the reference key', document => member(document, { required: true }), new RegExp(`/${group}/Customer/${fields}/extra oneOf`)],
    ['a member with type and component', document => member(document, { type: 'string', component: 'Auditable' }), new RegExp(`/${group}/Customer/${fields}/extra oneOf`)],
    [`a member with type and ${reference}`, document => member(document, { type: 'string', [reference]: 'Order' }), new RegExp(`/${group}/Customer/${fields}/extra oneOf`)],
    [`a member with component and ${reference}`, document => member(document, { component: 'Auditable', [reference]: 'Order' }), new RegExp(`/${group}/Customer/${fields}/extra oneOf`)],
    ['a member with all three', document => member(document, { type: 'string', component: 'Auditable', [reference]: 'Order' }), new RegExp(`/${group}/Customer/${fields}/extra oneOf`)],
    ['a member with an unknown key', document => member(document, { type: 'string', colour: 'red' }), new RegExp(`/${group}/Customer/${fields}/extra additionalProperties`)],
    [`a ${reference} with two dots`, document => member(document, { [reference]: 'a.b.Order' }), new RegExp(`/${group}/Customer/${fields}/extra/${reference} pattern`)],
    [`a ${reference} that ends in a dot`, document => member(document, { [reference]: 'core.' }), new RegExp(`/${group}/Customer/${fields}/extra/${reference} pattern`)],
    ['a member with an unknown primitive type', document => member(document, { type: 'varchar' }), new RegExp(`/${group}/Customer/${fields}/extra/type enum`)],
    [`a ${group} concept named records`, document => renamed(document, 'Order', 'records'), new RegExp(`^/${group} not`)],
    [`a ${group} concept named entities`, document => renamed(document, 'Order', 'entities'), new RegExp(`^/${group} not`)],
    ['a component named records', document => { document.components.records = document.components.Auditable; }, /^\/components not/],
    ['an enum named components', document => { document.enums.components = document.enums.Colour; }, /^\/enums not/],
    ['a concept name with a dot', document => renamed(document, 'Order', 'shop.Order'), new RegExp(`^/${group} pattern`)],
    ['a component name with a dot', document => { document.components['a.b'] = document.components.Auditable; }, /^\/components pattern/],
    ['a blank concept name', document => renamed(document, 'Order', '  '), new RegExp(`^/${group} pattern`)],
    ['an empty member name', document => { document[group].Customer[fields][''] = { type: 'string' }; }, new RegExp(`^/${group}/Customer/${fields} pattern`)],
    ['a blank member name', document => { document[group].Customer[fields]['   '] = { type: 'string' }; }, new RegExp(`^/${group}/Customer/${fields} pattern`)],
    ['an enum with no values', document => { document.enums.Empty = { values: [] }; }, /\/enums\/Empty\/values minItems/],
    ['an enum without values', document => { document.enums.Empty = {}; }, /\/enums\/Empty required/],
    ['an inline enum list with no values', document => member(document, { type: 'string', enum: [] }), new RegExp(`/${group}/Customer/${fields}/extra/enum`)],
    ['an empty key', document => { document[group].Customer.key = []; }, new RegExp(`/${group}/Customer/key minItems`)],
    ['a repeated key member', document => { document[group].Customer.key = ['id', 'id']; }, new RegExp(`/${group}/Customer/key uniqueItems`)],
    ['a document of another vocabulary version', document => { document.modelspec = vocabulary.modelspec === '1.0-draft' ? '1.0-draft-2' : '1.0-draft'; }, /\/modelspec const/],
    ['a document without module', document => { delete document.module; }, /^\/ required/],
    ['a module without a version', document => { delete document.module.version; }, /\/module required/],
    ['a module with a blank id', document => { document.module.id = ''; }, /\/module\/id minLength/],
  ];
}

// ---- the schema files ----

test('the schema directory holds exactly the three schemas and the README', () => {
  assert.deepEqual(readdirSync(join(REPO, 'schema')).sort(), ['README.md', ...NAMES].sort());
});

test('each schema file is JSON Schema 2020-12, compiles, and has the $id of the URL it is published at', () => {
  for (const name of NAMES) {
    const schema = schemas[name];
    assert.equal(schema.$schema, DIALECT, `${name} names the 2020-12 dialect`);
    assert.equal(ajv.validateSchema(schema), true, `${name} is valid against the 2020-12 meta-schema: ${errorText(ajv.errors ?? [])}`);
    assert.equal(typeof validators[name], 'function', `${name} compiles`);
    assert.equal(schema.$id, `https://modelspec.org/schema/${name}`, `${name} $id`);
  }
});

test('the latest schema is the 1.0-draft-2 schema under another $id, and nothing else differs', () => {
  const { $id: latestId, ...latest } = schemas[LATEST];
  const { $id: draft2Id, ...draft2 } = schemas[DRAFT_2];
  assert.notEqual(latestId, draft2Id);
  assert.deepEqual(latest, draft2);
});

test('the deprecated 1.0-draft schema says so', () => {
  assert.equal(schemas[DRAFT].deprecated, true);
  assert.equal(schemas[DRAFT_2].deprecated, undefined);
  assert.equal(schemas[LATEST].deprecated, undefined);
});

// ---- documents ----

test('examples/todo.modelspec.json is valid against the 1.0-draft-2 schema and the latest schema, and invalid against the 1.0-draft schema', () => {
  const todo = readJson('examples/todo.modelspec.json');
  assert.equal(todo.modelspec, '1.0-draft-2');
  for (const name of [DRAFT_2, LATEST]) {
    const { valid, errors } = verdict(name, todo);
    assert.equal(valid, true, `${name}: ${errorText(errors)}`);
  }
  const old = verdict(DRAFT, todo);
  assert.equal(old.valid, false);
  assert.match(errorText(old.errors), /\/modelspec const/, 'it names another vocabulary');
});

test('a small 1.0-draft document is valid against the 1.0-draft schema and invalid against the 1.0-draft-2 schema and the latest schema', () => {
  const old = {
    modelspec: '1.0-draft',
    module: { id: 'example.org/old', version: '0.1.0' },
    entities: {
      Thing: {
        key: ['id'],
        properties: {
          id: { type: 'uuid' },
          owner: { entity: 'Thing' },
        },
      },
    },
  };
  const own = verdict(DRAFT, old);
  assert.equal(own.valid, true, errorText(own.errors));
  for (const name of [DRAFT_2, LATEST]) {
    const { valid, errors } = verdict(name, old);
    assert.equal(valid, false, name);
    assert.match(errorText(errors), /\/modelspec const/, `${name}: the format identifier`);
    assert.match(errorText(errors), /\/entities /, `${name}: the group key`);
  }
});

for (const vocabulary of VOCABULARIES) {
  const label = `${vocabulary.schema} (${vocabulary.modelspec})`;

  test(`${label}: a document in its own vocabulary is valid, and so is one with an unknown top-level field`, () => {
    const document = documentOf(vocabulary);
    const own = verdict(vocabulary.schema, document);
    assert.equal(own.valid, true, errorText(own.errors));
    for (const field of ['x-note', 'notes', 'tags', 'extension']) {
      const extended = verdict(vocabulary.schema, { ...document, [field]: { anything: [1, 2, 3] } });
      assert.equal(extended.valid, true, `${field}: ${errorText(extended.errors)}`);
    }
    const withSchemaRef = verdict(vocabulary.schema, { ...document, $schema: `https://modelspec.org/schema/${vocabulary.schema}` });
    assert.equal(withSchemaRef.valid, true, `$schema: ${errorText(withSchemaRef.errors)}`);
  });

  test(`${label}: each refusal the specification names is refused by this schema`, () => {
    for (const [name, change, where] of refusals(vocabulary)) {
      const document = documentOf(vocabulary);
      change(document);
      const { valid, errors } = verdict(vocabulary.schema, document);
      assert.equal(valid, false, `${name} must be refused`);
      assert.match(errorText(errors), where, `${name}: refused, but at ${errorText(errors)}`);
    }
  });
}

test('every refusal is refused for its own reason: the unchanged document is valid in each vocabulary', () => {
  for (const vocabulary of VOCABULARIES) assert.equal(verdict(vocabulary.schema, documentOf(vocabulary)).valid, true, vocabulary.schema);
});

test('a reference may name a concept whose name holds white space, bare or module-qualified (decision 0014 rules out only the dots)', () => {
  for (const vocabulary of VOCABULARIES) {
    for (const target of ['Order Item', ' Order', 'Order\tItem', 'core.Shared Space', 'core-kit.Space']) {
      const document = documentOf(vocabulary);
      document[vocabulary.group].Customer[vocabulary.fields].extra = { [vocabulary.reference]: target };
      const { valid, errors } = verdict(vocabulary.schema, document);
      assert.equal(valid, true, `${vocabulary.schema}: ${JSON.stringify(target)} must be accepted, got ${valid ? '' : JSON.stringify(errors)}`);
    }
    for (const target of ['.Order', 'core.', 'a.b.Order', '.', ' ', '', 'a. ', ' .a']) {
      const document = documentOf(vocabulary);
      document[vocabulary.group].Customer[vocabulary.fields].extra = { [vocabulary.reference]: target };
      assert.equal(verdict(vocabulary.schema, document).valid, false, `${vocabulary.schema}: ${JSON.stringify(target)} must be refused`);
    }
  }
});
