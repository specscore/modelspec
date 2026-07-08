---
format: https://specscore.md/decision-specification
status: Approved
---

# Decision: Composition Over Inheritance

**Status:** Approved
**Date:** 2026-07-08
**Owner:** codex
**Tags:** model,composition
**Source Idea:** —
**Supersedes:** —
**Superseded By:** —

## Context

Application data models need reusable parts such as audit fields, addresses, currency
amounts, and contact information. Inheritance is one possible reuse mechanism, but it
creates rigid hierarchies that project poorly into relational databases, document
databases, DTOs, Go structs, TypeScript interfaces, and storage-neutral vault schemas.

ModelSpec needs a reuse model that remains simple across storage, language, API, and
backend generators.

## Decision

ModelSpec favors reusable components and composition over inheritance.

Components are reusable groups of fields with no independent identity. Entities and
structured values may embed components according to the rules defined by the core
model.

## Rationale

Composition keeps the model flatter and easier to project. It matches Go-inspired
embedding without requiring every target to support base classes, derived classes, or
abstract entities.

This preserves reuse while avoiding semantic ambiguity around inherited identity,
constraints, overrides, and storage layout.

## Declined Alternatives

### Inheritance-first model

Rejected because deep hierarchies leak implementation assumptions into storage and
language generators.

### No reuse mechanism

Rejected because repeated field groups drift and make canonical entities harder to
standardize.

## Consequences at Decision Time

ModelSpec needs clear component embed semantics, validation for component references,
and generator rules for flattening or nesting components in target representations.

## Observed Consequences

None observed yet.

## Affected Features

None at this time.

---
*This document follows the https://specscore.md/decision-specification*
