# JSON Format

## Purpose

Define the JSON serialization of the ModelSpec AST.

ModelSpec JSON is a machine-readable serialization for validators, generators, and
consumers such as OpenVaultDB. HCL remains the intended authored source format.
Tooling should parse HCL into a ModelSpec AST and serialize that AST to JSON when
machine ingestion or API transport needs it.

## Format Identity

A ModelSpec JSON AST serialization MUST be a JSON object with these top-level fields:

| Field | Required | Purpose |
|---|---|---|
| `modelspec` | Yes | Format identifier and version. |
| `module` | Yes | Module identity and version metadata. |
| `components` | No | Reusable field groups. |
| `entities` | No | Identity-bearing application data concepts. |
| `collections` | No | Storage-neutral data sources or collection projections. |
| `recordsets` | No | Strict tabular result shapes. |
| `projections` | No | Advisory target-specific mapping hints. |
| `migrations` | No | Semantic migration metadata. |

The `modelspec` field MUST be the string `1.0-draft` for this draft serialization.

## Module Metadata

The `module` object identifies the published model:

```json
{
  "modelspec": "1.0-draft",
  "module": {
    "id": "github.com/acme/todo",
    "name": "Todo",
    "version": "0.1.0"
  }
}
```

`module.id` should be stable and globally meaningful. `module.version` should identify
an immutable published model version.

## Components

Components are keyed by component name:

```json
{
  "components": {
    "Auditable": {
      "fields": {
        "createdAt": {
          "type": "datetime",
          "required": true
        },
        "updatedAt": {
          "type": "datetime",
          "required": true
        }
      }
    }
  }
}
```

## Entities

Entities are keyed by entity name:

```json
{
  "entities": {
    "User": {
      "key": ["id"],
      "use": ["Auditable"],
      "properties": {
        "id": {
          "type": "uuid"
        },
        "email": {
          "type": "string",
          "required": true,
          "unique": true,
          "format": "email"
        }
      }
    }
  }
}
```

Property objects MAY use one of:

- `type` for primitive types
- `component` for embedded component values
- `entity` for relationships to another entity

## Collections

Collections are keyed by collection name:

```json
{
  "collections": {
    "tasks": {
      "kind": "editable",
      "source": "Task",
      "fields": {
        "id": {
          "type": "uuid",
          "bind": "Task.id"
        },
        "ownerId": {
          "type": "uuid",
          "bind": "Task.owner"
        }
      }
    }
  }
}
```

`kind` MUST be `editable` or `computed` in v0. Computed collections SHOULD carry a
`query` string or query reference. Query interpretation remains behind the opaque
query seam.

## Recordsets

Recordsets are keyed by recordset name:

```json
{
  "recordsets": {
    "taskSummary": {
      "key": ["id"],
      "query": "from tasks select id, title, completed",
      "columns": {
        "id": {
          "type": "uuid",
          "bind": "Task.id"
        },
        "title": {
          "type": "string",
          "bind": "Task.title"
        }
      }
    }
  }
}
```

JSON object member order is not semantic. If a consumer needs stable display or column
order, a future revision should add explicit `order` metadata or array-based shapes.

## Projections

Projection objects are advisory target-specific mapping hints:

```json
{
  "projections": {
    "sqlite": {
      "collections": {
        "tasks": {
          "source": "Task",
          "indexes": {
            "tasks_owner": {
              "fields": ["ownerId"]
            }
          }
        }
      }
    }
  }
}
```

Consumers MAY ignore projection hints. OpenVaultDB has final authority over backend
choice and backend mapping.

## Migration Metadata

Migration metadata is descriptive in v0:

```json
{
  "migrations": {
    "2026-07-08-task-title-rename": {
      "from": "0.1.0",
      "to": "0.2.0",
      "renames": [
        {
          "from": "Task.name",
          "to": "Task.title"
        }
      ]
    }
  }
}
```

ModelSpec does not execute migrations in v0.

## Validation Requirements

A validator consuming the JSON AST serialization MUST check:

- `modelspec` is present and supported.
- `module.id` and `module.version` are present.
- component, entity, collection, recordset, projection, and migration names are unique
  within their object maps.
- references resolve, including `use`, `component`, `entity`, `source`, and `bind`.
- primitive types are in the supported type set.
- constraints use supported keys and valid value types.
- projection hints do not become authoritative backend requirements.

## Open Questions

- Should ordered attributes use arrays instead of object maps in v0, or should order
  remain explicitly non-semantic until a target needs it?
- Where should a JSON Schema for this AST serialization be published?
- Should YAML be a supported secondary serialization of the same AST?
