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
