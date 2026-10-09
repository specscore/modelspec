---
format: https://specscore.md/decision-specification
status: Approved
---

# Decision: HCL Blocks And Recordset Column Order

**Status:** Approved
**Date:** 2026-07-08
**Owner:** codex
**Tags:** format,hcl,ast,recordset
**Source Idea:** —
**Supersedes:** —
**Superseded By:** —

## Context

ModelSpec needs a clear HCL authoring style and a predictable AST serialization. HCL
supports both repeated named blocks and map-style attributes. JSON serialization can
represent named concepts either as object maps or arrays with explicit names.

The model also has different ordering rules. Entity properties are uniquely named and
order is not semantic. Recordset columns are ordered and may duplicate display names
because SQL queries can return multiple columns with the same name.

## Decision

ModelSpec HCL uses singular named blocks for declarations, such as `property "email"`
and `column "id"`.

The JSON AST serialization uses object maps for uniquely named concepts and arrays for
ordered or duplicate-allowed concepts.

Recordset columns MUST be serialized as ordered arrays with a `name` field.

## Rationale

Singular HCL blocks treat model members as declarations rather than map entries. They
are easier to extend with nested declarations, produce clearer validation locations,
and fit HCL's strongest authoring pattern.

Object maps are appropriate for uniquely named concepts such as entities and entity
properties. Arrays are required for recordset columns because order is meaningful and
duplicate names are possible.

## Declined Alternatives

### HCL map-style properties

Rejected as the primary authoring style because it is closer to JSON than to idiomatic
HCL, weakens source locations, and is harder to extend with nested declaration blocks.

### JSON arrays for all named concepts

Rejected because entity, component, collection, and property names are unique and are
better represented as object maps for lookup and diffing.

### JSON maps for recordset columns

Rejected because maps cannot represent duplicate column names and do not carry
semantic order.

## Consequences at Decision Time

The AST and JSON serialization need per-concept shape rules rather than one uniform
container rule.

Recordset column validation must allow duplicate names while preserving order.

## Observed Consequences

2026-10-09 — Succeeded in part by decision 0019, which took effect in the specification's grammar chapters: recordsets are removed, so the rule for recordset column arrays no longer applies. Singular named blocks, and object maps for uniquely named concepts, stand. Decisions 0018 and 0020 change the words in this decision's examples: `property "email"` is now `field "email"`. This file's headers do not record it: SpecScore accepts a `Supersedes` link only on a successor that is not yet approved, and the successors were approved before they took effect.

## Affected Features

None at this time.

---
*This document follows the https://specscore.md/decision-specification*
