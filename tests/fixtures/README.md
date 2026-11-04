# Fixtures

`scripts/validate.ts` accepts every file under `valid/` and rejects every file under `invalid/`.

## effect

| Valid fixture            | Case                                                        |
| ------------------------ | ----------------------------------------------------------- |
| `read-only.json`         | One path target.                                            |
| `filesystem-write.json`  | Two path targets.                                           |
| `shell-side-effect.json` | A command target.                                           |
| `network-write.json`     | A URL target.                                               |
| `unclassified.json`      | A resource target, `hostEvent` present, a non-default host. |

| Invalid fixture             | Rejected by              |
| --------------------------- | ------------------------ |
| `unknown-effect-class.json` | `/effectClass` enum      |
| `empty-targets.json`        | `/targets` minItems      |
| `extra-property.json`       | `/` additionalProperties |

## policy

| Valid fixture                   | Case                                                           |
| ------------------------------- | -------------------------------------------------------------- |
| `strict-defaults.json`          | Strict mode, defaults only, no rules. Unclassified is denied.  |
| `compatibility-with-rules.json` | Compatibility mode with rules narrowed by path and by command. |

| Invalid fixture                         | Rejected by                                |
| --------------------------------------- | ------------------------------------------ |
| `missing-default-for-unclassified.json` | `/defaults` required                       |
| `unknown-decision.json`                 | `/defaults/git-state-change/decision` enum |
| `empty-match-list.json`                 | `/rules/0/match/paths` minItems            |

## approval

| Valid fixture           | Case                                                    |
| ----------------------- | ------------------------------------------------------- |
| `filesystem-write.json` | One approval bound to one file, expiring in 15 minutes. |

| Invalid fixture                | Rejected by              |
| ------------------------------ | ------------------------ |
| `approved-by-agent.json`       | `/approvedBy` const      |
| `empty-scope.json`             | `/scope` minItems        |
| `no-expiry.json`               | `/` required             |
| `unbounded-budget.json`        | `/changeBudget` required |
| `truncated-proposal-hash.json` | `/proposalHash` pattern  |
| `no-verification.json`         | `/verification` minItems |

## scenarios

`tests/unit/scenarios.test.ts` checks each file against `tests/support/scenario.schema.json` and its policy
against the policy schema, then plays the steps in order through the gate and the session.

| Step     | What happens                                                                    | `expect`                            |
| -------- | ------------------------------------------------------------------------------- | ----------------------------------- |
| `effect` | The gate decides on the effect at its `observedAt`. `decision` is the policy's. | `run`, or the kind of block         |
| `event`  | The session takes the event.                                                    | The next state, or the refusal kind |
| `issue`  | The human approves the proposal awaiting approval.                              | —                                   |

| Scenario                               | Case                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------- |
| `file-edit-approved.json`              | Gated before approval, runs inside it, verified; no carry-over.           |
| `target-differs-from-explanation.json` | An effect outside the explained file ends the approval.                   |
| `formatter-over-budget.json`           | A formatter rewrites more files than the budget allows.                   |
| `approval-expires.json`                | Expired before use, and expiring in the middle of a change.               |
| `unclassified-in-strict-mode.json`     | The strict policy denies an unclassified effect; a plugin write is gated. |
| `compatibility-rules.json`             | A rule allows docs edits; one target outside it makes the effect ask.     |
