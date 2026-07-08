---
format: https://specscore.md/decision-specification
status: Approved
---

# Decision: YAML Serialization Out Of v0

**Status:** Approved
**Date:** 2026-07-08
**Owner:** codex
**Tags:** format,yaml,scope
**Source Idea:** —
**Supersedes:** —
**Superseded By:** —

## Context

ModelSpec has HCL as the authored source format and JSON as the first
machine-readable AST serialization. YAML could also serialize the same AST, but it
would add parser, schema, documentation, compatibility, and test surface.

No concrete v0 consumer currently requires YAML.

## Decision

ModelSpec does not support YAML serialization in v0.

YAML may be reconsidered later if a concrete consumer needs it.

## Rationale

Avoiding YAML in v0 keeps the format surface smaller and lets the project focus on
the HCL source format, AST semantics, and JSON serialization.

YAML is useful in some configuration ecosystems, but it is not necessary for the first
ModelSpec toolchain slice.

## Declined Alternatives

### YAML as primary source

Rejected because HCL is the authored source format.

### YAML as co-equal AST serialization in v0

Rejected because it adds compatibility surface without an immediate consumer.

## Consequences at Decision Time

Validators and generators only need to support HCL source and JSON AST serialization
for v0.

Documentation should avoid promising YAML support until a later decision adds it.

## Observed Consequences

None observed yet.

## Affected Features

None at this time.

---
*This document follows the https://specscore.md/decision-specification*
