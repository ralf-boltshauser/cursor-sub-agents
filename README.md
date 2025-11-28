# cursor-sub-agents

A CLI tool for orchestrating multiple Cursor sub-agents in parallel with feedback loops and approval workflows.

## Installation

### Global Installation (Recommended)

```bash
npm install -g cursor-sub-agents
```

Or using pnpm:
```bash
pnpm add -g cursor-sub-agents
```

Or using yarn:
```bash
yarn global add cursor-sub-agents
```

After installation, you can use either:
- `cursor-sub-agents` (full command)
- `csa` (short alias)

## Quick Start

### 1. Spawn agents (orchestrator)

```bash
cursor-sub-agents spawn "task1" "task2" "task3"
```

This returns immediately with a session ID:
```
🚀 Session created: abc12345
⏳ To wait for agents: cursor-sub-agents wait abc12345
```

### 2. Wait for agents to submit work

```bash
cursor-sub-agents wait abc12345
```

This blocks until an agent calls `complete`, then shows the status table.

### 3. Verify and approve (orchestrator)

```bash
# Approve an agent
cursor-sub-agents accept <agentId>

# Or request changes
cursor-sub-agents feedback <agentId> "Please add error handling"
```

### 4. Submit work (sub-agent)

From within a sub-agent:

```bash
cursor-sub-agents complete <agentId> "Task complete, created 5 files"
```

This blocks until the orchestrator approves or provides feedback.

### 5. Check status

```bash
cursor-sub-agents status
```

Shows all sessions and agents with their current status.

## Core Commands

### Orchestrator Commands

- `cursor-sub-agents spawn <prompt1> <prompt2> ...` - Spawn agents and return immediately
- `cursor-sub-agents wait <sessionId>` - Wait for agents to submit work
- `cursor-sub-agents accept <agentId>` - Approve an agent's work
- `cursor-sub-agents feedback <agentId> <message>` - Request changes from an agent
- `cursor-sub-agents status` - List all sessions and agents

### Sub-Agent Commands

- `cursor-sub-agents complete <agentId> [message]` - Submit work and wait for approval
  - Optional: `--timeout <minutes>` (default: 30)

### Cursor Command Management

- `cursor-sub-agents add-command [template]` - Create a new Cursor command or install a template
  - Without template: Interactive prompt to create a custom command
  - With template: Install a pre-written command template (e.g., `use-subagents`)
  - Prompts for installation location: global (`~/.cursor/commands/`) or project (`.cursor/commands/`)

**Example:**
```bash
# Install the use-subagents template
csa add-command use-subagents

# Create a custom command interactively
csa add-command
```

The `use-subagents` template provides instructions for splitting tasks into independent components and using sub-agents effectively.

## Features

- ✅ **Parallel Agent Execution** - Spawn multiple agents simultaneously
- ✅ **Feedback Loops** - Orchestrator can approve or request changes
- ✅ **Session Management** - Track multiple sessions across projects
- ✅ **State Persistence** - Global state file (`~/.cursor-agents/state.json`)
- ✅ **File Locking** - Safe concurrent access with proper-lockfile
- ✅ **File Watching** - Efficient change detection (no polling)
- ✅ **Timeout Handling** - Configurable timeouts for agent operations
- ✅ **Status Monitoring** - Real-time status of all agents
- ✅ **JSON Output** - Machine-readable output for programmatic use
- ✅ **Cursor Command Templates** - Pre-written commands for common workflows

## How It Works

1. **Orchestrator** spawns agents using `cursor-sub-agents spawn`
2. **Sub-agents** work on their tasks in Cursor IDE
3. **Sub-agents** submit work using `cursor-sub-agents complete`
4. **Orchestrator** waits using `cursor-sub-agents wait`
5. **Orchestrator** verifies and either approves or requests changes
6. **Sub-agents** can resubmit after making changes
7. Process repeats until all agents are approved

## State File

State is stored globally at: `~/.cursor-agents/state.json`

All sessions and agents share this state file, allowing cross-project visibility.

## Requirements

- Node.js >= 18.0.0
- Cursor IDE (for the deep linking functionality)

## License

MIT

## Contributing

Contributions welcome! Please open an issue or pull request.
