# Projections

## Purpose

Define how a logical ModelSpec model can be projected into storage, transport,
language, and backend-specific representations without making those representations
the source of truth.

## Projection Model

A projection maps ModelSpec concepts into a target representation.

Targets may include:

- GraphQL schemas
- DTQL typing metadata
- Go structs
- TypeScript interfaces
- SQLite DDL
- PostgreSQL DDL
- Firestore collection layouts
- InGitDB collection definitions
- OpenVaultDB schema metadata
- DALGO metadata

## Logical Versus Physical Model

ModelSpec owns the logical application model.

Backends own physical layout.

```text
Logical model
  Entity
  Property
  Relationship
  Component
  Constraint

Physical projection
  Table
  Column
  Index
  Firestore path
  InGitDB record file
  GraphQL type
  TypeScript interface
```

The logical model should remain stable when a project moves from SQLite to PostgreSQL,
from Firestore to OpenVaultDB, or from one OpenVaultDB backend to another.

## Advisory Storage Hints

Applications may include optional backend mapping suggestions, but those suggestions
are advisory.

For example, an application can suggest that an InGitDB projection store one file per
record:

```hcl
projection "ingitdb" {
  collection "users" {
    source = "User"

    record_file {
      name = "{id}.json"
      type = "map[string]any"
    }
  }
}
```

The consuming vault or backend may honor, override, or ignore the suggestion.

This matters most for OpenVaultDB: the app publishes the storage-neutral ModelSpec;
the user's vault chooses the final backend and owns enforcement.

## Generator Contract

A generator consumes ModelSpec and emits a target artifact. A generator should:

- preserve entity identity and relationship semantics
- preserve constraints where the target can enforce them
- emit validation metadata when the target cannot enforce a rule directly
- keep generated output deterministic
- report unsupported features as diagnostics
- avoid inventing semantics not present in the ModelSpec document

## Backend Independence

ModelSpec should not depend on any specific backend. Backend adapters and generators
may live in separate repositories and evolve independently.

The specification defines the model. Generators define projections.
