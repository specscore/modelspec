---
format: https://specscore.md/decision-specification
status: Approved
---

# Decision: HCL v0 Grammar Scope

**Status:** Approved
**Date:** 2026-07-08
**Owner:** codex
**Tags:** format,hcl,grammar
**Source Idea:** —
**Supersedes:** —
**Superseded By:** —

## Context

ModelSpec needs a clear HCL authoring grammar for v0. HCL supports named blocks,
attributes, object values, expressions, functions, and other features. ModelSpec
should use only the subset that has portable meaning across validators, generators,
and storage backends.

## Decision

ModelSpec v0 HCL uses singular named blocks for declarations:

- `entity`
- `component`
- `property`
- `field`
- `collection`
- `recordset`
- `column`
- `projection`

ModelSpec v0 HCL uses attributes for scalar and list settings such as `type`,
`required`, `unique`, `key`, `source`, `bind`, and `query`.

ModelSpec v0 HCL allows literal strings, numbers, booleans, lists, and object literals
where explicitly specified.

ModelSpec v0 HCL does not support map-style declaration containers as canonical
syntax, and does not use dynamic HCL expressions or functions for model semantics.

## Rationale

The subset is expressive enough for the current model while remaining easy to parse,
validate, serialize to AST, and explain. It avoids treating HCL as a general-purpose
programming or templating language.

Keeping dynamic expressions out of v0 avoids portability problems between validators,
generators, and runtime consumers.

## Declined Alternatives

### Full HCL expression language

Rejected for v0 because functions and dynamic expressions would make ModelSpec harder
to validate and less portable.

### Map-style declaration containers

Rejected as canonical syntax because they are less idiomatic for HCL model
declarations and weaker for validation source locations.

### JSON-like HCL source

Rejected because HCL should optimize authoring ergonomics, while JSON carries the AST
serialization.

## Consequences at Decision Time

The initial parser can target a constrained grammar.

Generators and validators can rely on a clean HCL-to-AST mapping without evaluating
dynamic expressions.

## Observed Consequences

None observed yet.

## Affected Features

None at this time.

---
*This document follows the https://specscore.md/decision-specification*
