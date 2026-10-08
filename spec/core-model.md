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
points at an entity or a property by its ModelSpec address, and a database's
description names the model it follows. A model points at neither.

## Structural Concepts

ModelSpec has five foundational structural concepts:

| Concept | Purpose |
|---|---|
| Entity | Named structure of typed properties; a key may declare record identity. |
| Component | Reusable group of fields with no independent identity. |
| Enum | Named, reusable controlled vocabulary of values. |
| Collection | Named data source or storage-neutral container projection. |
| Recordset | Tabular result shape for query or procedure output. |

Entity, component, and enum names share one flat namespace per module — the
*referenceable trio* a consumer may address by bare concept name. Collection and
recordset names are separate scopes, addressable only in kind-explicit form. The
five kind tokens (`entities`, `components`, `enums`, `collections`,
`recordsets`) are reserved and forbidden as concept names
([decision 0015](decisions/0015-concept-namespaces-and-reserved-names.md)).

## Entity

An Entity is a named structure: typed properties, an optional key, and references
to other entities. It may embed components. An entity states the shape of a record;
what the record means is stated in MeaningGraph, not here. An entity may declare
record identity with a key; when no key is present, the model makes no claim that
its records have a stable identity.

```hcl
entity "User" {
  key = ["id"]

  property "id" {
    type = "uuid"
  }

  property "email" {
    type     = "string"
    required = true
    unique   = true
    format   = "email"
  }
}
```

An Entity is not itself a table, collection, class, or API resource. It is the shape
those follow, in every database or program that holds the data. An entity can be
written from an existing table, one property per column; the registered models of
SQL databases, such as Chinook, are written that way. An entity can describe rows
from a source table with no declared primary key:

```hcl
entity "Discount" {
  property "discountType" {
    type = "string"
  }

  property "discount" {
    type = "decimal"
  }
}
```

Omitting `key` means the model does not assert stable logical record identity.
It does not describe or rule out primary-key or unique constraints in a physical
source; those belong in the source schema. If a key is present, it must be a
non-empty list of distinct properties (including properties supplied by
components the entity uses).

## Property, Field, And Column

ModelSpec keeps three attribute terms because each layer has a different job:

| Term | Owner | Meaning |
|---|---|---|
| Property | Entity | Named, typed member of an entity. |
| Field | Collection or Component | Storage-neutral data field, including schemaless-capable containers. |
| Column | Recordset | Strict ordered tabular result attribute. |

The distinction is intentional. A storage field or query result column may bind back
to an entity property, but the local attribute remains the primary representation for
its layer.

## Component

A Component is a reusable, named group of fields embedded into entities or other
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

entity "Invoice" {
  key = ["id"]
  use = ["Auditable"]

  property "id" {
    type = "uuid"
  }

  property "total" {
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

## Enum

An Enum is a named, reusable controlled vocabulary. It gives value lists a stable,
addressable identity so they can be shared across entities, components, and
collections, and referenced by adjacent specifications and generators.

```hcl
enum "BookingStatus" {
  values = ["requested", "confirmed", "cancelled"]
}

entity "Booking" {
  key = ["id"]

  property "id" {
    type = "uuid"
  }

  property "status" {
    type = "string"
    enum = "BookingStatus"
  }
}
```

The inline `enum` constraint (a literal value list on a single property) remains
valid for single-use vocabularies. A property references a named enum by name; the
named form is preferred whenever a vocabulary is reused or needs to be addressable.

Named enums cover data vocabularies. Lifecycle states of a domain concept — where
transitions and their semantics matter — belong to the domain-semantics layer
(GraphSpec), not to ModelSpec. See
[decision 0013](decisions/0013-named-enums.md).

## Relationships

Relationships are associations between entities. A property can reference another
entity when the relationship is represented as part of the entity model.

```hcl
entity "Order" {
  key = ["id"]

  property "id" {
    type = "uuid"
  }

  property "user" {
    entity   = "User"
    required = true
  }
}
```

Backends decide whether this becomes a foreign key, document reference, nested path,
edge table, or another physical representation.

Entity-reference properties are the canonical structural relationships of a model.
Graph-oriented consumers (such as GraphSpec tooling) may derive edges from them;
relationships that carry semantics beyond a typed reference — role metadata,
cardinality constraints, lifecycle — are declared in the domain-semantics layer, not
duplicated here.

Reference attributes (`entity`, `component`, `enum`, and `use` entries) accept
**module-qualified names** for read-only cross-module references
([decision 0014](decisions/0014-module-qualified-references.md)):

```hcl
property "space" {
  entity   = "core.Space"
  required = true
}

property "timeWindow" {
  component = "calendarius.TimeWindow"
  required  = true
}
```

Bare names remain same-module references. Qualified references never modify or
extend the referenced concept, and they imply a dependency of the referencing module
on the referenced module. Resolution of module names is consumer-provided; ModelSpec
defines the syntax and semantics only.

## Collection

A Collection is a named data source. It may represent stored records or a computed
view. ModelSpec does not require every entity to map one-to-one to a collection.

```hcl
collection "users" {
  kind   = "editable"
  source = "User"

  field "id" {
    type = "uuid"
    bind = "User.id"
  }

  field "email" {
    type = "string"
    bind = "User.email"
  }
}

collection "active_users" {
  kind  = "computed"
  query = "from users where active"
}
```

The `query` value is carried behind an opaque seam. DTQL is the intended query
metadata model, but ModelSpec does not depend on a concrete DTQL implementation.

## Recordset

A Recordset describes a strict ordered tabular result, such as a query result or
procedure output.

```hcl
recordset "user_summary" {
  key = ["userId"]

  column "userId" {
    type = "uuid"
    bind = "User.id"
  }

  column "orderCount" {
    type   = "int"
    source = "count(orders)"
  }
}
```

Recordsets are useful for query typing, GraphQL resolver output, reporting, and DALGO
metadata. They are not required to be stored.

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

Constraints are validation rules on values. Backend-specific tuning belongs in
projections.

## Indexes

Indexes are part of the application data model when they express lookup requirements
or uniqueness constraints. Backend-specific index syntax remains a projection detail.

The `index` block below is shown by example. Its attributes are not defined, the JSON
format has no place for an entity's indexes, and the reference CLI records the block
without reading its content.

```hcl
entity "User" {
  key = ["id"]

  index "user_email_unique" {
    properties = ["email"]
    unique     = true
  }
}
```

## Validation

A ModelSpec document must be validatable. Validation should report located errors for:

- unresolved references
- duplicate names within a concept kind
- invalid keys (for example, an empty key, repeated property, or a key that names no property)
- invalid types
- invalid constraints
- invalid projection references
- incompatible migration metadata

SpecScore may run those checks, but ModelSpec defines what the checks mean.
