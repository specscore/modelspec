# HCL Authoring

## Purpose

Define the first human-authored ModelSpec source format.

HCL is the intended authored source format for ModelSpec modules. JSON is the
serialization of the parsed ModelSpec AST; it is not the preferred authoring
surface. YAML is not a ModelSpec serialization in v0
([decision 0011](decisions/0011-yaml-serialization-out-of-v0.md)).

## Direction

ModelSpec authors write named declarations as singular HCL blocks:

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

A record type may omit `key` when the model makes no claim of stable logical record
identity. This does not describe or rule out primary-key or unique constraints
in a physical source schema. If present, a key must be a non-empty list of distinct
fields, its own or provided by components it uses.

Tooling should parse HCL into a ModelSpec AST. That AST should then be serializable to
JSON for machine ingestion. No YAML form is defined.

## Block Style

ModelSpec HCL SHOULD use singular named blocks for model members:

- `record "User" { ... }`
- `component "Auditable" { ... }`
- `enum "BookingStatus" { ... }`
- `field "email" { ... }`

ModelSpec SHOULD NOT use map-style containers as the primary authoring syntax:

```hcl
fields = {
  email = {
    type = "string"
  }
}
```

The singular block style treats each model member as a declaration, gives validators
clear source locations, supports nested declarations, and keeps diffs small.

## V0 Grammar Scope

ModelSpec v0 HCL uses:

- three top-level blocks, each with one name label: `record`, `component`, and `enum`
- one nested block, with one name label: `field`, in a `record` and in a `component`
- settings on a record type: `key` and `use`
- settings on an enum: `values`
- settings on a field: exactly one of `type`, `component` and `record`, and the
  constraints `required`, `unique`, `min_len`, `max_len`, `pattern`, `enum` and
  `format`
- module-qualified names (`core.Space`, `calendarius.TimeWindow`) in the settings that
  name another concept (`record`, `component`, `enum`, `use` entries) for read-only
  cross-module references; bare names remain same-module
  ([decision 0014](decisions/0014-module-qualified-references.md))
- literal values: strings, numbers, booleans, and lists

A file contains only blocks. A top-level setting is not allowed.

ModelSpec v0 HCL does not support map-style declaration containers as canonical
syntax. For example, `fields = { ... }` is not the canonical way to declare
fields.

ModelSpec v0 HCL does not use dynamic HCL expressions or functions for model
semantics. A later version may add constrained expression support where it has a clear
portable meaning.

## Deprecated Spellings

A reader accepts three deprecated spellings and treats each as the word that replaced
it ([decision 0018](decisions/0018-entity-becomes-record.md),
[decision 0020](decisions/0020-field-is-the-member-word.md)):

| Deprecated | Current |
|---|---|
| block `entity` | block `record` |
| block `property`, in a record type | block `field` |
| setting `entity` on a member | setting `record` |

Current and deprecated spellings may be mixed in one file and in one module. A member
that carries both `record` and `entity` is an error. See
[core-model.md](core-model.md#deprecated-spellings).

## Removed And Reserved

The blocks `collection` and `recordset`, the nested block `column`, and the settings
`kind`, `source`, `query` and `bind` are removed. The words `projection`, `index` and
`migration` are reserved and have no content: a block of that type is an error
([decision 0019](decisions/0019-collection-and-recordset-removed-three-words-reserved.md)).

## Why HCL

HCL is readable for humans, handles nested blocks well, and keeps repeated model
structures concise. It is a better source format than raw JSON for application data
model authors.

## Relationship To JSON

JSON is useful for validators, generators, API ingestion, and runtime consumers.

The source-of-truth model remains the HCL-authored ModelSpec module or the equivalent
ModelSpec AST. JSON should be treated as an interchange serialization of that AST.

HCL and JSON do not need identical surface shapes. HCL is optimized for authors; JSON
serializes the AST. For example, HCL uses repeated `field` blocks while JSON uses
a `fields` object map because field names are unique.

HCL carries no version marker. The keyword tells a reader which spelling it sees.

## Ordering And Duplicate Names

Name scopes are explicit ([decision 0015](decisions/0015-concept-namespaces-and-reserved-names.md)):

- **Record type, component, and enum names share ONE flat namespace per module**, so
  that consumers may address any of them by bare concept name. A record type and an
  enum with the same name in one module is an error, not a coexistence.
- **Field names** are unique within their record type or component.
- **Reserved names:** `records`, `entities`, `components`, `enums`, `collections`, and
  `recordsets` are forbidden as concept names. They are, or were, the kind tokens of
  consumer reference syntax.

Declaration order is not semantic, although tools may preserve it for
documentation and stable diffs.

## Open Questions

- **Module identity.** Direction settled for SpecScore-managed trees: identity is a
  packaging concern outside the grammar — the module short name derives from
  directory placement, and the compiled JSON `module.id` from repository identity
  plus path (SpecScore decision 0006; ModelSpec itself is unchanged and depends on
  nothing). Remaining open only for standalone HCL distribution outside any managed
  tree: does a bare `.hcl` file ever need self-carried identity, or does compiled
  JSON (`module.id`) always cover that case? Revisit only on demonstrated need.
- **Which kind tokens stay reserved.** Decision 0015 reserved five names because
  they were the kind tokens of a consumer's reference syntax. Two of them,
  `collections` and `recordsets`, now name nothing, and `records` is reserved beside
  `entities` for the length of the transition. The final list follows the successor
  of SpecScore decision 0011, which defines that syntax.
