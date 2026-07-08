# HCL Authoring

## Purpose

Define the first human-authored ModelSpec source format.

HCL is the intended authored source format for ModelSpec modules. JSON and YAML are
serializations of the parsed ModelSpec AST; they are not the preferred authoring
surface.

## Direction

ModelSpec authors write named declarations as singular HCL blocks:

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

Tooling should parse HCL into a ModelSpec AST. That AST should then be serializable to
JSON for machine ingestion and to YAML if a consumer needs a YAML representation.

## Block Style

ModelSpec HCL SHOULD use singular named blocks for model members:

- `entity "User" { ... }`
- `component "Auditable" { ... }`
- `property "email" { ... }`
- `field "createdAt" { ... }`
- `collection "users" { ... }`
- `recordset "user_report" { ... }`
- `column "id" { ... }`

ModelSpec SHOULD NOT use map-style containers as the primary authoring syntax:

```hcl
properties = {
  email = {
    type = "string"
  }
}
```

The singular block style treats each model member as a declaration, gives validators
clear source locations, supports nested declarations, and keeps diffs small.

## Why HCL

HCL is readable for humans, handles nested blocks well, and keeps repeated model
structures concise. It is a better source format than raw JSON for application data
model authors.

## Relationship To JSON

JSON is useful for validators, generators, API ingestion, and runtime consumers.

The source-of-truth model remains the HCL-authored ModelSpec module or the equivalent
ModelSpec AST. JSON should be treated as an interchange serialization of that AST.

HCL and JSON do not need identical surface shapes. HCL is optimized for authors; JSON
serializes the AST. For example, HCL uses repeated `property` blocks while JSON may use
a `properties` object map because entity property names are unique.

## Ordering And Duplicate Names

Entity names, component names, collection names, and entity property names MUST be
unique within their scopes. Their declaration order is not semantic, although tools
may preserve it for documentation and stable diffs.

Recordset column order is semantic. Recordset column names MAY repeat because SQL
queries can return multiple columns with the same display name. The AST and JSON
serialization MUST preserve recordset column order and duplicates.

## Open Questions

- What exact HCL grammar should be normative for v0?
