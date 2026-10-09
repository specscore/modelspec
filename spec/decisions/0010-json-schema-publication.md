---
format: https://specscore.md/decision-specification
status: Approved
---

# Decision: JSON Schema Publication

**Status:** Approved
**Date:** 2026-07-08
**Owner:** codex
**Tags:** json-schema,publication
**Source Idea:** —
**Supersedes:** —
**Superseded By:** —

## Context

ModelSpec JSON AST serialization needs machine-readable schema artifacts for
validators, editor integrations, CI, and downstream consumers. Those artifacts need a
source-of-truth location and stable public URLs.

## Decision

Generated JSON Schema artifacts are published in the ModelSpec repository under
`schema/`.

The website exposes stable copies under `https://modelspec.org/schema/`.

Initial planned URLs:

- `https://modelspec.org/schema/modelspec-ast.schema.json`
- `https://modelspec.org/schema/modelspec-ast-1.0-draft.schema.json`

## Rationale

The repository provides reviewability, version control, and release history. The
website provides stable URLs for tooling and documentation.

Keeping both paths makes the repository authoritative while giving external consumers
predictable fetch locations.

## Declined Alternatives

### Website only

Rejected because generated schemas should be reviewed and versioned in Git.

### Repository only

Rejected because tools and docs benefit from stable public URLs that do not depend on
GitHub raw-file paths.

### Package registry only

Rejected for v0 because it adds distribution complexity before schema artifacts exist.

## Consequences at Decision Time

The repository needs a `schema/` directory.

The website build or deployment process should publish those files under
`/schema/`.

## Observed Consequences

2026-10-09 — Published. `schema/` holds three schemas, written by hand and not generated: `modelspec-ast-1.0-draft-2.schema.json` for the current vocabulary, whose identifier decision 0018 fixed; `modelspec-ast-1.0-draft.schema.json` for the deprecated one; and `modelspec-ast.schema.json`, the latest. Every site build copies the same bytes to `/schema/`, and the site serves them from the deploy that follows this change. Publishing a schema for the deprecated vocabulary, and the third URL, are choices of the implementing session.

## Affected Features

None at this time.

---
*This document follows the https://specscore.md/decision-specification*
