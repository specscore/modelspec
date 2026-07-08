---
format: https://specscore.md/decision-specification
status: Approved
---

# Decision: Collection Kind, Not Table Type

**Status:** Approved
**Date:** 2026-07-08
**Owner:** codex
**Tags:** model,collection
**Source Idea:** —
**Supersedes:** —
**Superseded By:** —

## Context

The model needs to describe both stored data sources and computed views. A relational
schema might model those as tables and views, but ModelSpec is storage-neutral and
should not make relational terminology foundational.

To a consumer, both forms are named data sources.

## Decision

ModelSpec uses one Collection concept with a `kind` such as `editable` or `computed`.
It does not define separate Table and View concepts.

## Rationale

Keeping stored and computed sources under one Collection concept avoids duplicate
rules and keeps query consumers uniform. The `kind` value carries the behavioral
difference without turning storage-specific categories into top-level language
concepts.

## Declined Alternatives

### Separate Table and View concepts

Rejected because it duplicates the named data source concept and biases the language
toward relational storage.

### Only entities, no collections

Rejected because applications need to describe queryable data sources, projections,
and backend mappings that are related to but not identical with entities.

## Consequences at Decision Time

Validation can apply kind-specific rules. For example, a computed collection should
have a query, while an editable collection should not require one.

## Observed Consequences

None observed yet.

## Affected Features

None at this time.

---
*This document follows the https://specscore.md/decision-specification*
