---
format: https://specscore.md/decision-specification
status: Approved
---

# Decision: Opaque Query Seam

**Status:** Approved
**Date:** 2026-07-08
**Owner:** codex
**Tags:** query,dtql
**Source Idea:** —
**Supersedes:** —
**Superseded By:** —

## Context

Computed collections and recordsets need a way to carry query metadata. DTQL is the
intended downstream query metadata model, but ModelSpec should not depend on a
specific DTQL implementation before that integration is stable.

## Decision

Computed collections and recordsets may carry query metadata behind an opaque seam.
DTQL is the intended downstream query model, but ModelSpec does not depend on a
concrete DTQL implementation.

## Rationale

The core application data model should not be blocked by a specific query AST.
Keeping the query body opaque allows ModelSpec to provide typing and relationship
metadata while DTQL evolves independently.

## Declined Alternatives

### Define a ModelSpec-native query language

Rejected because it would duplicate DTQL and expand ModelSpec beyond application data
modeling.

### Require DTQL immediately

Rejected because it would couple ModelSpec maturity to a separate implementation.

### Exclude query metadata entirely

Rejected because computed collections and recordsets need a stable place to carry the
query or query reference that produces them.

## Consequences at Decision Time

Consumers can preserve query text or references without interpreting them. DTQL-aware
generators can add richer validation later.

## Observed Consequences

None observed yet.

## Affected Features

None at this time.

---
*This document follows the https://specscore.md/decision-specification*
