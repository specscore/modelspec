# Core Model

## Purpose

Define the core ModelSpec language for logical application data models.

## Shape, Not Meaning

ModelSpec answers one question about data: what shape it has. Two adjacent open
formats answer the other two
([decision 0017](decisions/0017-one-question-per-layer.md)):

| Question | Answered by | Example |
|---|---|---|
| What does the data mean? | MeaningGraph | What an invoice is, and what it is called in another language. |
| What shape does it have? | ModelSpec | An `Invoice` has a `total` of type `decimal`, a key, and a reference to a `Customer`. |
| Where is it? | OpenVaultDB | Which database holds invoice rows, in which table, and how to reach it. |

A model declares names, types, keys, and references. It does not say what a name
means, and it does not say which database holds the data. A MeaningGraph meaning file
points at a record type or a field by its ModelSpec address, and a database's
description names the model it follows. A model points at neither.

## Structural Concepts

ModelSpec has three structural concepts:

| Concept | Keyword | Purpose |
|---|---|---|
| Record type | `record` | Named structure of typed fields; a key may declare record identity. |
| Component | `component` | Reusable group of fields with no independent identity. |
| Enum | `enum` | Named, reusable controlled vocabulary of values. |

The keyword is `record`. In prose the declaration is called a record type, because a
record is also one row of data.

Record type, component, and enum names share one flat namespace per module, so a
consumer may address any of them by bare concept name
([decision 0015](decisions/0015-concept-namespaces-and-reserved-names.md)). Six kind
tokens are reserved and forbidden as concept names: `records`, `entities`,
`components`, `enums`, `collections`, and `recordsets`.

