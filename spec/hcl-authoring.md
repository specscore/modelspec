# HCL Authoring

## Purpose

Define the first human-authored ModelSpec source format.

HCL is the intended authored source format for ModelSpec modules. JSON and YAML are
serializations of the parsed ModelSpec AST; they are not the preferred authoring
surface.

## Direction

ModelSpec authors should be able to write models in HCL:

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

## Why HCL

HCL is readable for humans, handles nested blocks well, and keeps repeated model
structures concise. It is a better source format than raw JSON for application data
model authors.

## Relationship To JSON

JSON is useful for validators, generators, API ingestion, and runtime consumers.

The source-of-truth model remains the HCL-authored ModelSpec module or the equivalent
ModelSpec AST. JSON should be treated as an interchange serialization of that AST.

## Open Questions

- What exact HCL grammar should be normative for v0?
- Should every HCL construct have a one-to-one JSON AST serialization?
