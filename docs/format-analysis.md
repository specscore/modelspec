# Format Analysis

## Purpose

Analyze HCL, JSON, and YAML roles in ModelSpec before finalizing the v0 format
contract.

## Current Recommendation

Use HCL as the authored source format.

Use a ModelSpec AST as the semantic representation.

Serialize the AST to JSON first for validators, generators, OpenVaultDB ingestion, and
other machine consumers. Add YAML later only as a secondary serialization if a concrete
consumer needs it.

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
    +--> YAML serialization, optional
    +--> generator input
    +--> validator input
```

The AST owns semantics. Serializations carry the AST.

## Open Questions

- What is the minimum normative HCL grammar for v0?
- Should JSON use object maps for named concepts or arrays with explicit `name`
  fields to preserve source order?
- Where should generated JSON Schema artifacts be published?
