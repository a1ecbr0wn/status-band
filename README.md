# phosphor-status

A Claude Code status bar: a strip of two lines drawn above the prompt, in the Phosphor palette.

```
[Opus 5.5] | 🖥  host | 📁 project |  main !?⇡ | v2.1.319
ctx:▓▓▓▓░░░░░░42% | 5h:▓░░░░░░░░░15% 14:30 | 7d:▓▓▓▓▓▓▓▓▓░99% Nov 9, 08:00
```

- **Top edge:** in the terminal a green `─` line across the top; in the desktop app a rounded green outline round the whole strip.
- **Line 1:** the session's model, the machine's short hostname, the working folder, the git branch with its status symbols and the Claude Code version.
- **Line 2:** how full the context window is, and the 5-hour and 7-day rate-limit windows with the time each resets. The rate-limit meters only fill on a Claude subscription.

The git segment follows [starship](https://starship.rs)'s `git_status`. It shows the branch (the short hash when detached) and, in this order, whichever of these apply, and nothing outside a repository:

| Symbol | Meaning |
|---|---|
| `=` | merge conflicts |
| `$` | stashed changes |
| `✘` | deleted files |
| `»` | renamed files |
| `!` | modified files, not staged |
| `+` | staged changes |
| `?` | untracked files |
| `⇡` `⇣` `⇕` | ahead of, behind or diverged from the upstream |

Everything is drawn in a monospaced font, so the meters and the git symbols line up in the desktop app too. The branch symbol is starship's Nerd Font glyph in the terminal (use a Nerd Font there) and the leafless tree emoji (🪾, Unicode 16) in the desktop app, whose font has no Nerd Font glyphs. An operating system older than late 2024 may not draw that emoji.

It redraws whenever the context fill, a rate-limit window or the git status changes. The git status is read at the same moments: when a session starts and after each main-agent turn. It is a port of a `statusLine` shell script to a mod, so it needs no `jq` and runs no script per refresh.

## Install

In the Claude desktop app: open **Customize**, choose **Add marketplace** and enter `a1ecbr0wn/status-band`, then add **Phosphor status** from **+ → Plugins → Add plugin** and start a new local session.

At the prompt of a Claude Code terminal session, after `/plugin marketplace add a1ecbr0wn/status-band`:

```
/plugin install phosphor-status@statusbar
```

Answer `y` to add the marketplace, then choose a scope. From a shell:

```
claude plugin install phosphor-status@statusbar
```

## Requirements

- A Claude Code version with mods (function hooks). The status bar shows in the terminal and the desktop app only: Claude Code draws nothing above the prompt in VS Code, on mobile or under `claude -p`.
- A terminal with true colour, for the Phosphor hex colours.
- `hostname` on the `PATH` (for the host field; it is left blank without it).
- `git` on the `PATH` (for the branch; it is left out without it).

## Colours

| Part | Colour |
|---|---|
| Background | `#000A00` |
| Body text | `#E8E8E8` |
| Labels, separators, reset times | `#A0A0A0` |
| Meter fill | `#1AFF12` |
| Meter track | `#00B300` |
| Top line (terminal) and outline (desktop) | `#1AFF12` |
| Git branch and status symbols | `#1AFF12` |
| Model | `#00C8FF` |
| Version | `#FFEA00` |

Change them in the `C` table at the top of `hooks/register.tsx`.

## Developing

```
claude --plugin-dir .            # run it from this folder
claude plugin validate .         # check the manifest and hooks module
claude plugin test .             # run tests/status.test.tsx
```

## Licence

MIT, see [LICENSE](LICENSE).
