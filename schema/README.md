# Schemas

JSON Schemas for the ModelSpec JSON serialization
([spec/json-format.md](../spec/json-format.md),
[decision 0010](../spec/decisions/0010-json-schema-publication.md)).

This repository retains the schema source. MeaningGraph publishes the current
DataModel schema with its own `$id`, title and description; the validation object
is unchanged. Historical source copies keep their original `$id` values.

| Source file | Current distribution | Purpose |
|---|---|---|
| `modelspec-ast-1.0-draft-2.schema.json` | `https://meaninggraph.io/schema/datamodel-ast-1.0-draft-2.schema.json` | The current `1.0-draft-2` vocabulary: `records`, `fields`, `record`. |
| `modelspec-ast-1.0-draft.schema.json` | Repository-only; use a pinned Git commit | Deprecated `1.0-draft` shape for retained documents. |
| `modelspec-ast.schema.json` | `https://meaninggraph.io/schema/datamodel-ast.schema.json` | Current vocabulary alias. |

ModelSpec.org schema URLs are retired by the clean website redirect cutover;
they now resolve to an HTML MeaningGraph page, not a machine schema.

The schemas use JSON Schema draft 2020-12.

## What A Schema Does Not Check

A schema describes a document's shape. It does not check that a reference resolves,
that a key names a member, that a name is unique across record types, components and
enums, or that a module-qualified name has a module behind it. A document that
passes a schema is not thereby a valid model; `modelspec lint` checks the rest.

`modelspec lint` treats the model it is asked to check as a new or updated model.
From version 0.3.0 of the reference CLI it
therefore reports a document in the `1.0-draft` vocabulary as an error, a pinned one
included, when it is named as the model to check. A `1.0-draft` document of a module
that is only referred to keeps a warning
([spec/core-model.md](../spec/core-model.md#the-reference-cli)). The `1.0-draft`
schema checks the shape of such a document.

Under both vocabularies a schema refuses the removed fields `collections` and
`recordsets` and the reserved fields `projections` and `migrations`. Other unknown
top-level fields are allowed; an unknown key inside a record type, a component, an
enum or a field is refused. The schemas are written by hand.

## Open Questions

None at this time.
