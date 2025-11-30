# Plan Job

Create a structured job plan by breaking down your work into tasks that can be scheduled sequentially.

## Job Structure

A job consists of:
- **Goal**: The overall objective
- **Tasks**: An array of tasks, each with:
  - `name`: Descriptive name of the task
  - `type`: Task type (see available types below)
  - `files`: Array of file paths to read for context (relative to project root)
  - `prompt`: Specific instructions for this task

## Available Task Types

Task types are defined in `~/.csa/task-types.json`. Common types include:
- `fix-issue`: Fix a specific issue from a report
- `implement`: Implement a new feature
- `research`: Research how something is done in code
- `identify-issues`: Identify issues based on instructions or logs

Each task type has a predefined sequence of Cursor commands that will be scheduled automatically.

**To see all available task types and their command sequences**, run:
```bash
csa validate-tasks
```

This will show you:
- All task types defined in `~/.csa/task-types.json`
- The sequence of commands each task type executes
- Whether all required command files exist

## Job File Location

Save your job file at: `.csa/jobs/{jobId}/job.json`

Where `{jobId}` is a unique identifier for this job (e.g., `fix-auth-bugs`, `implement-user-dashboard`).

## Common Job Patterns

### Pattern 1: Single Issue Fix
**Scenario**: "I have this issue"

Simple job with one `fix-issue` task:

```json
{
  "id": "fix-login-bug",
  "goal": "Fix the login bug reported in issues.md",
  "tasks": [
    {
      "name": "Fix login bug",
      "type": "fix-issue",
      "files": ["issues.md"],
      "prompt": "Fix the login bug described in issue #1. The login fails when users have special characters in their password."
    }
  ]
}
```

### Pattern 2: Multiple Issues
**Scenario**: "I have those 3 issues"

Multiple `fix-issue` tasks, one per issue:

```json
{
  "id": "fix-auth-issues",
  "goal": "Fix authentication bugs reported in issues.md",
  "tasks": [
    {
      "name": "Fix login bug",
      "type": "fix-issue",
      "files": ["issues.md"],
      "prompt": "Fix the login bug described in issue #1"
    },
    {
      "name": "Fix session timeout",
      "type": "fix-issue",
      "files": ["issues.md", "src/auth/session.ts"],
      "prompt": "Fix the session timeout issue #2"
    },
    {
      "name": "Fix password reset",
      "type": "fix-issue",
      "files": ["issues.md", "src/auth/password.ts"],
      "prompt": "Fix the password reset issue #3"
    }
  ]
}
```

### Pattern 3: Complex Feature Implementation
**Scenario**: "I wanna implement this really complex new feature"

Start with `research`, then `implement`:

```json
{
  "id": "implement-user-dashboard",
  "goal": "Implement a new user dashboard feature",
  "tasks": [
    {
      "name": "Research existing patterns",
      "type": "research",
      "files": ["README.md", "src/components", "src/lib"],
      "prompt": "Research how the application is structured. Understand existing component patterns, state management, and API patterns. Look for similar dashboard implementations."
    },
    {
      "name": "Implement dashboard",
      "type": "implement",
      "files": [".csa/jobs/implement-user-dashboard/research-notes.md", "src/components", "src/lib/api"],
      "prompt": "Based on the research, implement a user dashboard with: user stats, recent activity, and settings panel. Follow existing patterns and conventions."
    }
  ]
}
```

### Pattern 4: Code Cleanup
**Scenario**: "I have this codebase and I wanna clean up that part of my app"

Use `identify-issues` to find problems, then `implement` to fix them:

```json
{
  "id": "cleanup-streaming",
  "goal": "Clean up and refactor the streaming part of the application",
  "tasks": [
    {
      "name": "Identify issues in streaming code",
      "type": "identify-issues",
      "files": ["src/lib/streaming", "src/components/StreamPlayer.tsx", ".notes/streaming-issues.md"],
      "prompt": "Analyze the streaming code for: code smells, performance issues, unused code, inconsistent patterns, and potential bugs. Document all findings."
    },
    {
      "name": "Fix identified issues",
      "type": "implement",
      "files": [".csa/jobs/cleanup-streaming/research-notes.md", "src/lib/streaming", "src/components/StreamPlayer.tsx"],
      "prompt": "Based on the identified issues, refactor and clean up the streaming code. Fix all issues found in the analysis while maintaining functionality."
    }
  ]
}
```

## Example Job Structure

Here's a complete example combining multiple patterns:

```json
{
  "id": "fix-auth-issues",
  "goal": "Fix authentication bugs and improve security",
  "tasks": [
    {
      "name": "Research auth implementation",
      "type": "research",
      "files": ["src/auth", "docs/auth.md"],
      "prompt": "Research how authentication is currently implemented. Understand the flow, security measures, and potential vulnerabilities."
    },
    {
      "name": "Fix login bug",
      "type": "fix-issue",
      "files": ["issues.md", ".csa/jobs/fix-auth-issues/research-notes.md"],
      "prompt": "Fix the login bug described in issue #1"
    },
    {
      "name": "Fix session timeout",
      "type": "fix-issue",
      "files": ["issues.md", "src/auth/session.ts"],
      "prompt": "Fix the session timeout issue #2"
    }
  ]
}
```

## Workflow

1. **Break down the work**: Identify all tasks needed to complete the goal
2. **Choose task types**: Select appropriate task types for each task
3. **Create job.json**: Write the job file with all tasks
4. **Schedule**: Run `csa schedule {jobId}` to schedule the job

## Task Execution

When you run `csa schedule {jobId}`, the system will:
1. Load the job.json file
2. For each task:
   - Create a kickoff prompt with task context
   - Schedule the command sequence for the task type
   - Move to the next task

Each command in the sequence will be sent to Cursor automatically, allowing you to work through tasks step by step.

## Tips

- **Keep tasks focused**: Each task should have a clear, single objective
- **Use descriptive names**: Task names should clearly describe what they do
- **Reference specific files**: Include all relevant files in the `files` array for context
- **Chain tasks**: Use research → implement, or identify-issues → implement patterns
- **Check task types**: Run `csa validate-tasks` to see all available task types and their command sequences
- **Reuse research**: Save research findings in the job directory (e.g., `.csa/jobs/{jobId}/research-notes.md`) and reference them in subsequent tasks


## Next Steps

- You let the user review the job
- When they are happy, you schedule the job with `csa schedule {jobId}`