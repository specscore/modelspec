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
- `enum "BookingStatus" { ... }`
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

## V0 Grammar Scope

ModelSpec v0 HCL uses:

- singular named blocks for declarations: `entity`, `component`, `enum`, `property`,
  `field`, `collection`, `recordset`, `column`, and `projection`
- attributes for scalar and list settings: `type`, `required`, `unique`, `key`,
  `source`, `bind`, `query`, and similar metadata
- module-qualified names (`core.Space`, `calendarius.TimeWindow`) in reference
  attributes (`entity`, `component`, `enum`, `use` entries) for read-only
  cross-module references; bare names remain same-module
  ([decision 0014](decisions/0014-module-qualified-references.md))
- literal values for model semantics: strings, numbers, booleans, lists, and object
  literals where explicitly specified

ModelSpec v0 HCL does not support map-style declaration containers as canonical
syntax. For example, `properties = { ... }` is not the canonical way to declare
entity properties.

ModelSpec v0 HCL does not use dynamic HCL expressions or functions for model
semantics. A later version may add constrained expression support where it has a clear
portable meaning.

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

Name scopes are explicit ([decision 0015](decisions/0015-concept-namespaces-and-reserved-names.md)):

- **Entity, component, and enum names share ONE flat namespace per module** — the
  *referenceable trio* that consumers may address by bare concept name. An entity
  and an enum with the same name in one module is an error, not a coexistence.
- **Collection names** form a separate scope per module, and **recordset names**
  another. They are addressable by consumers only in kind-explicit form, never by
  bare name.
- **Entity property names** are unique within their entity.
- **Reserved names:** `entities`, `components`, `enums`, `collections`, and
  `recordsets` are forbidden as concept names in any scope — they are the kind
  tokens of consumer reference syntax.

Declaration order is not semantic, although tools may preserve it for
documentation and stable diffs.

Recordset column order is semantic. Recordset column names MAY repeat because SQL
queries can return multiple columns with the same display name. The AST and JSON
serialization MUST preserve recordset column order and duplicates.

## Open Questions

- **Module identity.** Direction settled for SpecScore-managed trees: identity is a
  packaging concern outside the grammar — the module short name derives from
  directory placement, and the compiled JSON `module.id` from repository identity
  plus path (SpecScore decision 0006; ModelSpec itself is unchanged and depends on
  nothing). Remaining open only for standalone HCL distribution outside any managed
  tree: does a bare `.hcl` file ever need self-carried identity, or does compiled
  JSON (`module.id`) always cover that case? Revisit only on demonstrated need.
