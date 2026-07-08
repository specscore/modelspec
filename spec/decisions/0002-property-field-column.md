---
format: https://specscore.md/decision-specification
status: Approved
---

# Decision: Property, Field, And Column Are Distinct

**Status:** Approved
**Date:** 2026-07-08
**Owner:** codex
**Tags:** model,terminology
**Source Idea:** —
**Supersedes:** —
**Superseded By:** —

## Context

The core model separates semantic entities, storage-neutral collections, and tabular
recordsets. Each layer has attributes, but the layers do not mean the same thing.

Using one generic attribute type would make the language smaller, but it would also
hide important differences between canonical semantics, loose data containers, and
strict query results.

## Decision

Use three distinct attribute terms:

- Entity has properties.
- Collection has fields.
- Recordset has columns.

## Rationale

A property is the canonical semantic attribute. A field is a storage-neutral data
attribute that may map to schemaless or physical storage. A column is a strict ordered
tabular result attribute.

Distinct names prevent one overloaded attribute type from accumulating contradictory
semantics. They also let generators and validators reason about each layer without
guessing intent from context.

## Declined Alternatives

### Single shared `field` term

Rejected because it erases the distinction between entity semantics, collection
storage shape, and recordset output shape.

### SQL-oriented `column` everywhere

Rejected because it biases the logical model toward relational storage and is wrong
for document-oriented collections.

## Consequences at Decision Time

Bindings from fields or columns to properties are explicit references rather than
implicit identity. Tooling must preserve the layer-specific terminology.

## Observed Consequences

None observed yet.

## Affected Features

None at this time.

---
*This document follows the https://specscore.md/decision-specification*
