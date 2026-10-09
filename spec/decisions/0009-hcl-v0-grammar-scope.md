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

2026-10-09 — Succeeded in part by decision 0019, which took effect in the specification's grammar chapters: `collection`, `recordset` and `column` are removed, and `projection` is a reserved word with no content. Decisions 0018 and 0020 change two words this decision lists, though their cards did not name it: `entity` and `property` are now deprecated spellings of `record` and `field`. The blocks are `record`, `component`, `enum` and `field`. The constrained grammar, with no dynamic expressions, stands. This file's headers do not record it: SpecScore accepts a `Supersedes` link only on a successor that is not yet approved, and the successors were approved before they took effect.

## Affected Features

None at this time.

---
*This document follows the https://specscore.md/decision-specification*
