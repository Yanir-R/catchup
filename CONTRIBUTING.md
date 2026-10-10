# Contributing

Thanks for helping. Issues and pull requests are welcome. The maintainer reviews and approves every change, and
cannot promise how fast.

## Before you start

- **A bug:** open an issue with the bug template. Use made-up text only. The mod reads conversations, so a report
  can leak private text.
- **A feature:** open an issue first and describe the problem. This keeps you from building something that does not fit.
- **A security problem:** do not open an issue. Use the private report link on the Security tab (see `SECURITY.md`).

## Set up

You need [Claude Code](https://claude.com/claude-code). From a clone of this repository:

```
claude plugin validate .      # checks the manifest and the hooks
claude plugin test .          # runs every test in tests/
claude --plugin-dir .         # loads the mod in a session, to try it
bash scripts/scan.sh          # looks for home paths, emails, secret-shaped strings and stray files
```

## How the code is laid out

- `hooks/register.tsx` connects the mod to Claude Code: hooks, the pane, the buttons.
- `hooks/lib/` holds the logic. It makes no engine calls, so it is easy to test. Keep new logic here.
- `tests/` has one file per module. `tests/pane.test.ts` mounts the real pane through the engine with a fake model.
- The engine only lets `$` go to functions declared at the top of the file that uses it, and a render hook may not write state.
  Keep these in mind when you edit `register.tsx`.

## Rules

1. **A new rule gets a test.** Then break the rule on purpose and check that a test fails. A test that cannot fail proves nothing.
2. **No network access, no file access.** The mod has neither. A change that adds one needs a strong reason and a README update.
3. **Made-up data only.** Never copy text from a real session into a test, a fixture, an example or an issue.
4. **Keep names stable:** the plugin name `catchup`, the settings `threshold`, `afkMinutes` and `model`, the command
   `/catchup`, and the phrases `brief me` and `catchup N`. See "Releasing" in the README.
5. **Match the code around your change:** naming, comment style, and plain words.
6. **Add a line under `## [Unreleased]`** in `CHANGELOG.md`.

## Pull requests

Keep a pull request to one change. Fill in the template. The `scan` check must pass. The maintainer approves and merges.

## License

By contributing you agree that your contribution is licensed under the MIT license of this project.
