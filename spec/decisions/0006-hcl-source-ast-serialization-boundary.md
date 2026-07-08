---
format: https://specscore.md/decision-specification
status: Approved
---

# Decision: HCL Source And AST Serialization Boundary

**Status:** Approved
**Date:** 2026-07-08
**Owner:** codex
**Tags:** format,hcl,json,yaml,ast
**Source Idea:** —
**Supersedes:** —
**Superseded By:** —

## Context

ModelSpec needs both a human-friendly authored source format and machine-friendly
serializations for validators, generators, and runtime consumers.

The previous JSON decision clarified a useful interchange shape, but it could be read
as making JSON the model authoring format. That is not the desired direction.

## Decision

HCL is the intended authored source format for ModelSpec.

The semantic representation is the ModelSpec AST.

JSON is the first machine-readable serialization of that AST. YAML may be added later
as a secondary serialization of the same AST.

## Rationale

HCL gives model authors concise, readable nested declarations. JSON gives tools and
runtimes a widely supported interchange form. YAML may be useful for config-heavy
tooling, but it is secondary because it is less deterministic and has more parsing
edge cases.

Separating source, AST, and serialization avoids conflating authoring ergonomics with
machine ingestion.

## Declined Alternatives

### JSON as authored source

Rejected because raw JSON is verbose, awkward in diffs, and less pleasant for humans
writing application data models.

### HCL only

Rejected because runtime consumers such as OpenVaultDB should be able to ingest an AST
serialization without embedding an HCL parser.

### YAML as primary source

Rejected because YAML is indentation-sensitive, has parser edge cases, and is less
precise as a normative interchange format.

## Consequences at Decision Time

ModelSpec needs:

- a normative HCL authoring spec
- a ModelSpec AST model
- a JSON serialization spec for that AST
- analysis of whether JSON object maps or arrays best represent ordered source
  declarations
- optional YAML serialization only after a concrete consumer need appears

OpenVaultDB should be able to accept a compiled JSON AST serialization first while
remaining compatible with HCL-authored modules.

## Observed Consequences

None observed yet.

## Affected Features

None at this time.

---
*This document follows the https://specscore.md/decision-specification*
