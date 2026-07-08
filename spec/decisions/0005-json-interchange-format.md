---
format: https://specscore.md/decision-specification
status: Approved
---

# Decision: JSON Interchange Format

**Status:** Approved
**Date:** 2026-07-08
**Owner:** codex
**Tags:** format,json,interchange
**Source Idea:** —
**Supersedes:** —
**Superseded By:** —

## Context

ModelSpec needs a first machine-readable format that validators, generators, and
consumers can ingest consistently. HCL remains readable for examples and possible
authoring workflows, but not every consumer should be required to embed an HCL parser.

OpenVaultDB especially needs a stable ingestion format for current and target models
so it can validate schemas, compute diffs, plan migrations, and generate backend
metadata.

## Decision

ModelSpec v0 defines JSON as the first normative machine-readable interchange format.

The format is identified by a top-level `modelspec` field. The first draft value is
`1.0-draft`.

## Rationale

JSON is language-neutral, backend-neutral, and easy to validate in every target
runtime. It works well for OpenVaultDB ingestion, SpecScore validation, CI checks, and
generator pipelines.

Keeping JSON as the interchange format does not prevent HCL, YAML, editor UIs, or
other authoring formats from existing. Those formats should compile or export to the
JSON object model when interoperability matters.

## Declined Alternatives

### HCL-only

Rejected because it makes non-Go and runtime consumers pay for HCL parsing even when
they only need a machine-readable model.

### YAML-first

Rejected for v0 because YAML has multiple parsing edge cases and is less deterministic
as an interchange format. YAML may still be supported later as a serialization of the
same object model.

### JSON Schema only

Rejected because JSON Schema can describe document shape but does not by itself define
ModelSpec semantics, reference resolution, projection boundaries, or migration intent.

## Consequences at Decision Time

ModelSpec needs a JSON format specification, at least one JSON example, and future
JSON Schema publication for structural validation.

OpenVaultDB can close the MVP serialization-format question by accepting ModelSpec
JSON first.

## Observed Consequences

This decision was too easy to read as making JSON the authored source of truth.
Decision 0006 clarifies that HCL is the authored source format, while JSON is the
first serialization of the ModelSpec AST.

## Affected Features

None at this time.

---
*This document follows the https://specscore.md/decision-specification*
