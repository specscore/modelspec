# SpecScore Integration

SpecScore validates ModelSpec but does not own ModelSpec semantics.

ModelSpec is a first-class specification that SpecScore can understand alongside
other specifications. It is not a sub-language of GraphSpec; GraphSpec is a consumer
that references ModelSpec models for structure (see
[decision 0012](../spec/decisions/0012-graphspec-is-a-consumer.md)).

## Supported Validation Modes

SpecScore support should include:

- linting ModelSpec documents for structure and style
- validating syntax and references
- semantic checking against ModelSpec rules
- reporting located diagnostics
- participating in repository-wide specification checks

## CLI Direction

Future CLI support should reuse existing SpecScore conventions rather than adding a
separate command architecture.

Examples:

```text
specscore lint
specscore lint modelspec
specscore validate
```

Compatibility with current `specscore spec lint` workflows should be preserved while
the shorter command forms mature.

## Ownership Boundary

When a diagnostic depends on ModelSpec semantics, ModelSpec is the source of truth.

SpecScore owns command behavior, output format, repository traversal, configuration,
and integration with CI.

SpecScore does not define:

- ModelSpec concept vocabulary
- ModelSpec type semantics
- ModelSpec projection semantics
- ModelSpec migration metadata semantics
