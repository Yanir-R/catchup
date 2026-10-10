# Changelog

All notable changes to this project are written here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-10-10

### Changed
- The mod keeps its data in memory only. It no longer uses session state: the summary, the handled list and the counters
  live in the running mod and are dropped on `/clear`, `/resume`, `/branch`, a plugin reload and exit.
- The manifest no longer needs the `types` field, and the state declaration is gone.
- Known limits now name where the mod is untested, with links to open issues.

### Added
- `scripts/release-check.sh` fails a release if the validator lists a state, store, file, network or process call.
- Tests for the reset after `/clear`, the summary kept after a compaction, and the button that the timer shows.

### Known
- A plugin reload now drops the summary and the handled list. Run `/catchup` again.

## [0.1.6] - 2026-10-10

### Added
- Keywords for agent oversight and the SDLC and ADLC loop, and a README line that says where the mod fits.

## [0.1.5] - 2026-10-10

### Added
- Listing details: a display name, privacy, support and documentation links, and two keywords.
- The logo in the README, and a 1280x640 social preview image in `docs/media/`.

### Changed
- The author link now points to the author's portfolio.

## [0.1.4] - 2026-10-10

### Changed
- A new plugin icon.
- Renamed an internal function so the plugin directory can follow it.

### Added
- A FAQ in the README.

## [0.1.3] - 2026-10-10

### Fixed
- The summary timer no longer passes the engine handle inside the call that sets the timer, so the plugin directory can read it.

## [0.1.2] - 2026-10-10

### Fixed
- The summary timer is now written in a form the plugin directory can read.
- A test fixture no longer looks like a credential read to the directory scan.

### Added
- A plugin icon.

## [0.1.1] - 2026-10-10

### Added

- A demo in the README: a short animation, and the full 1:56 video as a release download. Both were recorded on a made-up project. The animation shows steps 2 to 8; the video shows everything.

### Fixed

- The pane header says "1 message", not "1 messages".
- A tool error the model also reports is no longer listed twice under `FAILED`. The model's clearer wording is kept, unless it says the failure is fixed.
- Pressing ✓ hides exactly that item. It no longer hides a similar item from the same summary. A later run still hides a reworded copy of a handled item.
- The reply to `/catchup` no longer repeats the plugin name (`catchup: catchup: summary pane opened.`).

## [0.1.0] - 2026-10-10

First public version.

### Added

- `/catchup [N]` summarizes everything after your last prompt, or the last N messages (1 to 500).
- The phrases `brief me`, `catchup`, `catchup N`, `catch up N` and `what did I miss`, typed as a whole prompt, do the same without a slash.
- A **Catch up (N)** button above the prompt. It shows when 8 or more messages are below the screen, or after 10 minutes without a prompt when there is at least 1 new message.
- A pane with the summary in a fixed layout: `NEEDS YOU`, `FAILED`, `DONE`, `FIXED`, `RUNNING`, `NOT CHECKED`, `DECIDED`, and a `Next:` line.
- A style inspired by ASD-STE100 at about 80%: short sentences, active voice, one word for one thing.
- Message numbers (`[#12]`) on every item, checked in code against the messages the model was shown.
- Code-checked rules: a `done` item needs a proof, a quoted name that is not in the messages gets a `(?)` mark, a choice credited to you must come from one of your own messages, and a question you already answered is not listed as open.
- Open questions asked in plain text are found by code, with their listed options and the agent's recommendation marked with `★`.
- Compact view by default, with a **Show all** toggle.
- A **✓** button on each open item to mark it handled, and **Show hidden (n)** to bring them back.
- **Copy**, **Copy handoff** (clipboard only) and **Reply template** (fills the prompt box, sends nothing).
- Settings: `threshold`, `afkMinutes`, `model`.
- Secrets and email addresses are removed from the text before it goes to the model.

### Known limits

- The automatic unread count needs the terminal view to report which rows are on screen.
- Something you did, or answered in a screenshot, is not seen. Use the ✓ button.
- Recommendations in unusual wording or in tables are not read.

[Unreleased]: https://github.com/Yanir-R/catchup/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/Yanir-R/catchup/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Yanir-R/catchup/releases/tag/v0.1.0
