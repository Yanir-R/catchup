# Security

## Report a problem privately

Use **Report a vulnerability** on the Security tab of this repository. Do not open a public issue, and do not paste real
secrets or private text anywhere.

Examples of what to report:

- Text leaves your session in a way the README does not describe.
- A secret, token or email address gets through the removal step before the model call.
- The mod reads or writes something outside its own pane and memory.

## What the mod does with your data

The mod has no network code and no file access. It sends the text of your recent messages to the model through your own
Claude Code session, after removing private keys, common token formats, `Bearer` tokens, `password=` values and email
addresses. That removal is a safety net, not a guarantee. See "Privacy" in the README.

## Supported versions

The latest release.
