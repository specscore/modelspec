# Schemas

JSON Schemas for the ModelSpec JSON serialization
([spec/json-format.md](../spec/json-format.md),
[decision 0010](../spec/decisions/0010-json-schema-publication.md)).

This repository is the source of truth for the schema files. The website publishes
the same bytes at stable URLs.

| File | Stable URL | Purpose |
|---|---|---|
| `modelspec-ast-1.0-draft-2.schema.json` | `https://modelspec.org/schema/modelspec-ast-1.0-draft-2.schema.json` | The `1.0-draft-2` vocabulary: `records`, `fields`, `record`. |
| `modelspec-ast-1.0-draft.schema.json` | `https://modelspec.org/schema/modelspec-ast-1.0-draft.schema.json` | The deprecated `1.0-draft` vocabulary: `entities`, `properties`, `entity`. An error in a new or updated model. Kept as the description of a document that a pin names, so that a model pinned in that vocabulary can still be checked. |
| `modelspec-ast.schema.json` | `https://modelspec.org/schema/modelspec-ast.schema.json` | The latest vocabulary. Today it is the `1.0-draft-2` schema under another `$id`. |

The schemas use JSON Schema draft 2020-12.

## What A Schema Does Not Check

A schema describes a document's shape. It does not check that a reference resolves,
that a key names a member, that a name is unique across record types, components and
enums, or that a module-qualified name has a module behind it. A document that
passes a schema is not thereby a valid model; `modelspec lint` checks the rest.

`modelspec lint` treats the model it is asked to check as a new or updated model.
From version 0.3.0 it therefore reports a document in the `1.0-draft` vocabulary as
an error, a pinned one included, when it is named as the model to check. A `1.0-draft` document of a module that is only referred to keeps a warning
([spec/core-model.md](../spec/core-model.md#the-reference-cli)). The `1.0-draft`
schema checks the shape of such a document.

Under both vocabularies a schema refuses the removed fields `collections` and
`recordsets` and the reserved fields `projections` and `migrations`. Other unknown
top-level fields are allowed; an unknown key inside a record type, a component, an
enum or a field is refused. The schemas are written by hand.

## Open Questions

None at this time.