Earlier drafts spelled the keywords differently, and declared two more concepts.
See [Deprecated Spellings](#deprecated-spellings) and
[Removed Constructs And Reserved Words](#removed-constructs-and-reserved-words).

## Record Type

A record type is a named structure: typed fields, an optional key, and references to
other record types. It may embed components. A record type states the shape of a
record; what the record means is stated in MeaningGraph, not here. A record type may
declare record identity with a key; when no key is present, the model makes no claim
that its records have a stable identity.

```hcl
record "User" {
  key = ["id"]

  field "id" {
    type = "uuid"
  }

  field "email" {
    type     = "string"
    required = true
    unique   = true
    format   = "email"
  }
}
```

A record type is not itself a table, collection, class, or API resource. It is the
shape those follow, in every database or program that holds the data. A record type
can be written from an existing table, one field per column; the registered models
of SQL databases, such as Chinook, are written that way. A record type can describe
rows from a source table with no declared primary key, and the shape of a view or a
query result:

```hcl
record "Discount" {
  field "discountType" {
    type = "string"
  }

  field "discount" {
    type = "decimal"
  }
}
```

Omitting `key` means the model does not assert stable logical record identity.
It does not describe or rule out primary-key or unique constraints in a physical
source; those belong in the source schema. If a key is present, it must be a
non-empty list of distinct fields (including fields supplied by components the
record type uses).

## Field

A field is a named, typed member. Record types and components both have fields, and
`field` is the only word ModelSpec uses for a member
([decision 0020](decisions/0020-field-is-the-member-word.md)).

A field has exactly one of:

- `type`, a primitive type from the [type system](#type-system);
- `component`, the name of a component whose value it holds;
- `record`, the name of a record type it refers to.

A field's name is unique within its record type or component.

The word changes with the level. The member of a MeaningGraph entity is not a field,
and neither is a column of a database's recordset: a field is the member of a
ModelSpec record type or component, and nothing else.

## Component

A Component is a reusable, named group of fields embedded into record types or other
structured values. Components model composition, not inheritance.

```hcl
component "Auditable" {
  field "createdAt" {
    type     = "datetime"
    required = true
  }

  field "updatedAt" {
    type     = "datetime"
    required = true
  }
}

component "CurrencyAmount" {
  field "amount" {
    type     = "decimal"
    required = true
  }

  field "currency" {
    type     = "string"
    required = true
  }
}

record "Invoice" {
  key = ["id"]
  use = ["Auditable"]

  field "id" {
    type = "uuid"
  }

  field "total" {
    component = "CurrencyAmount"
  }
}
```

This is intentionally close to Go struct embedding: reusable building blocks compose
into larger models without creating deep inheritance trees.

Components are also ModelSpec's value-object mechanism: an immutable concept without
identity — Money, Address, DateRange, GeoLocation — is modelled as a component and
embedded wherever it is used. Adjacent specifications (such as GraphSpec) reference
ModelSpec components rather than defining a separate value-object concept.

A component's values live inside their owner. Rows of a record type stand alone.
That is the difference between a component and a record type with no key.

## Enum

An Enum is a named, reusable controlled vocabulary. It gives value lists a stable,
addressable identity so they can be shared across record types and components, and
referenced by adjacent specifications and generators.

```hcl
enum "BookingStatus" {
  values = ["requested", "confirmed", "cancelled"]
}

record "Booking" {
  key = ["id"]

  field "id" {
    type = "uuid"
  }

  field "status" {
    type = "string"
    enum = "BookingStatus"
  }
}
```

The inline `enum` constraint (a literal value list on a single field) remains
valid for single-use vocabularies. A field references a named enum by name; the
named form is preferred whenever a vocabulary is reused or needs to be addressable.

An enum is closed: it lists the spellings one model accepts. What the values mean is
not stated here.

Named enums cover data vocabularies. Lifecycle states of a domain concept — where
transitions and their semantics matter — belong to the domain-semantics layer
(GraphSpec), not to ModelSpec. See
[decision 0013](decisions/0013-named-enums.md).

## References

A reference is a field that refers to another record type: its `record` setting names
that type.

```hcl
record "Order" {
  key = ["id"]

  field "id" {
    type = "uuid"
  }

  field "user" {
    record   = "User"
    required = true
  }
}
```

A reference is a statement about structure. It holds whether or not a database
declares a foreign key for it, and it can hold between two databases. Backends decide
whether it becomes a foreign key, document reference, nested path, edge table, or
another physical representation.

References are the canonical structural relationships of a model.
Graph-oriented consumers (such as GraphSpec tooling) may derive edges from them;
relationships that carry semantics beyond a typed reference — role metadata,
cardinality constraints, lifecycle — are declared in the domain-semantics layer, not
duplicated here.

The settings that name another concept (`record`, `component`, `enum`, and `use`
entries) accept **module-qualified names** for read-only cross-module references
([decision 0014](decisions/0014-module-qualified-references.md)):

```hcl
field "space" {
  record   = "core.Space"
  required = true
}

field "timeWindow" {
  component = "calendarius.TimeWindow"
  required  = true
}
```

Bare names remain same-module references. Qualified references never modify or
extend the referenced concept, and they imply a dependency of the referencing module
on the referenced module. Resolution of module names is consumer-provided; ModelSpec
defines the syntax and semantics only.

## Type System

The initial type vocabulary includes:

- `string`
- `int`
- `float`
- `bool`
- `decimal`
- `uuid`
- `date`
- `time`
- `datetime`
- `document`
- `json`
- `any`

Future versions should add localized values, map types, nested document shapes,
value formats, and richer constraints where they describe the data itself rather
than UI or storage implementation details.

## Constraints

Initial constraints include:

- `required`
- `unique`
- `min_len`
- `max_len`
- `pattern`
- `enum`
- `format`

Constraints are validation rules on values.

## Deprecated Spellings

Three spellings from earlier drafts are deprecated
([decision 0018](decisions/0018-entity-becomes-record.md),
[decision 0020](decisions/0020-field-is-the-member-word.md)):

| Deprecated | Write instead |
|---|---|
| `entity "Invoice" { … }` | `record "Invoice" { … }` |
| `property "total" { … }` in a record type | `field "total" { … }` |
| `entity = "Customer"` on a member | `record = "Customer"` |

A reader MUST accept the deprecated spellings and treat each as the word it replaces,
and SHOULD report that the file uses a deprecated spelling. A model in the deprecated
spelling is valid. A published model that is pinned by commit keeps its spelling
for as long as the pin stands.

The reference CLI rewrites a file from the deprecated spelling to the current one
with `modelspec rewrite --write`, changing nothing else in the file. Without
`--write` it reports what it would change.

A deprecated spelling is to become an error once no registered model is pinned in
it. What the owner said about that last step on 9 October 2026, and how it was read,
is in the observed consequences of
[decision 0022](decisions/0022-prose-now-format-change-on-the-owners-word.md). Until
then the paragraph above holds.

## Removed Constructs And Reserved Words

Two constructs of earlier drafts are removed, and three words are reserved
([decision 0019](decisions/0019-collection-and-recordset-removed-three-words-reserved.md)).

| Word | Status | What to do instead |
|---|---|---|
| `collection` | Removed, with its `kind`, `source`, `query` and `bind` settings | A named, stored set of rows is described with the database that holds it, not in the model. |
| `recordset`, `column` | Removed | The shape of a query result or a view is a record type with no key. Column order and repeated column names are facts about one physical result. |
| `projection` | Reserved, no content | A model has no place to suggest where its rows are stored. |
| `index` | Reserved, no content | A model declares uniqueness with the `unique` constraint and identity with `key`. |
| `migration` | Reserved, no content | See [migration-metadata.md](migration-metadata.md). |

A reader MUST refuse a model that declares a removed construct or uses a reserved
word as a block. The reserved words are kept free so that a later version can define
them.

## Validation

A ModelSpec document must be validatable. Validation should report located errors for:

- unresolved references
- duplicate names within a scope
- invalid keys (for example, an empty key, repeated field, or a key that names no field)
- invalid types
- invalid constraints
- a field with none, or more than one, of `type`, `component` and `record`
- removed constructs and reserved words

Validation should also report, without making the model invalid, a deprecated
spelling.

SpecScore may run those checks, but ModelSpec defines what the checks mean.
