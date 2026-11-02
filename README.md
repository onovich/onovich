# onovich

[简体中文](README.zh-CN.md)

**Game systems engineer and technical creator.**

I build gameplay runtimes, Unity tools, editors, graphics systems, and playable experiments. My work is grounded in C# and Unity, with an emphasis on systems that can be inspected, tested, and reused.

GitHub shows the part of my work I can share publicly: systems, tools, experiments, and technical writing. My broader day-to-day background is game development.

[Website](https://onovich.com/) · [All repositories](https://github.com/onovich?tab=repositories) · [X / Twitter](https://x.com/Umbra_Onovich)

## Start here

| [EaseTween](https://github.com/onovich/EaseTween) | [Vista](https://github.com/onovich/Vista) |
| --- | --- |
| [![EaseTween cover](https://raw.githubusercontent.com/onovich/EaseTween/main/docs/cover.png)](https://github.com/onovich/EaseTween) | [![Vista cover](https://raw.githubusercontent.com/onovich/Vista/main/docs/cover.png)](https://github.com/onovich/Vista) |
| A data-oriented Unity tween runner with an explicit tick loop and scene lifecycle kept in the caller's control. A focused Unity probe measured no GC allocations in warmed-up steady-state updates. | A lightweight Unity 2D camera library for following, dead and soft zones, world bounds, scripted movement, and shake. It calculates camera positions while the game retains control of the scene camera. |

## Game systems and tools

- **[Pulse](https://github.com/onovich/Pulse)** — an experimental 2D physics engine for C# and Unity with an explicit simulation loop, collision pairs, response, and events.
- **[Rill](https://github.com/onovich/Rill)** — a lightweight C# TCP client/server layer with typed messages, background socket work, and main-thread dispatch through an explicit tick.
- **[LitIO](https://github.com/onovich/LitIO)** — a compact C# binary serialization library for value types, arrays, and UTF-8 strings, using caller-owned buffers and offsets.
- **[Swing](https://github.com/onovich/Swing)** — a Unity-friendly collection of easing, waveform, spline, and noise functions, with samples and tests.

These repositories are at different stages. Their READMEs state what is implemented, what remains experimental, and what should not yet be treated as production-ready.

## Current lab

- **[RepoCover](https://github.com/onovich/RepoCover)** reads a repository before creating its GitHub Social Preview.
- **[RepoReadme](https://github.com/onovich/RepoReadme)** reads current code and project evidence before writing concise English and Simplified Chinese documentation.

These projects show how I use AI-assisted workflows around engineering work; they are supporting tools, not a replacement for the game-development practice itself.

## Let’s talk

I am interested in thoughtful conversations about gameplay systems, runtime architecture, Unity tooling, editors, graphics, and technical collaboration. The best starting point is [onovich.com](https://onovich.com/).
