# OpenVaultDB Integration

## Role

OpenVaultDB is the cleanest early consumer of ModelSpec.

An application publishes a ModelSpec JSON module. The user's vault decides how to
store it, maps it to the selected backend, and enforces the application-declared
model.

The storage decision belongs to the vault, not the app.

## Separation Of Concerns

| Concern | Owner | Artifact |
|---|---|---|
| What data exists | App | ModelSpec module |
| Optional backend mapping suggestion | App | Advisory ModelSpec projection |
| Where and how data is stored | Vault | Backend selection and storage policy |
| ModelSpec to backend schema mapping | Vault | Generators and mappers |
| Schema enforcement on writes | Vault | Validation against ModelSpec |
| Access control | App and vault | Namespace or permission manifest, not ModelSpec |

ModelSpec defines data shape only. RBAC stays outside ModelSpec.

## End-To-End Flow

```text
App publishes ModelSpec
          |
          v
User vault loads current ModelSpec and target ModelSpec
          |
          v
Vault validates, plans migration, and chooses backend mapping
          |
          v
Generated artifacts:
  GraphQL schema
  DTQL typing metadata
  DALGO metadata
  SQLite DDL
  PostgreSQL DDL
  Firestore layout
  InGitDB collection definition
          |
          v
Vault enforces writes against ModelSpec
```

## Runtime Uses

OpenVaultDB uses ModelSpec for:

- schema validation
- migration planning
- backend mapping
- GraphQL schema generation
- DTQL typing metadata
- DALGO metadata
- backend generators

## Current And Target Models

For migrations, OpenVaultDB should load both:

- current ModelSpec: the schema version governing stored data
- target ModelSpec: the schema version requested by the app or user

The diff between those models informs the migration plan. OpenVaultDB owns approval,
checkpointing, audit, rollback, and execution.

## Advisory Mapping Suggestions

Apps may provide optional projection hints in ModelSpec JSON.

For InGitDB, the same entity could be stored as:

```text
one file per record: {id}.json
```

or:

```text
all records in one file: records.yaml
```

The app may suggest a preference. The vault may honor, override, or ignore it.

This preserves portability: a user can move a vault between SQLite, PostgreSQL,
Firestore, InGitDB, or another backend without changing the application model.

## Independence From SpecScore

OpenVaultDB depends on ModelSpec, not SpecScore.

SpecScore can validate ModelSpec documents during development or CI. OpenVaultDB
should not require SpecScore at runtime unless an implementation explicitly chooses to
embed SpecScore validation tooling.
