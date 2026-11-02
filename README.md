# Minutatim

**One change at a time.** AI thinks ahead. Humans understand before acting.

**Status: pre-alpha.** There is no working extension yet. This repository currently holds its development
foundation and nothing more.

Minutatim is a development-control extension for AI coding agents. An agent can read a repository, run
commands, edit many files and invoke tools faster than a human can follow, which opens a review gap: you are
asked to approve a broad operation without understanding the specific effect that is about to occur.
Minutatim closes that gap by requiring an explicit human approval before every meaningful side effect, and by
keying that approval on the _effect_ — a file write, a Git mutation, an external action — rather than on the
name of the command that produced it.

## Development

The toolchain is pinned with [mise](https://mise.jdx.dev/), and `mise run <task>` is the command surface for
contributors and CI alike.

```bash
mise trust
mise install
mise run install
mise run check
```

| Command             | Purpose                                                                 |
| ------------------- | ----------------------------------------------------------------------- |
| `mise run install`  | Install npm dependencies from the lockfile                              |
| `mise run format`   | Rewrite every supported file with Prettier                              |
| `mise run lint`     | Markdown lint                                                           |
| `mise run validate` | Schemas compile; every fixture is judged as declared; test glob covered |
| `mise run test`     | Unit tests                                                              |
| `mise run check`    | Every gate that runs offline                                            |
| `mise run audit`    | Fail on known high-severity vulnerabilities                             |
| `mise run ci`       | Clean install, every gate, then the audit; GitHub Actions runs this     |

## License

MIT. See [LICENSE](LICENSE).
