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

### System Diagnostics

- `cursor-sub-agents doctor` - Check system dependencies and platform compatibility
  - Verifies all required tools are installed and accessible
  - Tests URL opening and keyboard automation capabilities
  - Provides installation instructions for missing tools
  - Useful for troubleshooting platform-specific issues

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

### Configuration Management

- `cursor-sub-agents config` or `cursor-sub-agents config show` - Show current configuration
- `cursor-sub-agents config add <prompt> [--global]` - Add a follow-up prompt (local by default)
- `cursor-sub-agents config remove <index> [--global]` - Remove a prompt by index (1-based)
- `cursor-sub-agents config reorder <from> <to> [--global]` - Move a prompt to a new position
- `cursor-sub-agents config set <prompt1> [prompt2] ... [--global]` - Overwrite all prompts
- `cursor-sub-agents config copy-global` - Copy global config to local
- `cursor-sub-agents config clear [--global]` - Clear all prompts
- `cursor-sub-agents config use-global` - Delete local config (use global)

**Configuration Files:**
- **Global**: `~/.csa/config.json` (applies to all projects)
- **Local**: `./.csa/config.json` (project-specific, takes precedence)

**Example:**
```bash
# Show current config
csa config show

# Add a custom follow-up prompt
csa config add "Run tests before completing"

# Set multiple prompts at once
csa config set "Verify your changes" "Run tests" "Execute csa complete {agentId}"

# Copy global config to local project
csa config copy-global
```

The `{agentId}` placeholder in prompts will be automatically replaced with each agent's unique ID.

## Features

- ✅ **Parallel Agent Execution** - Spawn multiple agents simultaneously
- ✅ **Feedback Loops** - Orchestrator can approve or request changes
- ✅ **Session Management** - Track multiple sessions across projects
- ✅ **State Persistence** - Global state file (`~/.csa/state.json`)
- ✅ **File Locking** - Safe concurrent access with proper-lockfile
- ✅ **File Watching** - Efficient change detection (no polling)
- ✅ **Timeout Handling** - Configurable timeouts for agent operations
- ✅ **Status Monitoring** - Real-time status of all agents
- ✅ **JSON Output** - Machine-readable output for programmatic use
- ✅ **Cursor Command Templates** - Pre-written commands for common workflows
- ✅ **Follow-up Prompts** - Automatically send follow-up prompts to agents via prompt queues
- ✅ **Config Management** - Manage follow-up prompts via CLI with local/global config support
- ✅ **Cross-Platform Support** - Works on macOS, Linux (X11/Wayland), and Windows
- ✅ **System Diagnostics** - Doctor command to verify platform compatibility and dependencies

## How It Works

1. **Orchestrator** spawns agents using `cursor-sub-agents spawn`
2. **Sub-agents** work on their tasks in Cursor IDE
3. **Sub-agents** submit work using `cursor-sub-agents complete`
4. **Orchestrator** waits using `cursor-sub-agents wait`
5. **Orchestrator** verifies and either approves or requests changes
6. **Sub-agents** can resubmit after making changes
7. Process repeats until all agents are approved

## State and Configuration Files

**State File:**
- Stored globally at: `~/.csa/state.json`
- All sessions and agents share this state file, allowing cross-project visibility

**Configuration Files:**
- **Global config**: `~/.csa/config.json` - Applies to all projects
- **Local config**: `./.csa/config.json` - Project-specific (takes precedence over global)
- Local config is automatically created when you use `csa config` commands
- If no config exists, default follow-up prompts are used

## Requirements

- Node.js >= 18.0.0
- Cursor IDE (for the deep linking functionality)

### Platform-Specific Requirements

The tool supports macOS, Linux, and Windows. Each platform requires specific tools for automation:

#### macOS
- `osascript` (built-in) - for keyboard automation
- `open` (built-in) - for opening URLs
- Shell (zsh/bash) - for command execution

#### Linux
- **URL Opener** (one of): `xdg-open`, `gio`, `gnome-open`, `kde-open`, or `exo-open`
- **Keyboard Automation** (depends on display server):
  - **X11**: `xdotool` (recommended) or `ydotool`
  - **Wayland**: `wtype` (recommended), `ydotool`, or `kdotool` (KDE only)
- Shell (bash/zsh) - for command execution

**Installation Examples:**
```bash
# Arch Linux
sudo pacman -S xdg-utils xdotool  # For X11
sudo pacman -S xdg-utils wtype    # For Wayland

# Ubuntu/Debian
sudo apt-get install xdg-utils xdotool  # For X11
sudo apt-get install xdg-utils wtype   # For Wayland

# Fedora
sudo dnf install xdg-utils xdotool  # For X11
sudo dnf install xdg-utils wtype    # For Wayland
```

#### Windows
- PowerShell (built-in on Windows 7+) - for keyboard automation and window activation
- `cmd.exe` (built-in) - for command execution

**Note:** If PowerShell execution policy is restrictive, you may need to run:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Checking System Compatibility

Use the `doctor` command to verify all platform-specific dependencies are installed and working:

```bash
cursor-sub-agents doctor
```

This will:
- Detect your platform and display environment information
- Check availability of all required tools
- Test basic functionality (URL opening, keyboard automation)
- Provide installation instructions for missing tools
- Return exit code 0 if all checks pass, 1 if issues are found

## License

MIT

## Contributing

Contributions welcome! Please open an issue or pull request.
