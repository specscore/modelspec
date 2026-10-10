# ModelSpec

**Define your application data model once.**

ModelSpec is an open specification language for application data models.

It describes the logical model of an application independently of storage engines,
programming languages, API layers, and deployment platforms.

Website: <https://modelspec.org> (preview).
Repository: <https://github.com/specscore/modelspec> — the canonical home.

Production builds show registry search on `/registry/` using the reviewed VM pilot at `https://search.openvaultdb.com/v1/registry-search`. This public-site pilot does not change the Cloud gateway prerequisite for the DataTug launch. A production override requires both `REGISTRY_SEARCH_MODE=vm-pilot` and that exact `REGISTRY_SEARCH_ENDPOINT`; fixture builds retain their local endpoint.

Although this repository is maintained under the SpecScore GitHub organization,
ModelSpec is an independent specification. Any project can adopt it without adopting
SpecScore, [OpenVaultDB](https://openvaultdb.com/), GraphSpec, or any specific backend.

## What ModelSpec Defines

ModelSpec defines storage-neutral application data models:

- record types and their fields
- keys
- references between record types
- reusable components
- named enumerations
- constraints

ModelSpec intentionally does not define:

- RBAC or permissions
- OAuth or identity flows
- feature specifications
- workflows
- deployment topology
- UI behavior

Those concerns belong in adjacent specifications and application architecture.

The words `projection`, `index` and `migration` are reserved and have no content
yet.

Earlier drafts wrote a record type as `entity` and its fields as `property`. In a
model that is being written or registered that spelling is an error: from the
reference CLI's release that follows 0.2.0 (expected as 0.3.0), `modelspec lint`
reports it as one and `modelspec export` refuses the file, and
`modelspec rewrite --write` converts a file. A document that a pin names keeps its
spelling and stays readable, and a model that refers to one is not made invalid by
it: `modelspec lint` keeps a warning for a module that is only referred to. These readers read both spellings: SpecScore CLI
0.55.0, MeaningGraph CLI 0.3.0, OpenVaultDB's publisher CLI 0.42.0, CodeGrapher
0.16.0, the public ModelSpec registry's check and the registry sites (modelspec.org,
meaninggraph.io and the OVDB Directory site). Three of them were observed on 10
October 2026 not to report the earlier spelling as an error in a model they check:
SpecScore's `graph lint` 0.55.0 gave an advisory notice, the public registry's check
printed a notice, and OpenVaultDB's publisher check 0.43.0 reported nothing about
it, each with exit status 0. The rule is required of the reference CLI, and every
other checker follows it by its own decision. On 9 October 2026 CodeGrapher's web
client did not read the current spelling. On LANDING-DATE no registered model was
pinned in the earlier spelling. See
[spec/core-model.md](spec/core-model.md#deprecated-spellings).

## Shape, Not Meaning

ModelSpec answers one question about data: what shape it has. MeaningGraph says what
the data means, and [OpenVaultDB](https://openvaultdb.com/) says where it is. A model
declares names, types, keys, and references; it does not say what a name means or
which database holds the data. See
[decision 0017](spec/decisions/0017-one-question-per-layer.md).

Published models are listed in the
[ModelSpec registry](https://github.com/modelspec-org/registry). Shared definitions of
what data means belong to MeaningGraph, not to a ModelSpec catalog.

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
application model, not the only place where the application's data model is written
down.

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
- The shape of a record separated from the place that stores it.
- Statements about one database kept with that database, not in the model.
- Generators for GraphQL, Go, TypeScript, SQLite, PostgreSQL, Firestore, InGitDB, and [OpenVaultDB](https://openvaultdb.com/) schemas. Planned; none is implemented.
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

record "User" {
  key = ["id"]
  use = ["Auditable"]

  field "id" {
    type = "uuid"
  }

  field "email" {
    type     = "string"
    required = true
    unique   = true
    format   = "email"
  }
}

record "Order" {
  key = ["id"]

  field "id" {
    type = "uuid"
  }

  field "user" {
    record   = "User"
    required = true
  }
}
```

## [OpenVaultDB](https://openvaultdb.com/)

[OpenVaultDB](https://openvaultdb.com/) says where data is. A database published to
the OVDB Directory names the ModelSpec model it follows, and `ovdb publisher check`
verifies that the recordsets it lists are the record types of that model.

The intended integration goes further, and none of it is implemented. An application
would publish a ModelSpec module; a user's vault would load the current ModelSpec and
the target ModelSpec, then use them for:

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
- [schema/](schema/README.md): the JSON Schemas of the JSON form, also served at `https://modelspec.org/schema/`.
- `public/`, `src/`, `scripts/`, `tools/`, `fixtures/`, `test/`, `e2e/`: the [modelspec.org](#website-modelspecorg) site and its build.

## Authored And Machine Formats

HCL is the intended authored source format for ModelSpec.

Tooling should parse HCL into a ModelSpec AST. Validators, generators, and consumers
can then ingest the serialized AST. JSON is the machine-readable serialization; YAML
is not supported in v0
([decision 0011](spec/decisions/0011-yaml-serialization-out-of-v0.md)). See
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
       +  schema/                    copy of schema/*.schema.json, byte for byte (served at /schema/<name>)
       +  build-info.json            what the build was made from (read by the deploy guard; served at /build-info.json)
       +  .modelspec-build-output    marker: this directory was created by the build
       +  .assetsignore              keeps the marker out of the upload
```

The registry is new and a draft. `/registry/` lists every model of the
[ModelSpec registry](https://github.com/modelspec-org/registry); each model page
shows its record types and their fields (anchors `#record-<Name>` and
`#field-<Record>-<member>`, under the section `#records`), the components it declares
with their fields (`#component-<Name>`, `#field-<Component>-<Field>`) and the
components each record type embeds (`use`), the MeaningGraph graphs that bind it and the OVDB
Directory databases that use it. When the registry entry has the optional `homepage`,
the model page also links it as **Website**. Every page is static HTML and works without
JavaScript.

Other sites link to the anchors that the pages carried before the rename:
`#entity-<Name>`, `#property-<Record>-<member>` and `#entities`. They keep opening on
the same record type, field row and section for ever. An element has one id, so each
of them is an empty element (`<span class="reg-alias" id="...">`) that is the first
child of the element it stands for. The search export still names those anchors.

A record type and a component of one model must not share a name: the specification
refuses such a model, and so does the build, because `#field-<Record>-<member>` would
equal `#field-<Component>-<Field>`. An index entry may leave `collections` out or
empty; ModelSpec removed the collection, and the build refuses an entry that lists
one.

The homepage and Registry direct public-source discovery to the OVDB Directory's
Explore section. The old `/registry/sources/` route remains a bookmark migration
notice with a same-tab Directory link; it no longer lists or filters sources.
Model pages preserve related source evidence, filtered by explicit model ID.
These metadata links do not establish native-field bindings or activate source
access. Source metadata and pinned-index validation remain unchanged.

**JSON Schemas.** Every build, production or not, copies each `schema/*.schema.json`
of this repository, byte for byte, to `schema/<same name>` in its output, so the
deployed site answers `https://modelspec.org/schema/<name>`
([decision 0010](spec/decisions/0010-json-schema-publication.md)). Other files of
`schema/`, `schema/README.md` among them, are not published. A build fails if
`schema/` holds no `*.schema.json` file, and `public/schema` is refused as a clash.
The schema files are checked by the unit tests (`test/schema.test.mjs`, ajv, JSON
Schema 2020-12).

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
| `MODELSPEC_REGISTRY_INDEX_URL` | `https://raw.githubusercontent.com/modelspec-org/registry/main/index.json` | models with their entities and properties, or their records and fields: both spellings are read, the current one first; a current key that is absent or `null` counts as not written, an empty array is written and wins (`modelspec-registry/draft-1`) |
| `MEANINGGRAPH_REGISTRY_INDEX_URL` | `https://raw.githubusercontent.com/meaninggraph/registry/main/index.json` | graphs and the model files they bind (`meaning-registry/draft-1`) |
| `OVDB_DIRECTORY_INDEX_URL` | `https://raw.githubusercontent.com/openvaultdb/directory/main/index.json` | databases and the model they use (`ovdb-directory/draft-1`) |
| `MEANINGGRAPH_BASE_URL` | `https://meaninggraph.io` | links to `/graphs/<graph>/` |
| `OVDB_DIRECTORY_BASE_URL` | `https://directory.openvaultdb.com` | links to the Directory `directoryPath` from the pinned index (legacy indexes fall back to `/databases/<recordId>/`) |

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

- `--use-fixture` reads `fixtures/*.fixture.json`, marked nonproduction. The
  supported cohort preserves the original Chinook database/model and Chinook/core
  graphs, adds exact registered ECB/GeoNames/ROR targets from pinned upstream indexes,
  and includes the exact 19-source Directory metadata envelope. Derived provenance
  and selected IDs are recorded in `_fixture`; list checksums are recomputed.
  `--use-fixture --fixture-set two-databases` adds a coherent global second-host
  database with the same model address; `--fixture-set two-by-address` also names
  the original database by model address. All variants keep the same source checksum.
  An index carrying `_fixture` is refused by every other build; fixture mode refuses
  an index without it and any index variable. Reproduce this supported cohort with
  `npm run fixtures -- --supported-cohort`; its default upstream inputs are the
  reviewed commit-pinned URLs in `tools/make-fixtures.mjs`. It validates all inputs
  and both derived variants before writing. Explicit `--modelspec`, `--directory`
  and `--meaninggraph` inputs select alternate fixture metadata and record their
  actual input provenance.
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
`dist/` must be exactly `public/` plus the generated `registry/` pages plus `schema/`
(so the landing page is byte-identical to `public/index.html`, and `schema/` holds the
repository's `schema/*.schema.json`, byte-identical, and nothing else: a missing,
extra or altered schema file is refused by name) with the `.assetsignore` the build
writes. `wrangler dev` only warns. What it does **not** cover: the guard
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

The site deploys itself: `.github/workflows/deploy.yml` checks, builds and publishes the Worker, so nobody runs `npm run deploy` by hand.

**What triggers a deploy.** Three things, and nothing runs on a timer:

1. a push to `main`;
2. a notification from a data repository: when `index.json` changes in a repository this site is built from (the ModelSpec registry, the MeaningGraph registry or the OVDB Directory index), that repository's `notify-sites` workflow starts the "Deploy" workflow here on `main`. The notification carries no data but a reason; the run finds out for itself what changed;
3. a manual run of "Deploy" on `main` (Actions tab). Any other branch is refused. Inputs: `force` (boolean, default off) skips the freshness comparison below and nothing else; `reason` (text) is shown in the run summary and is treated as untrusted text (control characters, colons and backticks are dropped, the rest is HTML-escaped, and it is never put in a command).

| Trigger | What runs |
|---|---|
| push to `main` | resolve the data repository commits, unit tests, `npm run check`, the production build and its guard, the browser tests, then the deploy and a smoke check |
| manual run or notification | resolve, then the freshness step (below), then the same as a push |
| pull request | the same checks and the production build; never a deploy, never in a fork |

**Every run that can deploy runs every check.** No check is conditional on the event: a manual or notified run runs the unit tests, `npm run check`, the build and its guard and the browser tests exactly as a push does. (`test/deploy-workflow.test.mjs` fails if a check step gets a condition on the event, on `force` or on the ref, and if `deploy.yml` runs fewer steps than `site.yml`, in another order, with a condition or `continue-on-error`, or after the deploy.) The only run that skips them is one that ends before building because the live site is already current.

**The indexes are read at an exact commit.** `raw.githubusercontent.com` answers from a cache that can be five minutes old, so a build that reads `.../main/index.json` can miss a change made minutes ago. Every run therefore first resolves the current `main` of each data repository to a commit with `git ls-remote` (not cached, no token, a cleaned git environment, a time limit and retries; `scripts/resolve-index-commits.mjs`) and reads each index from `https://raw.githubusercontent.com/<org>/<repo>/<commit>/index.json`, which never changes. Nothing waits for a checksum, so a notification that is superseded by a newer change simply builds the newer state. The commits are passed to the later steps through `GITHUB_ENV` after they were checked to be 40 lower-case hex digits (`MODELSPEC_REGISTRY_INDEX_COMMIT`, `MEANINGGRAPH_REGISTRY_INDEX_COMMIT`, `OVDB_DIRECTORY_INDEX_COMMIT`).

**The freshness step.** Every build writes `build-info.json`, served at `https://modelspec.org/build-info.json`. It records `commit` (the commit of this repository, from `BUILD_COMMIT`, set by the workflow; `null` for a local build), `indexCommits` (the commit of each data repository the index was read at) and `checksums` (the `checksum` field of each of the three indexes the site is built from). A manual or notified run runs `scripts/check-fresh.mjs` before installing anything. Unless `force`, it fetches the live marker and compares its `commit` and `indexCommits` with this commit and the resolved ones (`src/freshness.mjs`, unit-tested without a network). When they all match, it logs that nothing changed and the run ends green in seconds. Otherwise it logs which of them differs, then builds and deploys. A live marker that is missing, unreadable or from before these fields existed counts as a difference. It refuses an overridden index or base URL, like `npm run deploy`.

Values fetched from public URLs are shape-checked before they are printed (a commit is 40 hex digits, a checksum `sha256:` and 64 hex digits, anything else prints as "invalid"), and other fetched text loses control characters and colon runs.

**What the production guard accepts.** For each index, the build must read either its production URL (`.../<org>/<repo>/main/index.json`) or exactly `https://raw.githubusercontent.com/<same org>/<same repo>/<40 lower-case hex digits>/index.json`, and nothing else: no other host, repository, branch, path or query (`src/index-commits.mjs`, used by `src/config.mjs` and `scripts/check-build.mjs`). `npm run deploy` takes the commits from the three `*_INDEX_COMMIT` variables (all or none; not together with the URL variable of the same index) or, when none are set, the build resolves the current `main` of each data repository itself (`npm run build` by hand does the same). A build that names an index by URL reads exactly that URL and resolves nothing.

**What is uploaded is what was built.** At the end of every build, `dist/` gets a manifest of the SHA-256 of every file the build wrote (`.modelspec-build-manifest.json`, kept out of the upload by `.assetsignore`, like the build marker). `scripts/check-build.mjs`, which `wrangler deploy` runs as its build command, verifies `dist/` against it (an extra, a missing or a changed file is refused, by name). `npm run deploy -- --use-existing-build`, which the workflow runs, uploads a `dist/` it did not build, so before `wrangler` starts it also requires that the marker's `commit` is the commit of `HEAD` and that `git status` shows a clean tree (no tracked change, no untracked file). The build empties its output directory first.

**After the deploy,** `scripts/smoke-live.mjs` fetches the live marker and the pages (`/`, `/registry/` and `/registry/sources/`) and the published schema (`/schema/modelspec-ast.schema.json`) again, each retried with growing waits (5 to 30 seconds, about two and a half minutes in all), and fails the run red unless the marker records the build just made and the pages and the schema answer 200.

**There is no automatic rollback.** A red smoke check, or a deploy that fails part-way, leaves whatever Cloudflare has made live, live. To go back by hand: `npx wrangler rollback` (it makes the previously deployed version of the `modelspec-org` Worker the active deployment at once; `npx wrangler rollback <VERSION_ID>` picks another of the last 100 versions, and `npx wrangler deployments list` shows them), or revert the commit and push, which redeploys. Cloudflare documents rollback for Workers versions; it has not been tried on this Worker with static assets, so check the live site afterwards.

**Transient failures.** A run that fails on a transient error (a network error in a check or the build, or a Cloudflare API error) is not retried: run "Deploy" again.

**Credentials.** The deploy needs the `CLOUDFLARE_API_TOKEN` secret and the `CLOUDFLARE_ACCOUNT_ID` variable (an identifier, not a secret). Neither exists for this repository today (set them on the repository or on the `specscore` organisation shared with it). When either is missing the workflow still runs the checks and the production build, skips the deploy and the smoke check with a notice (a `::notice::` and a line in the job summary) and ends green; a manual run without `force` and without them stops before building, as it has nothing to deploy to. **The token is in the environment of one step, "Deploy", and nowhere else**: not of an install, the check, the build or the browser tests, which parse the public indexes. "Deploy" runs `npm run deploy -- --use-existing-build`: no check, no build, nothing installed; it verifies that the build was made at `HEAD` with a clean tree and that the `dist/` the earlier steps made and guarded matches the build manifest, then runs `wrangler deploy --config <repository>/wrangler.jsonc --assets <repository>/dist`, which runs this repository's `scripts/check-build.mjs` once more. Inside `npm run deploy` (by hand, without the flag) the credentials are likewise removed from the environment of the check and the build and given to the wrangler call only. Nothing fetched from a public URL is read or executed in that step. The account id (`vars.CLOUDFLARE_ACCOUNT_ID`) is not masked in this public repository's logs; wrangler error messages can include it. It is an identifier, not a credential; keep it as a secret if it should not be public.

**Not done, on purpose.** The Cloudflare token is a repository or organisation secret, so any workflow that can run on `main` can read it. Keeping it in a GitHub environment limited to `main` would narrow that to the one "Deploy" job; that is a setting in the repository, not a change to this workflow, and it is left to the owner.

**Custom domain.** `wrangler.jsonc` declares the custom domain `modelspec.org`. A token without the rights to change the zone's custom domains and DNS (Cloudflare: the Worker's Editor role plus Workers Routes Write on the zone) can fail at the domain step even when the domain is already attached. Cloudflare's documentation says `wrangler deploy` changes routes and custom domains as part of the deployment but not in what order it uploads the version and updates them; so after such a failure the run is red and the smoke check is skipped, and whether the new version is already live is not documented. Look at the live marker (`/build-info.json`), and use the rollback above if you want the previous version back.

**Deploying by hand in an emergency.** From a clean checkout on the commit to publish, with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` set in your shell:

```sh
npm ci
npm run deploy     # checks, builds dist/ from the three production indexes, verifies it, runs wrangler deploy
```

Or run the "Deploy" workflow from the Actions tab (with `force` to skip the comparison). A by-hand `npm run deploy` resolves the data repository commits itself (the build step does it when none are given) and records them in the marker. A local build has no `commit` in its marker, so the next manual or notified run (without `force`) sees a difference and deploys the pipeline's version over it.

Deploy order. The landing page and every registry page link to the Chinook pages on
https://meaninggraph.io (`/graphs/chinook/`) and https://directory.openvaultdb.com
(`/ovdb/demodb.dev/chinook/`). The build checks that the three indexes carry Chinook, and
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
