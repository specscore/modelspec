---
format: https://specscore.md/decision-specification
status: Approved
---

# Decision: Prose Now, Format Change On The Owner's Word

**Status:** Approved
**Date:** 2026-10-08
**Owner:** alexander.trakhimenok@gmail.com
**Tags:** governance,sequencing,compatibility
**Source Idea:** —
**Supersedes:** —
**Superseded By:** —

## Context

Decisions [0018](0018-entity-becomes-record.md) and
[0020](0020-field-is-the-member-word.md) change keywords that every model uses, and
[decision 0019](0019-collection-and-recordset-removed-three-words-reserved.md)
changes the grammar every reader parses. The change is small at its centre and wide
at its edge: registered models are pinned by commit in the registry, and readers in
many repositories parse them independently.

Two things pulled in opposite directions when the decisions were approved. A launch
was in preparation, and a rename across many repositories shortly before a launch is
a risk with no benefit to it. And modelspec.org carried statements that were false
that day, which is a cost for as long as they stay.

The question was put to the owner as decision D13 of the conceptual design proposal
written for [issue 21](https://github.com/specscore/modelspec/issues/21).

Named unknown: SpecScore's decision format records a supersession of a whole
decision, and five of the seven decisions touched are succeeded or amended in part. How a
partial supersession is recorded is settled when the first successor takes effect.

## Decision

Prose is corrected now. The format changes only on the owner's word, and in stages.
The wording put to the owner:

> Correct the prose now. Start the format change only after you tell me the launch is
> done. Read both spellings until the last registered model is pinned anew; making
> the old spelling an error then needs its own approval.

The owner's answer, 8 October 2026: "Approve".

The phases, as the proposal names them:

| Phase | What it changes | Starts |
|---|---|---|
| 1. Say what is true | Prose in the specification and on modelspec.org. The approved decisions are recorded. No syntax. | Now, with the change that adds this file. |
| 2. The ModelSpec format | The grammar, the reference CLI, which reads both spellings and gains a rewrite command, its corpus, and the JSON Schema of decision 0010. | On the owner's word that the launch is done. |
| 3. The neighbours follow | Readers, then writers, in this repository's site code and in other repositories. The registered models are regenerated and pinned anew. | On the owner's word, after Phase 2. |

The rename is staged, in four steps:

1. Readers first. Every parser accepts both spellings.
2. Writers second. The specification, the generators, the registry index and the
   sites emit the new spelling.
3. Each registered model is regenerated and its pin moved.
4. The old spelling becomes an error only when no registered pin uses it, and only
   with its own approval.

### Takes effect

Now. It decides timing only.

### Decisions succeeded

None.

## Rationale

The condition for starting Phase 2 is the owner's word, not a date. The condition for
the last step is a count of zero old spellings at the registered pins, not a date
either.

The stages follow from one fact: a registered model is pinned by commit, and a pinned
commit keeps its spelling for ever. So both spellings have to be readable until the
last pin moves. Each of the first three steps can be undone cheaply. The fourth
cannot, which is why it has an approval of its own.

## Declined Alternatives

### Format change before the launch

Declined: a rename across many repositories shortly before a launch is a risk with no
benefit to the launch.

### Defer everything

Wait with the prose too. Declined: false statements on a public page are a cost
today, and correcting prose changes nothing a tool reads.

### A single cutover

Rename everything in one move. Declined: registered models are pinned by commit, so a
cutover would leave pinned models unreadable until every pin had moved.

## Consequences at Decision Time

- Decisions 0018 to 0021 are approved and not in force. `spec/README.md` lists them,
  and each says when it takes effect.
- The specification keeps describing the grammar that tools read today: `entity`,
  `property`, `collection` and `recordset`.
- Decisions 0002, 0003, 0004, 0007, 0009, 0014 and 0015 stay approved and unedited
  until their successors take effect. How each supersession is then recorded is the
  named unknown above: the `Supersedes` field archives a whole decision, and most of
  these are succeeded in part.
- Until Phase 2 a reader must check a decision's "Takes effect" section before
  treating it as the grammar.

## Observed Consequences

2026-10-09 — The owner lifted the condition that the format change wait for the launch. His message: "Can you do other phases or do I need new session? You don't need to depend on DataTug lifecycle". The session recording this reads it as releasing Phase 2 and, after it, Phase 3. Phase 2 started the same day.

2026-10-09 — The session had told the owner: "One approval comes later, and only if you want it: making the old spelling an error. That step is not due until every registered model has been rewritten and re-pinned, and I will ask then." He answered: "yes, you can and should make the old spelling an error". The session recording this reads it as approval of step 4 in its place in the order, after the registered models are pinned anew. It put that reading to him the same day. His next message was "proceed", which does not say whether the reading is right.

2026-10-09 — How a succession is recorded, the named unknown above, was decided by the implementing session. SpecScore refuses a `Supersedes` link on a successor that is already approved (rule `D-immutability-once-accepted`), so decisions 0018 to 0021 keep an empty header. Each succession is a dated entry in the succeeded decision's observed consequences, and the succeeded decisions stay listed as Approved. SpecScore would have allowed marking 0003 or 0004 Deprecated, which moves the file to an archive. That was not done, because the body of decision 0019, which cannot be edited, links to those files.

2026-10-09 — Phase 2 met its exit condition with reference CLI version 0.2.0 (modelspec-org/cli). All nine registered models, read at their pinned commits, lint clean in the deprecated spelling under both profiles, and `modelspec rewrite` converts them and both application pilots with no manual edit. Run as a dry run, it changed no file. Making the deprecated spelling an error later is one constant in the CLI, plus about a hundred expected verdicts in its test corpus.

2026-10-10 — Step 4 was prepared, and waits. A census of 2026-10-09 found three of the nine registered models still pinned at commits in the old spelling, so the condition of the step was not met. The scope prepared for it has four parts, all in the reference CLI (modelspec-org/cli), in its release that follows 0.2.0. First, the CLI decides once for each module, after the files are loaded, whether the module is being checked: it is when one of its files is named on the command line or lies under a named path, or when no path is named and `--module` supplies it; a module is only referred to when a path is named, all of its files were supplied with `--module`, and none of them is named or lies under a named path. Second, `modelspec lint` reports the old spelling in a file of a checked module as an error, in HCL and in JSON, and in a module that is only referred to as a warning that does not fail the run, because decision 0018 says "A commit that is pinned today keeps its old spelling and stays readable". Third, `modelspec export`, which reads HCL only, refuses a source that holds the old spelling, with `--out` and with `--check` as well, and `export --check` reports a `1.0-draft` copy of a source that exports as `1.0-draft-2` as not what the source exports to. Fourth, `modelspec rewrite` is unaffected: it still reads the old spelling, in order to rewrite it. Only the reference CLI changes in this step. The specification states two rules, one for a model that is being written or checked and one for a document that a pin names: the first is required of the reference CLI and is what the specification asks of every other checker, which follows by its own decision, and the second binds every reader of such a document. `spec/core-model.md` has them, names the checkers observed on 2026-10-10 not to report the error, and says where the rules read differently from three approved sentences: one that decisions 0018 and 0020 share, one in the wording of this decision that the owner answered with "Approve", and step 4 above. The kind segment `entities` of SpecScore decision 0014 is not touched. The owner approved making the old spelling an error (the entry of 2026-10-09 above that quotes "yes, you can and should make the old spelling an error"). The scope of the error was chosen by the implementing session on the recommendation of the census of 2026-10-09; the owner was told of it the same day. Alternatives the census set out and the session did not take: an error wherever the reference CLI's check runs, a module that is only referred to included; the scope taken plus a stated way to accept a document read at a pin with a warning; an error under the publish profile only. This entry does not record that step 4 has taken effect.

## Affected Features

None at this time.

---
*This document follows the https://specscore.md/decision-specification*
