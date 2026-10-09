# Migration Metadata

## Status

`migration` is a reserved word with no content
([decision 0019](decisions/0019-collection-and-recordset-removed-three-words-reserved.md)).
A model cannot declare migration metadata, and a reader refuses a `migration` block.
The word is kept free so that a later version can define it.

Earlier drafts of this chapter showed a `migration` block by example. Its settings
were never defined and no tool read them, so it was not part of the language.

## What Stands

ModelSpec does not execute migrations, and defines no migration plan, execution step,
checkpoint, or rollback. Those belong to the store that holds the data and to the
system that consumes the model
([decision 0008](decisions/0008-migration-capabilities-out-of-scope.md)).

## Version Identity

A published ModelSpec version should be immutable. The JSON form carries `module.id`
and `module.version`; a registered model is also pinned by commit.

## Change Intent

Some changes are ambiguous without the author's intent:

- `fullName` removed and `displayName` added could be a rename or a delete-and-add.
- an optional field becoming required may need a backfill.
- a reference changing its target may require data validation.

Descriptive metadata that tells these cases apart is the job the reserved word is kept
for. Nothing defines its syntax yet, and no consumer compares two versions of a model
today.

## Boundary

When migration metadata is defined, it will describe intent. It will not define:

- user approval prompts
- migration execution engines
- backup formats
- RBAC changes
- encryption changes
- deployment rollout

## Open Questions

None at this time.
