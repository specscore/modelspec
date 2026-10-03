# ModelSpec

**Define your application data model once.**

ModelSpec is an open specification language for application data models.

It describes the logical model of an application independently of storage engines,
programming languages, API layers, and deployment platforms.

Website: <https://modelspec.org> (preview).
Repository: <https://github.com/specscore/modelspec> — the canonical home.

Although this repository is maintained under the SpecScore GitHub organization,
ModelSpec is an independent specification. Any project can adopt it without adopting
SpecScore, [OpenVaultDB](https://openvaultdb.com/), GraphSpec, or any specific backend.

## What ModelSpec Defines

ModelSpec defines storage-neutral application data models:

- entities
- fields and properties
- relationships
- reusable components
- named enumerations
- constraints
- indexes
- projections
- migration metadata
- storage-neutral schemas

ModelSpec intentionally does not define:

- RBAC or permissions
- OAuth or identity flows
- feature specifications
- workflows
- deployment topology
- UI behavior

Those concerns belong in adjacent specifications and application architecture.

## Why ModelSpec Exists

Applications usually define the same data model many times:

```text
Database schema
        |
ORM model
        |
API contract
        |
Frontend type
        |
Migration script
```

Each copy eventually drifts.

ModelSpec provides one logical source of truth:

```text
              ModelSpec
             /    |    \
            /     |     \
      GraphQL    Go    TypeScript
        |        |        |
      SQLite  PostgreSQL Firestore
        |
    OpenVaultDB
```

Generators, validators, and backends can then project the same model into their own
representations without making the application author choose a storage engine first.

## Why Not Author Storage-Specific Schemas Directly?

Storage schemas are necessary, but they are not the application model.

A relational table layout, Firestore collection hierarchy, SQLite DDL file, and Git
record layout each encode operational tradeoffs. They should be projections of the
application model, not the only place where application meaning exists.

For example, the same logical model:

```text
User
  Orders
    OrderItems
```

can become:

```text
Firestore

users/{userId}
  orders/{orderId}
    items/{itemId}
```

or:

```text
PostgreSQL

users
orders
order_items
```

without changing the logical ModelSpec definition.

## Core Ideas

ModelSpec keeps the original design principles that motivated the project:

- Composition over inheritance.
- Reusable components instead of deep type hierarchies.
- Entity semantics separated from storage containers.
- Logical models separated from physical projections.
- Advisory storage projections rather than app-owned storage decisions.
- Generators for GraphQL, Go, TypeScript, SQLite, PostgreSQL, Firestore, InGitDB, and [OpenVaultDB](https://openvaultdb.com/) schemas.
- A future catalog for canonical entities, reusable modules, and dataset mappings.
- Go-inspired composition with simple embedded components.

## Example

```hcl
component "Auditable" {
  field "createdAt" {
    type     = "datetime"
    required = true
  }

  field "updatedAt" {
    type     = "datetime"
    required = true
  }
}

entity "User" {
  key = ["id"]
  use = ["Auditable"]

  property "id" {
    type = "uuid"
  }

  property "email" {
    type     = "string"
    required = true
    unique   = true
    format   = "email"
  }
}

entity "Order" {
  key = ["id"]

  property "id" {
    type = "uuid"
  }

  property "user" {
    entity   = "User"
    required = true
  }
}

projection "sqlite" {
  collection "users" {
    source = "User"
    index "users_email_unique" {
      fields = ["email"]
      unique = true
    }
  }
}
```

## [OpenVaultDB](https://openvaultdb.com/)

[OpenVaultDB](https://openvaultdb.com/) consumes ModelSpec directly.

Applications publish a ModelSpec module. A user's vault loads the current ModelSpec
and the target ModelSpec, then uses them for:

- schema validation
- migration planning
- backend mapping
- GraphQL schema generation
- DTQL typing metadata
- DALGO metadata
- backend generators

[OpenVaultDB](https://openvaultdb.com/) remains independent from SpecScore. It depends on ModelSpec semantics, not
on SpecScore ownership or tooling.

## SpecScore

SpecScore validates ModelSpec but does not own ModelSpec semantics.

SpecScore support should include linting, structural validation, and semantic checks
for ModelSpec documents. Future CLI support should reuse existing SpecScore command
patterns, for example:

```text
specscore lint
specscore lint modelspec
specscore validate
```

ModelSpec is not a sub-language of GraphSpec. GraphSpec and ModelSpec solve different
problems and are independently specified. GraphSpec is a consumer of ModelSpec: it
references ModelSpec models, components, and enums (for example
`model: modelspec://reservations.Booking`) instead of defining structure itself. ModelSpec
never references GraphSpec. See
[decision 0012](spec/decisions/0012-graphspec-is-a-consumer.md).

## Target Architecture

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

GraphSpec consumes ModelSpec for structure; ModelSpec does not depend on GraphSpec.

## Repository Structure

- [spec/](spec/README.md): the ModelSpec language specification.
- [docs/](docs/README.md): architecture, [OpenVaultDB](https://openvaultdb.com/) integration, SpecScore integration, and catalog notes.
- [examples/](examples/README.md): example ModelSpec modules.
- [schema/](schema/README.md): planned JSON Schema publication location.
- `public/`, `src/`, `scripts/`, `tools/`, `fixtures/`, `test/`, `e2e/`: the [modelspec.org](#website-modelspecorg) site and its build.

## Authored And Machine Formats

HCL is the intended authored source format for ModelSpec.

Tooling should parse HCL into a ModelSpec AST. Validators, generators, and consumers
can then ingest serialized AST forms, with JSON as the first machine-readable
serialization and YAML as a possible secondary serialization. See
[spec/hcl-authoring.md](spec/hcl-authoring.md),
[spec/json-format.md](spec/json-format.md), and
[docs/format-analysis.md](docs/format-analysis.md).

## Website (modelspec.org)

The site is the landing page (`public/`) plus registry pages generated at build
time from three public indexes. It is served by one Cloudflare Worker
(`wrangler.jsonc`, Workers Static Assets) from `dist/`, which is not committed:

```text
dist/  =  copy of public/            the landing page, style.css, script.js, favicon, registry.css
       +  registry/                  /registry/ and /registry/models/<id>/ (generated)
       +  build-info.json            what the build was made from (read by the deploy guard; served at /build-info.json)
       +  .modelspec-build-output    marker: this directory was created by the build
       +  .assetsignore              keeps the marker out of the upload
```

The registry is new and a draft. `/registry/` lists every model of the
[ModelSpec registry](https://github.com/modelspec-org/registry); each model page
shows its entities and properties (anchors `#entity-<Name>`,
`#property-<Entity>-<Property>`), the components it declares with their fields
(`#component-<Name>`, `#field-<Component>-<Field>`) and the components each entity
embeds (`use`), the MeaningGraph graphs that bind it and the OVDB
Directory databases that use it. When the registry entry has the optional `homepage`,
the model page also links it as **Website**. Every page is static HTML and works without
JavaScript.

Requires Node.js 22 or newer.

```sh
npm ci
npm run build           # production: reads the three live indexes, writes dist/
npm run build:fixture   # reads the committed fixtures, writes dist-fixture/ (never dist/)
npm run dev             # fixture build, then wrangler dev --local on dist-fixture/
npm run check           # syntax checks and a fixture build into dist-check/
npm test                # unit tests (node:test)
npm run test:e2e        # Playwright against fixture builds served by wrangler dev --local, desktop and 375px
npm run deploy          # production build, guard, wrangler deploy with pinned --config and --assets
```

### Data sources

| Variable | Default | What |
|---|---|---|
| `MODELSPEC_REGISTRY_INDEX_URL` | `https://raw.githubusercontent.com/modelspec-org/registry/main/index.json` | models with their entities and properties (`modelspec-registry/draft-1`) |
| `MEANINGGRAPH_REGISTRY_INDEX_URL` | `https://raw.githubusercontent.com/meaninggraph/registry/main/index.json` | graphs and the model files they bind (`meaning-registry/draft-1`) |
| `OVDB_DIRECTORY_INDEX_URL` | `https://raw.githubusercontent.com/openvaultdb/directory/main/index.json` | databases and the model they use (`ovdb-directory/draft-1`) |
| `MEANINGGRAPH_BASE_URL` | `https://meaninggraph.io` | links to `/graphs/<graph>/` |
| `OVDB_DIRECTORY_BASE_URL` | `https://directory.openvaultdb.com` | links to `/databases/<id>/` |

Index URLs must be https; a local file needs `--allow-local-index`. Base URLs
must be https, or http on localhost. The pages read only what they show (the
formats are drafts, unknown fields are ignored) and validate it: ids, names and
commits are checked, every URL must be https, and everything is escaped into the
HTML.

"Meaning graphs for this model" are the graphs whose repository is the model's
repository and whose `model_files` include one of the model's two files.
"Databases using this model" are the Directory databases whose `model.address` is
the model's address or, while their entry carries no `model.address`, whose
repository and `model.path` are the model's repository and source file. Addresses
are compared without a `?ref=` pin and without regard to the case of the GitHub owner
and repository (the module name is case-sensitive); a registered model's own
address must be unpinned. A database that names another address never matches by
repository and path.

### Fixtures, non-production builds and the deploy guard

A build is **production** only when it reads all three indexes from the defaults
above and links the real MeaningGraph and OVDB Directory sites. It is the only
build that may be written to `dist/`, and it fails loudly (and leaves nothing
behind) when any index is unreadable or invalid. There is no fallback to older or
hand-written data. Until `modelspec-org/registry` and `openvaultdb/directory` have
an `index.json` on `main`, a production build fails; that is expected.

Everything else is a **non-production** build:

- `--use-fixture` reads `fixtures/*.fixture.json`: verbatim copies of real indexes
  with a top-level `_fixture` marker naming where each was copied from (the ModelSpec
  one has `homepage` added by hand to Chinook, noted in its marker).
  `--use-fixture --fixture-set two-databases` swaps the Directory fixture for a
  derived one in which a second database names the same model by address, and
  `--fixture-set two-by-address` for one in which both databases do. An index carrying
  `_fixture` is refused by every other build; fixture mode refuses an index without
  it and any index variable. Regenerate with
  `npm run fixtures -- --modelspec <url> --directory <url> --meaninggraph <url>` (the
  copies were made from commit-pinned raw URLs; the checksums are verified first).
- Any other https index or base URL, or a local file, is also non-production.
- A non-production build goes to its own directory and carries a red banner on every
  page, `<meta name="modelspec-build-source">` on every page and a `build-info.json`
  with `"production": false`. To preview real data that is not on `main` yet, for example:
  `MODELSPEC_REGISTRY_INDEX_URL=<branch index URL> OVDB_DIRECTORY_INDEX_URL=<branch index URL> node scripts/build.mjs`
  writes `dist-nonprod/`.
- `--out` accepts only `dist` (production only), `dist-fixture`, `dist-nonprod`,
  `dist-check`, `dist-e2e`, `dist-e2e-two` and `dist-e2e-address`. The build deletes an output directory
  only if it is absent, empty, or holds the marker file `.modelspec-build-output`
  that an earlier build wrote (kept out of the upload by `.assetsignore`); a symbolic
  link or anything else is refused. It never touches `public/`, `spec/`, `schema/`,
  the repository root or anything outside the repository.

Deploying. The site deploys itself (see Deployment below);
`.github/workflows/site.yml` stays a tests-only workflow (unit tests, fixture
build, browser tests; read-only, no secret).

`npm run deploy` is the one supported way, and what the deploy workflow runs. It takes no arguments and no index or
base-URL override, refuses to run while a `wrangler.json`, a `wrangler.toml` or a
`.wrangler/deploy/config.json` redirect exists (they could make wrangler read some
other configuration, and git-ignored ones do not show in `git status`), runs
`check`, builds `dist/`, verifies it, and only then runs
`wrangler deploy --config <repo>/wrangler.jsonc --assets <repo>/dist` with absolute
paths, so the configuration is `wrangler.jsonc` and the directory uploaded is the
directory the guard checked.

What the guard covers. `wrangler.jsonc` runs `scripts/check-build.mjs` as its build
command, so a plain `wrangler deploy`, `wrangler deploy --dry-run` and
`wrangler versions upload` from this checkout refuse anything but a production
build of `dist/`: `build-info.json` must say production from the three default
indexes and links, every generated page must carry the production marker, and
`dist/` must be exactly `public/` plus the generated `registry/` pages (so the
landing page is byte-identical to `public/index.html`) with the `.assetsignore` the
build writes. `wrangler dev` only warns. What it does **not** cover: the guard
checks `dist/`, not whatever else wrangler is told to upload, so
`wrangler deploy --assets <other directory>` (the `dev` script and the browser tests
use `--assets` on purpose), a `--config <other file>`, and the configuration files
listed above bypass it. Only `npm run deploy` is protected against those flags and
files; do not deploy with plain wrangler.

`build-info.json` is uploaded (only the build marker is kept out by `.assetsignore`):
the deploy workflow compares the live one with the current commit and indexes. It
lists the source and checksum of each index, the pinned commits and the commit of
this repository, and holds no local path. The guard refuses a `.assetsignore` that
would hide it.

### Deployment

`.github/workflows/deploy.yml` checks, builds and publishes the Worker, so nobody runs `npm run deploy` by hand.

| Trigger | What runs |
|---|---|
| push to `main` | unit tests, `npm run check`, the production build and its guard, the browser tests, then `npm run deploy` and a smoke check |
| manual run (Actions, "Deploy", on `main` only; also how a data repository notifies this site) | first asks whether anything changed (below) and ends at once, green, when not; otherwise the unit tests, `npm run check`, the production build and its guard, `npm run deploy` and the smoke check. With `force` it skips the question and always deploys |
| pull request | the same checks and the production build; never a deploy, never in a fork |

**What triggers a deploy.** Three things, and nothing runs on a timer:

1. a push to `main`;
2. a notification from a data repository: when `index.json` changes in a repository this site is built from (the ModelSpec, MeaningGraph or OVDB Directory index), that repository's `notify-sites` workflow starts the "Deploy" workflow here on `main`;
3. a manual run of "Deploy" on `main` (Actions tab). Any other branch is refused. The boolean input `force` (default off) skips the freshness question below and deploys regardless; the text input `reason` is shown in the run summary and is treated as untrusted text.

A notification that arrives twice, or late, costs seconds: the run compares first and ends green when the live site already matches.

Runs are serialised (one concurrency group), so a notified run and a push never deploy at the same time.

**What a manual or notified run compares.** Every build writes `build-info.json`, served at `https://modelspec.org/build-info.json`. It records `commit` (the commit of this repository, from `BUILD_COMMIT`, set by the workflow; `null` for a local build) and `checksums` (the `checksum` field of each of the three indexes the site is built from: the ModelSpec registry, the MeaningGraph registry and the OVDB Directory index). A manual run without `force` runs `scripts/check-fresh.mjs` before installing anything: it fetches the live marker and the three current indexes and compares them (`src/freshness.mjs`, unit-tested without a network). When the commit and all three checksums match, it logs that nothing changed and ends in seconds. Otherwise it logs which of them differs, then builds and deploys. A live marker that is missing, unreadable or from before these fields existed counts as a difference; an index that cannot be read, or carries no checksum, fails the run (the build would fail the same way). It refuses an overridden index or base URL, like `npm run deploy`. After a deploy `scripts/smoke-live.mjs` fetches the live marker again, retrying for about a minute, and fails unless it records the build just made; it also checks that `/` and `/registry/` answer 200.

**Credentials.** The deploy needs the `CLOUDFLARE_API_TOKEN` secret and the `CLOUDFLARE_ACCOUNT_ID` variable (an identifier, not a secret) on this repository or on the `specscore` organisation shared with it. When either is missing the workflow still runs the checks and the production build, skips the deploy and the smoke check with a notice (a `::notice::` and a line in the job summary) and ends green; a manual run without `force` and without them stops before building, as it has nothing to deploy to. The token is only ever passed to the deploy step's environment. It needs edit rights on the Worker and on the custom domain's zone (see the route in `wrangler.jsonc`): a token without DNS rights can upload the Worker and still fail at the domain step.

**Deploying by hand in an emergency.** From a clean checkout on the commit to publish, with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` set in your shell:

```sh
npm ci
npm run deploy     # checks, builds dist/ from the three production indexes, verifies it, runs wrangler deploy
```

Or run the "Deploy" workflow from the Actions tab. A local build has no `commit` in its marker, so the next manual or notified run (without `force`) sees a difference and deploys the pipeline's version over it.

Deploy order. The landing page and every registry page link to the Chinook pages on
https://meaninggraph.io (`/graphs/chinook/`) and https://directory.openvaultdb.com
(`/databases/chinook/`). The build checks that the three indexes carry Chinook, and
that the Chinook graph and database belong to the Chinook model, but it cannot see
whether those two sites are live. Make a first production deploy only after both
Chinook pages are live (the cross-browse plan's task 6 comes before task 7), and
check the links in its journey test.

## Status

ModelSpec is in early specification development. The current work preserves and
improves the original storage-neutral data-model design while positioning it as an
independent open specification for application data models.

## License

ModelSpec is licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).

## Open Questions

None at this time.
