# phosphor-status

A Claude Code status bar: a strip of two lines drawn above the prompt, in the Phosphor palette.

```
[Opus 5.5]   |   🖥  host   |   📁 project   |   v2.1.319
ctx:▓▓▓▓░░░░░░42% | 5h:▓░░░░░░░░░15% 14:30 | 7d:▓▓▓▓▓▓▓▓▓░99% Nov 9, 08:00
```

- **Top edge:** in the terminal a green `─` line across the top; in the desktop app a rounded green outline round the whole strip.
- **Line 1:** the session's model, the machine's short hostname, the working folder and the Claude Code version.
- **Line 2:** how full the context window is, and the 5-hour and 7-day rate-limit windows with the time each resets. The rate-limit meters only fill on a Claude subscription.

It redraws whenever the context fill or a rate-limit window moves. It is a port of a `statusLine` shell script to a mod, so it needs no `jq` and runs no script per refresh.

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

## Colours

| Part | Colour |
|---|---|
| Background | `#000A00` |
| Body text | `#E8E8E8` |
| Labels, separators, reset times | `#A0A0A0` |
| Meter fill | `#1AFF12` |
| Meter track | `#00B300` |
| Top line (terminal) and outline (desktop) | `#1AFF12` |
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
