# ModelSpec

**Define your application data model once.**

ModelSpec is an open specification language for application data models.

It describes the logical model of an application independently of storage engines,
programming languages, API layers, and deployment platforms.

Website: <https://modelspec.org>

Repository: <https://github.com/specscore/modelspec>

Although this repository is maintained under the SpecScore GitHub organization,
ModelSpec is an independent specification. Any project can adopt it without adopting
SpecScore, [OpenVaultDB](https://openvaultdb.com/), GraphSpec, or any specific backend.

## What ModelSpec Defines

ModelSpec defines storage-neutral application data models:

- entities
- fields and properties
- relationships
- reusable components
- constraints
- indexes
- projections
- migration metadata
- storage-neutral schemas

ModelSpec intentionally does not define:

- RBAC or permissions
- OAuth or identity flows
- feature specifications
- workflows
- deployment topology
- UI behavior

Those concerns belong in adjacent specifications and application architecture.

## Why ModelSpec Exists

Applications usually define the same data model many times:

```text
Database schema
        |
ORM model
        |
API contract
        |
Frontend type
        |
Migration script
```

Each copy eventually drifts.

ModelSpec provides one logical source of truth:

```text
              ModelSpec
             /    |    \
            /     |     \
      GraphQL    Go    TypeScript
        |        |        |
      SQLite  PostgreSQL Firestore
        |
    OpenVaultDB
```

Generators, validators, and backends can then project the same model into their own
representations without making the application author choose a storage engine first.

## Why Not Author Storage-Specific Schemas Directly?

Storage schemas are necessary, but they are not the application model.

A relational table layout, Firestore collection hierarchy, SQLite DDL file, and Git
record layout each encode operational tradeoffs. They should be projections of the
application model, not the only place where application meaning exists.

For example, the same logical model:

```text
User
  Orders
    OrderItems
```

can become:

```text
Firestore

users/{userId}
  orders/{orderId}
    items/{itemId}
```

or:

```text
PostgreSQL

users
orders
order_items
```

without changing the logical ModelSpec definition.

## Core Ideas

ModelSpec keeps the original design principles that motivated the project:

- Composition over inheritance.
- Reusable components instead of deep type hierarchies.
- Entity semantics separated from storage containers.
- Logical models separated from physical projections.
- Advisory storage projections rather than app-owned storage decisions.
- Generators for GraphQL, Go, TypeScript, SQLite, PostgreSQL, Firestore, InGitDB, and [OpenVaultDB](https://openvaultdb.com/) schemas.
- A future catalog for canonical entities, reusable modules, and dataset mappings.
- Go-inspired composition with simple embedded components.

## Example

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

entity "User" {
  key = ["id"]
  use = ["Auditable"]

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

projection "sqlite" {
  collection "users" {
    source = "User"
    index "users_email_unique" {
      fields = ["email"]
      unique = true
    }
  }
}
```

## [OpenVaultDB](https://openvaultdb.com/)

[OpenVaultDB](https://openvaultdb.com/) consumes ModelSpec directly.

Applications publish a ModelSpec module. A user's vault loads the current ModelSpec
and the target ModelSpec, then uses them for:

- schema validation
- migration planning
- backend mapping
- GraphQL schema generation
- DTQL typing metadata
- DALGO metadata
- backend generators

[OpenVaultDB](https://openvaultdb.com/) remains independent from SpecScore. It depends on ModelSpec semantics, not
on SpecScore ownership or tooling.

## SpecScore

SpecScore validates ModelSpec but does not own ModelSpec semantics.

SpecScore support should include linting, structural validation, and semantic checks
for ModelSpec documents. Future CLI support should reuse existing SpecScore command
patterns, for example:

```text
specscore lint
specscore lint modelspec
specscore validate
```

ModelSpec is not a sub-language of GraphSpec. GraphSpec and ModelSpec solve different
problems and should remain independently specified.

## Target Architecture

```text
                ModelSpec
               /    |     \
              /     |      \
     OpenVaultDB   DALGO   Generators
           |
      GraphQL
      DTQL
      SQLite
      Firestore
      PostgreSQL
      InGitDB

SpecScore
     |
 validates ModelSpec
```

GraphSpec is intentionally outside this architecture.

## Repository Structure

- [spec/](spec/README.md): the ModelSpec language specification.
- [docs/](docs/README.md): architecture, [OpenVaultDB](https://openvaultdb.com/) integration, SpecScore integration, and catalog notes.
- [examples/](examples/README.md): example ModelSpec modules.

## Authored And Machine Formats

HCL is the intended authored source format for ModelSpec.

Tooling should parse HCL into a ModelSpec AST. Validators, generators, and consumers
can then ingest serialized AST forms, with JSON as the first machine-readable
serialization and YAML as a possible secondary serialization. See
[spec/hcl-authoring.md](spec/hcl-authoring.md),
[spec/json-format.md](spec/json-format.md), and
[docs/format-analysis.md](docs/format-analysis.md).

## Status

ModelSpec is in early specification development. The current work preserves and
improves the original storage-neutral data-model design while positioning it as an
independent open specification for application data models.

## License

ModelSpec is licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).

## Open Questions

None at this time.
