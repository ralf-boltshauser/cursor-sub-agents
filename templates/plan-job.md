# Plan Job

Create a structured job plan by breaking down your work into tasks that can be executed sequentially.

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

Each task type has a predefined sequence of Cursor commands that will be executed automatically.

## Job File Location

Save your job file at: `.csa/jobs/{jobId}/job.json`

Where `{jobId}` is a unique identifier for this job (e.g., `fix-auth-bugs`, `implement-user-dashboard`).

## Example Job Structure

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
    }
  ]
}
```

## Workflow

1. **Break down the work**: Identify all tasks needed to complete the goal
2. **Choose task types**: Select appropriate task types for each task
3. **Create job.json**: Write the job file with all tasks
4. **Execute**: Run `csa execute {jobId}` to start execution

## Task Execution

When you run `csa execute {jobId}`, the system will:
1. Load the job.json file
2. For each task:
   - Create a kickoff prompt with task context
   - Execute the command sequence for the task type
   - Move to the next task

Each command in the sequence will be sent to Cursor automatically, allowing you to work through tasks step by step.

## Tips

- Keep tasks focused and independent when possible
- Use descriptive names and prompts
- Reference specific files that contain context or requirements
- Check available task types with `csa validate-tasks` to see what commands are available

