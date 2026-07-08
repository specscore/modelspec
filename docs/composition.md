# Composition Strategy

## Decision

ModelSpec favors composition over inheritance.

Inheritance may be considered in the future, but it is not part of the initial design.

## Motivation

Inheritance creates rigid hierarchies:

```text
Person
  Employee
    Contractor
```

Those hierarchies often do not map cleanly to relational databases, document
databases, DTOs, Go structs, TypeScript interfaces, or storage-neutral vault schemas.

## Components

Reusable model parts are defined as components:

```hcl
component "Auditable" {
  field "createdAt" {
    type = "datetime"
  }

  field "updatedAt" {
    type = "datetime"
  }
}

component "Address" {
  field "line1" {
    type = "string"
  }

  field "city" {
    type = "string"
  }

  field "country" {
    type = "string"
  }
}
```

Entities embed components:

```hcl
entity "Customer" {
  key = ["id"]
  use = ["Auditable", "Address"]

  property "id" {
    type = "uuid"
  }
}
```

## Go Inspiration

The design should feel familiar to Go developers:

```go
type Auditable struct {
    CreatedAt time.Time
    UpdatedAt time.Time
}

type Customer struct {
    Auditable
    Address
    ID string
}
```

The purpose is not to copy Go syntax. The purpose is to keep reuse simple and
predictable.

## Recommended Terminology

Use:

- Entity
- Property
- Field
- Component
- Relationship
- Projection
- Mapping

Avoid:

- Base class
- Derived class
- Abstract entity

## Advantages

- Reusable field groups stay consistent.
- Mappings to SQL, document stores, DTOs, and language types stay simpler.
- Components can evolve independently.
- The model avoids deep inheritance trees that leak implementation assumptions.
