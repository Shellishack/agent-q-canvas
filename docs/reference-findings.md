# Reference Findings

The ignored `references/` folder contains the cloned projects used for product and implementation guidance.

## Common Patterns

- Canvas workspace: OpenCove, Handler.dev, and AgentBase all use a spatial overview where each running agent/session is visible as a node. ReactFlow appears in OpenCove and Handler.dev and is a good first canvas primitive for pan, zoom, minimap, keyboard navigation, and node linking.
- Local terminal runtime: The mature projects separate renderer UI from process control. Harnss and OpenCove use Electron IPC with PTY-backed sessions. Handler.dev and agtx lean on tmux for persistence and reconnectability.
- Task ownership: agtx is the clearest task model: each task can have an agent, phase/status, dependencies, artifacts, and an isolated worktree. AgentBase adds progress summaries and centralized approval handling.
- Human control center: AgentBase and Handler.dev both highlight pending input/approval across sessions so the user does not need to inspect every terminal.
- Isolation: AgentBase, Handler.dev, and agtx all treat git worktrees as a core primitive for parallel agent work across the same codebase.
- Summaries: Handler.dev classifies terminal output into lightweight states like idle, running, needs input, and error. This maps well to canvas badges and attention routing.

## Product Direction For This App

The project should focus on local human-agent collaboration for multiple products at once:

- One full-bleed canvas as the primary surface.
- One node per local coding agent, with command, cwd, status, transcript tail, and task queue.
- A global command bar that decomposes high-level intent into assignable tasks.
- Direct text and voice task entry on every agent node.
- A command center view for blocked agents and pending approvals.
- Worktree-backed task isolation before any serious multi-agent execution.
- Durable runtime sessions using node-pty first, then optional tmux-backed persistence for long-running agents.

## Implemented In This First Pass

- Electron + React + Vite project scaffold.
- ReactFlow canvas with draggable agent nodes, links, minimap, controls, pan, and zoom.
- Agent node queue, task statuses, editable command/cwd, direct task input, voice task hook, and run-next action.
- Global command bar with auto-assignment and basic deterministic task decomposition.
- Secure Electron preload bridge with IPC handlers for starting, sending to, stopping, and observing local agent processes.

## Next Build Steps

- Replace `child_process.spawn` process stubs with node-pty so Codex/OpenCode/Claude behave like real interactive terminals.
- Add xterm.js panes inside each agent node or focused detail view.
- Persist canvas, agents, queues, and transcripts in SQLite.
- Add worktree creation and per-task branch metadata.
- Add a command center filtered to `needs-input` and `blocked`.
- Add provider-specific adapters for Codex, OpenCode, Claude Code, Gemini, and custom commands.
