# Catalog Vision

## Overview

The ModelSpec catalog is a future ecosystem for discovering, sharing, versioning, and
linking ModelSpec modules, entities, datasets, and data sources.

The catalog complements the specification. It is not the source of truth.

## Git-Native Modules

ModelSpec modules should be publishable as Git repositories:

```text
github.com/modelspec/currency
github.com/modelspec/country
github.com/acme/payments
```

Immutable Git tags provide version identity:

```text
v0.1.0
v0.2.0
v1.0.0
```

The repository remains authoritative. A catalog can provide discovery, metadata,
dependency graphs, caching, and checksum verification.

## Canonical Entities

The catalog may host reusable standard entities:

- Currency
- Country
- Address
- Person
- Company
- ExchangeRate

Shared entities become stable interoperability points across applications and
datasets.

## Dataset Mappings

Datasets can publish mappings to canonical entities:

```text
Dataset: Orders

currency_code -> Currency.code
order_date    -> Date.value
```

```text
Dataset: ExchangeRates

currency_code -> Currency.code
date          -> Date.value
```

Because both datasets map to the same entities, tooling can discover joins and
enrichment paths.

## Long-Term Direction

The catalog should help models become:

- composable
- discoverable
- versioned
- reusable
- interoperable across datasets

The network effect should come from shared semantics rather than shared storage.
