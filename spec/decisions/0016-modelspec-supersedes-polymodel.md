---
format: https://specscore.md/decision-specification
status: Approved
---

# Decision: ModelSpec Supersedes PolyModel

**Status:** Approved
**Date:** 2026-08-22
**Owner:** alexander.trakhimenok@gmail.com
**Tags:** governance,naming,supersession,public-surface
**Source Idea:** —
**Supersedes:** —
**Superseded By:** —

## Context

PolyModel and ModelSpec are the same specification under two names. PolyModel came
first — `polymodel.org`, the `polymodel-org` GitHub organisation, a spec repo, a Go
library, a CLI and a marketing site — and its content was subsequently absorbed into
ModelSpec, which is where all work has continued: PolyModel's repositories were last
touched in June 2026 and ModelSpec's have been active since.

The rename was deliberate. **PolyModel proved weak as a name** — forgettable to the
point that its own author, after registering the domain, could not immediately recall
what the project was for. **ModelSpec states the thing plainly**: a specification for
describing data and domain models. The domain `modelspec.org` and the repository
`specscore/modelspec` were created to carry it.

What was never done is the public half of the rename. The
[readiness review of 2026-07](https://github.com/specscore/specscore/blob/main/spec/features/graphspec/reviews/readiness-review-2026-07.md)
recorded the consequence as a launch blocker: the PolyModel repositories are still
public and unarchived, and **no supersession is recorded anywhere**. A reader arriving
at PolyModel has no way to learn that ModelSpec exists, and a reader arriving at
ModelSpec has no way to learn that PolyModel is dead. Two live sibling standards by
the same author, neither pointing at the other, undermines both.

This decision records the supersession so that the public decommission
([task A3 of the ModelSpec v1.0 readiness plan](https://github.com/specscore/specscore/blob/main/spec/plans/v1-readiness.md))
has something normative to point at.

## Decision

1. **ModelSpec is the canonical name.** PolyModel is retired. No specification work
   continues under the PolyModel name, and no new artifact may be published under it.

2. **`modelspec.org` is the canonical home**, and `specscore/modelspec` the canonical
   repository. `polymodel.org` redirects to `modelspec.org`.

3. **The PolyModel repositories are archived, not deleted.** Each archived repository's
   README states that PolyModel is superseded by ModelSpec and links here. Deleting
   them would break inbound links and erase the project's history; archiving preserves
   both while making the status unambiguous. `polymodel-go` and `polymodel-cli` were
   never released — they carry no tags — so archiving breaks no published module.

4. **ModelSpec remains independent.** It is not part of GraphSpec and not a component
   of SpecScore. SpecScore may validate and support ModelSpec, and GraphSpec consumes
   it (see [decision 0012](0012-graphspec-is-a-consumer.md)); other consumers —
   OpenVaultDB, generators, projectors — consume it on the same terms. Retiring
   PolyModel changes ModelSpec's name history, not its layering.

5. **Supersession is one-directional and final.** PolyModel has no remaining scope of
   its own. Any capability that appeared only in PolyModel is either already absorbed
   into ModelSpec or is out of scope; it is not to be reintroduced by reference to
   PolyModel.

## Rationale

A name that its own author cannot recall the meaning of is a defect in a specification
that hopes to be adopted by strangers. "PolyModel" describes a property of the thing
(many projections) without naming what it is; "ModelSpec" names it. For a specification
whose entire value is being referenced by other people's tools and documents, being
guessable beats being clever.

Recording the supersession — rather than quietly letting PolyModel rot — is what makes
the rename real. The 2026-07 readiness review found the opposite state: two public
sibling standards, neither pointing at the other, and no document anywhere stating which
one was current. That is worse than either name alone, because it forces every reader to
adjudicate.

Archiving rather than deleting follows from the same reasoning. The cost of a dead-but-
readable repository with a pointer at its top is near zero; the cost of a 404 where a
specification used to be is borne by everyone who ever linked to it.

## Declined Alternatives

### Keep both names alive, PolyModel as an alias

Rejected. Two names for one specification doubles the surface every consumer must
recognise, and an alias with its own domain, org and repositories is not an alias — it
is a fork waiting to drift. The readiness review already found them drifting.

### Delete the PolyModel repositories

Rejected. It breaks every inbound link and erases the project's history for no gain over
archiving. Archived repositories are read-only and clearly labelled, which is the whole
requirement.

### Rename ModelSpec back to PolyModel

Rejected. PolyModel is the weaker name — the reason the rename happened — and the newer
work, the active repository and the registered `modelspec.org` are all under ModelSpec.
Reversing would discard the better name and the more current history at once.

### Park `polymodel.org` on a placeholder instead of redirecting

Rejected. A placeholder asks the reader to navigate again; a redirect just takes them
where they were going. There is no content on `polymodel.org` worth preserving in place,
since its substance is now ModelSpec's.

## Consequences at Decision Time

- Anything that named PolyModel as a live standard is now wrong and must say ModelSpec:
  the public product catalogues, the developer-platform surfaces, and the ecosystem
  documentation.
- `polymodel.org` stops serving its own site. Inbound links survive as redirects to
  `modelspec.org`.
- The PolyModel repositories become read-only. Their issue history stays readable.
- Task A3 of the v1.0 readiness plan is satisfied by this decision plus the archive and
  redirect it authorises. The launch gate it guards — no public ModelSpec launch while a
  stale sibling standard by the same author is live — is cleared once those are done.
- Historical records that mention PolyModel are **not** rewritten. Decisions already
  Approved, review documents and pilot notes stay as written; supersession is recorded
  here rather than by editing the past.

## Observed Consequences

None yet.

## Affected Features

- —

---
*This document follows the https://specscore.md/decision-specification*
