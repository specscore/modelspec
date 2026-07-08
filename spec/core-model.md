# Core Model

## Purpose

Define the core ModelSpec language for logical application data models.

## Structural Concepts

ModelSpec has four foundational structural concepts:

| Concept | Purpose |
|---|---|
| Entity | Identity-bearing business object and semantic anchor. |
| Component | Reusable group of fields with no independent identity. |
| Collection | Named data source or storage-neutral container projection. |
| Recordset | Tabular result shape for query or procedure output. |

## Entity

An Entity is a logical, identity-bearing business object. It owns canonical
properties, may embed components, and declares identity through keys.

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

An Entity is not a table, collection, class, or API resource. Those are projections.

## Property, Field, And Column

ModelSpec keeps three attribute terms because each layer has a different job:

| Term | Owner | Meaning |
|---|---|---|
| Property | Entity | Canonical semantic attribute. |
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
semantic formats, and richer constraints where they describe data semantics rather
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

Constraints are semantic validation rules. Backend-specific tuning belongs in
projections.

## Indexes

Indexes are part of the application data model when they express lookup requirements
or uniqueness constraints. Backend-specific index syntax remains a projection detail.

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
- missing keys
- invalid types
- invalid constraints
- invalid projection references
- incompatible migration metadata

SpecScore may run those checks, but ModelSpec defines what the checks mean.
