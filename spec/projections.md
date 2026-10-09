# Projections

## Status

`projection` is a reserved word with no content
([decision 0019](decisions/0019-collection-and-recordset-removed-three-words-reserved.md)).
A model cannot declare a projection, and a reader refuses a `projection` block. The
word is kept free so that a later version can define it.

Earlier drafts of this chapter showed a `projection` block by example. Its settings
were never defined and no tool read them, so it was not part of the language.

## Logical Versus Physical Model

ModelSpec owns the logical model: record types, fields, keys, references, components,
and constraints.

Whatever holds the data owns the physical layout: tables, columns, indexes, document
paths, record files, GraphQL types, language types.

The logical model should remain stable when a project moves from one storage engine
to another.

## Where A Mapping Is Written

A statement that a real table holds rows of a record type is a statement about one
database. It is written with that database's description, where it can be checked
against the database, and not in the model
([decision 0017](decisions/0017-one-question-per-layer.md)). OpenVaultDB's publisher
manifest carries it today.

A model has no place to suggest where its rows should be stored.

## Generator Contract

No generator exists. One that is built should:

- preserve record identity and references
- preserve constraints where the target can enforce them
- emit validation metadata when the target cannot enforce a rule directly
- keep generated output deterministic
- report unsupported features as diagnostics
- avoid inventing semantics not present in the ModelSpec document

## Backend Independence

ModelSpec should not depend on any specific backend. Backend adapters and generators
may live in separate repositories and evolve independently.
