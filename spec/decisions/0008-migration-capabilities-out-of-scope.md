---
format: https://specscore.md/decision-specification
status: Approved
---

# Decision: Migration Capabilities Out Of Scope

**Status:** Approved
**Date:** 2026-07-08
**Owner:** codex
**Tags:** migrations,scope
**Source Idea:** —
**Supersedes:** —
**Superseded By:** —

## Context

ModelSpec can describe semantic changes between model versions, such as renames,
deprecations, and compatibility notes. It is tempting to also define migration plans,
transforms, execution steps, rollback, or checkpointing.

Those responsibilities depend heavily on the storage backend, driver capabilities,
data volume, locking model, permissions, backup policy, and runtime execution
environment.

## Decision

ModelSpec v0 does not include migration capabilities beyond descriptive metadata.

Migration planning, execution, checkpointing, rollback, and recovery are the
responsibility of store implementation drivers and consuming systems such as
OpenVaultDB.

## Rationale

There is not yet a clear reusable, storage-neutral migration capability model that
belongs inside ModelSpec. Adding one prematurely would risk coupling ModelSpec to
backend behavior.

Descriptive metadata is still useful because it helps consumers understand author
intent, but executable migration behavior should remain outside ModelSpec.

## Declined Alternatives

### ModelSpec-native migration engine

Rejected for v0 because execution semantics are backend-specific.

### Normative migration plan format

Rejected for v0 because OpenVaultDB and other consumers need to own approval,
checkpointing, rollback, and recovery details.

### No migration metadata at all

Rejected because semantic intent such as renames and deprecations can be useful input
to downstream migration planners.

## Consequences at Decision Time

ModelSpec can carry descriptive migration metadata, but consumers must not treat
ModelSpec as a migration executor.

OpenVaultDB remains responsible for migration planning and execution.

## Observed Consequences

None observed yet.

## Affected Features

None at this time.

---
*This document follows the https://specscore.md/decision-specification*
