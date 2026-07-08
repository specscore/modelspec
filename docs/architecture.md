# Architecture

ModelSpec is the independent specification for application data models.

```text
                    ModelSpec
               /    |     |     \
              /     |     |      \
     OpenVaultDB  DALGO  GraphSpec  Generators
           |
      GraphQL
      DTQL
      SQLite
      Firestore
      PostgreSQL
      InGitDB

SpecScore
     |
 validates ModelSpec
```

GraphSpec consumes ModelSpec: graph entities reference ModelSpec models instead of
defining structure. ModelSpec does not depend on GraphSpec. See
[decision 0012](../spec/decisions/0012-graphspec-is-a-consumer.md).

## Responsibilities

| Concern | Owner |
|---|---|
| Logical application model | ModelSpec |
| Backend storage decision | Consuming backend or vault |
| Generated target artifacts | Generators |
| Schema validation at runtime | Consumer such as OpenVaultDB |
| Linting and semantic checks | Validation tooling such as SpecScore |
| Permissions and grants | Application or vault security model |

## Independence

ModelSpec is not part of OpenVaultDB. OpenVaultDB is one consumer.

ModelSpec is not part of SpecScore. SpecScore is one validator.

ModelSpec is not part of GraphSpec. GraphSpec solves a different domain-modelling
problem and is one more consumer: it references ModelSpec models for structure while
owning connected domain semantics (modules, relationships, commands, events,
lifecycle). The dependency arrow never points out of ModelSpec.

## Design Rule

If a concept changes when the storage backend changes, it probably belongs in a
projection.

If a concept changes when the permission model changes, it probably belongs outside
ModelSpec.

If a concept describes what data exists and how it relates, it belongs in ModelSpec.
