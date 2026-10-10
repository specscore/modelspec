# JSON Format

## Purpose

Define the JSON serialization of the ModelSpec AST.

ModelSpec JSON is a machine-readable serialization for validators, generators, and
consumers. HCL remains the intended authored source format.
Tooling should parse HCL into a ModelSpec AST and serialize that AST to JSON when
machine ingestion or API transport needs it.

## Format Identity

A ModelSpec JSON AST serialization MUST be a JSON object with these top-level fields:

| Field | Required | Purpose |
|---|---|---|
| `modelspec` | Yes | Format identifier and version. |
| `module` | Yes | Module identity and version metadata. |
| `components` | No | Reusable field groups. |
| `enums` | No | Named controlled vocabularies. |
| `records` | No | Record types: named structures of typed fields; `key` may declare record identity. |

The `modelspec` field MUST be the string `1.0-draft-2` for this draft serialization.

The identifier tells a reader which vocabulary a document holds. The earlier
identifier, `1.0-draft`, is deprecated. It is an error in a document that is being
written or registered. It is still read in a document that a pin names, and in a
document that is read only to resolve a reference; see
[The 1.0-draft Vocabulary](#the-10-draft-vocabulary).

## Module Metadata

The `module` object identifies the published model:

```json
{
  "modelspec": "1.0-draft-2",
  "module": {
    "id": "github.com/acme/todo",
    "name": "Todo",
    "version": "0.1.0"
  }
}
```

`module.id` should be stable and globally meaningful. `module.version` should identify
an immutable published model version.

## Components

Components are keyed by component name:

```json
{
  "components": {
    "Auditable": {
      "fields": {
        "createdAt": {
          "type": "datetime",
          "required": true
        },
        "updatedAt": {
          "type": "datetime",
          "required": true
        }
      }
    }
  }
}
```

## Enums

Named enums are keyed by enum name:

```json
{
  "enums": {
    "BookingStatus": {
      "values": ["requested", "confirmed", "cancelled"]
    }
  }
}
```

A field references a named enum through its `enum` setting; a literal value list
in that setting remains valid for single-use vocabularies.

## Records

Record types are keyed by name:

```json
{
  "records": {
    "User": {
      "key": ["id"],
      "use": ["Auditable"],
      "fields": {
        "id": {
          "type": "uuid"
        },
        "email": {
          "type": "string",
          "required": true,
          "unique": true,
          "format": "email"
        }
      }
    }
  }
}
```

A record type's `key` is optional. When it is omitted, the model does not assert
stable logical identity for its records; this does not describe or
rule out primary-key or unique constraints in a physical source schema. When
present, the key must be a non-empty list of distinct field names (including
fields supplied by components the record type uses).

Field objects MUST use exactly one of:

- `type` for primitive types
- `component` for embedded component values
- `record` for a reference to another record type

Record types, components, enums, and fields use object maps because names are unique
and order is not semantic.

## The 1.0-draft Vocabulary

A document whose `modelspec` field is `1.0-draft` uses the vocabulary of the earlier
draft ([decision 0018](decisions/0018-entity-becomes-record.md),
[decision 0020](decisions/0020-field-is-the-member-word.md)).

| In `1.0-draft` | In `1.0-draft-2` |
|---|---|
| top-level `entities` | top-level `records` |
| `properties` of an entity | `fields` of a record type |
| member key `entity` | member key `record` |

The identifier decides the vocabulary. A `1.0-draft-2` document that carries a
`1.0-draft` key, or a `1.0-draft` document that carries a `1.0-draft-2` key, is an
error. Components use `fields` under both identifiers.

The rules of [core-model.md](core-model.md#deprecated-spellings) hold for JSON as
they do for HCL:

- A document that is being written, changed or registered is not valid under the
  identifier `1.0-draft`, and a checker of such a document reports the identifier as
  an error. The reference CLI MUST report it. Every other checker SHOULD, and
  follows by its own decision;
  [core-model.md](core-model.md#checkers-that-do-not-report-the-error) names the
  checkers known not to report it.
- A reader of a document that a pin names MUST accept `1.0-draft` and read each key
  as the one that replaced it in the table above, for as long as the pin stands. It
  SHOULD report that the identifier is deprecated. That report is not an error.
- A `1.0-draft` document that is read only to resolve a reference from the model
  being checked MUST NOT make that model invalid, whether or not a pin names the
  document. A checker SHOULD report the identifier as a warning, against the file
  that holds it.
- Any other reader MAY accept `1.0-draft`. One that accepts it reads each key as the
  one that replaced it in the table above.

```json
{
  "modelspec": "1.0-draft",
  "module": { "id": "github.com/acme/billing", "version": "0.2.0" },
  "entities": {
    "Invoice": {
      "key": ["id"],
      "properties": {
        "id": { "type": "uuid" },
        "customer": { "entity": "Customer" }
      }
    },
    "Customer": {
      "key": ["id"],
      "properties": {
        "id": { "type": "uuid" }
      }
    }
  }
}
```

Offered as a new or updated model, this document is an error: its identifier is
`1.0-draft`. Written under `1.0-draft-2` with `records`, `fields` and `record`, it is
valid. Named by a pin, the same bytes are read as two record types: `Invoice`, with
the fields `id` and `customer`, the second a reference to the record type
`Customer`; and `Customer`, with the field `id`. Supplied only so that another
model's reference to the record type `Customer` resolves, they are read in the same
way, and the other model is not made invalid by the identifier.

This section and the schema `schema/modelspec-ast-1.0-draft.schema.json` remain the
description of the `1.0-draft` form, for the documents that a pin names and the
documents that are read only to resolve a reference.

A serializer writes `1.0-draft-2` for a source in the current spelling. A source
that holds a deprecated spelling is not valid as a new or updated model, so the
reference CLI's release that follows 0.2.0 (expected as 0.3.0) refuses to export it,
with `modelspec export`, with `--out` and with `--check`. The source is rewritten
first, with `modelspec rewrite --write`, and exported then.

From the same release, `modelspec export --check` compares the committed copy with
what `modelspec export` writes, the identifier included. A `1.0-draft` copy of a
source that exports as `1.0-draft-2` is reported as not what the source exports to,
also for a model with no record type.

## Removed And Reserved Fields

The top-level fields `collections` and `recordsets` are removed, and `projections` and
`migrations` are reserved with no content. A document that carries any of the four is
an error, under either identifier
([decision 0019](decisions/0019-collection-and-recordset-removed-three-words-reserved.md)).

## Validation Requirements

A validator consuming the JSON AST serialization MUST check:

- `modelspec` is present and supported. `1.0-draft-2` is supported.
  [The 1.0-draft Vocabulary](#the-10-draft-vocabulary) says where `1.0-draft` is
  read and where it is an error.
- `module.id` and `module.version` are present.
- component, enum, and record type names are unique within their object maps, and
  across the three: they share one namespace.
- no concept is named with a reserved name.
- field names are unique within their record type or component, and no name is blank.
- each field has exactly one of `type`, `component` and `record`.
- a `key` is a non-empty list of distinct names of fields of its record type.
- enum value lists are non-empty and free of duplicate values.
- a reference is a concept name, or `<module>.<Name>` with exactly one dot
  ([decision 0014](decisions/0014-module-qualified-references.md)).
- references resolve, including `use`, `component`, `enum`, and `record`.
  Module-qualified references are preserved verbatim in the serialization
  and MUST resolve within the consumer-provided module set; an unknown module is the
  same diagnostic class as an unresolved bare name.
- primitive types are in the supported type set.
- constraints use supported keys and valid value types.
- every key belongs to the vocabulary that the identifier names.
- no removed or reserved top-level field is present.

## JSON Schema Publication

The JSON Schemas of this serialization are published in this repository under
`schema/` ([decision 0010](decisions/0010-json-schema-publication.md)):

- `schema/modelspec-ast-1.0-draft-2.schema.json`, for the `1.0-draft-2` vocabulary
- `schema/modelspec-ast-1.0-draft.schema.json`, for the deprecated `1.0-draft`
  vocabulary, so that a model pinned in that vocabulary can still be checked
- `schema/modelspec-ast.schema.json`, the latest, which is the `1.0-draft-2` schema
  today

The website exposes stable copies at:

- `https://modelspec.org/schema/modelspec-ast-1.0-draft-2.schema.json`
- `https://modelspec.org/schema/modelspec-ast-1.0-draft.schema.json`
- `https://modelspec.org/schema/modelspec-ast.schema.json`

The repository copy is the source of truth. Website URLs are stable distribution
endpoints for tools and documentation.

A JSON Schema describes a document's shape. It cannot say that a reference resolves or
that a key names a field, so a document that passes the schema is not thereby a valid
model.

The schemas also fix four points of shape that the reference reader enforces: a name
is not blank; an enum's values are strings or integers; `module.name`, when present,
is not empty; and an unknown key is refused inside a record type, a component, an
enum and a field, while an unknown top-level field is allowed.

## Open Questions

None at this time.
