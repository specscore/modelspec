# Format Analysis

## Purpose

Analyze HCL, JSON, and YAML roles in ModelSpec before finalizing the v0 format
contract.

## Current Recommendation

Use HCL as the authored source format.

Use a ModelSpec AST as the semantic representation.

Serialize the AST to JSON first for validators, generators, OpenVaultDB ingestion, and
other machine consumers. YAML is not supported in v0 and can be reconsidered later
only if a concrete consumer needs it.

Use singular named HCL blocks for declarations and use JSON shapes that fit AST
semantics. JSON does not need to mirror the HCL surface exactly.

## Options

| Option | Strengths | Weaknesses | Recommended Role |
|---|---|---|---|
| HCL | Human-readable, concise nested blocks, good source authoring ergonomics. | Requires an HCL parser; less universal for browser/runtime ingestion. | Primary authored source format. |
| JSON | Universal tooling, deterministic enough for APIs, easy validation, strong runtime support. | Poor hand-authoring ergonomics; object ordering is not semantic. | First machine serialization of the AST. |
| YAML | More readable than JSON, common in config-heavy ecosystems. | Ambiguous parsing edge cases; less deterministic; indentation-sensitive. | Possible secondary AST serialization. |

## Why Not JSON As Source Of Truth

Raw JSON is not a good primary authoring format for application data models. It is
verbose, noisy in diffs, and awkward for repeated nested model declarations.

JSON is still useful as an interchange format after parsing or compiling the source
model.

## Why Not HCL Only

HCL-only would force every runtime consumer and backend integration to embed or call an
HCL parser. That is unnecessary for systems that only need an already parsed model.

## AST Boundary

The key boundary is:

```text
HCL source
    |
    v
ModelSpec AST
    |
    +--> JSON serialization
    +--> YAML serialization, not in v0
    +--> generator input
    +--> validator input
```

The AST owns semantics. Serializations carry the AST.

## HCL Block Syntax

Prefer singular named blocks:

```hcl
entity "User" {
  property "email" {
    type = "string"
  }
}
```

over map-style authoring:

```hcl
entity "User" {
  properties = {
    email = {
      type = "string"
    }
  }
}
```

The block form is easier to read, easier to extend with nested declarations, and gives
validators better source locations.

## Ordering

Entity and property names are unique, so the JSON AST can represent them as object
maps.

Recordset columns are different: column order matters, and duplicate column names are
possible in SQL result sets. The JSON AST should represent recordset columns as an
array of objects with a `name` field.

## Open Questions

None at this time.
