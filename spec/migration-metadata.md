# Migration Metadata

## Purpose

Define the migration metadata ModelSpec should carry so consumers can plan changes
between model versions.

ModelSpec does not execute migrations. The intent is that a consumer such as
OpenVaultDB compares a current and a target model and produces a migration plan. No
consumer does so today.

Migrations are the responsibility of the store implementation driver. ModelSpec does
not include migration capabilities beyond descriptive metadata in v0.

## Version Identity

A published ModelSpec version should be immutable.

Version metadata should identify:

- model id
- version
- parent version or origin
- compatibility notes
- deprecated entities or fields
- rename mappings
- destructive changes

## Change Intent

Some changes are ambiguous without author intent.

For example:

- `fullName` removed and `displayName` added could be a rename or a delete-and-add.
- a nullable field becoming required may need a backfill.
- a relationship cardinality change may require data validation.

ModelSpec should allow authors to provide migration metadata that distinguishes these
cases.

The `migration` block below is shown by example. Its attributes and its mapping to the
JSON `migrations` object are not defined, and the reference CLI records the block
without reading its content.

```hcl
migration "2026-07-08-user-display-name" {
  from = "1.2.0"
  to   = "1.3.0"

  rename "User.fullName" {
    to = "User.displayName"
  }

  backfill "User.displayName" {
    strategy = "copy"
    from     = "User.fullName"
  }
}
```

## OpenVaultDB Consumption

This is the intended use and is not implemented. OpenVaultDB would load the current
ModelSpec and the target ModelSpec, then use them to plan:

- schema changes
- data transformations
- index changes
- backend format changes
- validation checks
- rollback or compensating actions

OpenVaultDB would remain responsible for user approval, permissions, audit events,
checkpointing, and execution.

## Boundary

ModelSpec describes migration intent and semantic compatibility.

It does not define:

- user approval prompts
- migration execution engines
- backup formats
- RBAC changes
- encryption changes
- deployment rollout

## Open Questions

None at this time.
