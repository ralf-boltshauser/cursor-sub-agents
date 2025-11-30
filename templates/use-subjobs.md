# Use Sub-Jobs

Split the tasks you've received into multiple components that can be run independently using the job system. Each sub-agent gets their own job file with structured tasks.

## Create Job Files

For each sub-agent, create a job file at `.csa/jobs/{agent-job-id}/job.json` using the `/plan-job` command.

Each job file should contain:
- **Goal**: The overarching goal for this sub-agent
- **Tasks**: One or more tasks that the sub-agent should complete
- Each task should be independent and self-contained

## Spawn Agents with Jobs

You then spawn sub-agents via:

```bash
csa spawn-jobs "job-id-1" "job-id-2" "job-id-3"
```

Or use the old method with simple prompts:

```bash
csa spawn "prompt 1" "prompt 2" "prompt 3"
```

## How It Works

When you use `csa spawn-jobs`, the system will:
1. Load each job file
2. Open a new Cursor window for each agent
3. Submit the job's goal as the initial prompt
4. Execute all tasks from the job file sequentially (kickoff prompts + commands)
5. Move to the next agent

Each agent runs in their own Cursor window, allowing true parallel execution.

## Workflow

1. **Create job files** using `/plan-job` for each sub-agent task
2. **Spawn agents** with `csa spawn-jobs "job1" "job2" "job3"`
3. **Wait for agents** with `csa wait <sessionId>` - this will notify you as soon as the first agent finishes
4. **Verify the finished agent**:
   - If the work is good: `csa accept <agentId>`
   - If changes are needed: `csa feedback <agentId> "your feedback message"`
5. **Repeat steps 3-4** until all agents are finished
6. **Take conclusion**: Once all agents are verified and accepted, proceed with your conclusion and next steps

## Example: Multiple Issues

If you have 3 issues to fix:

1. Create 3 job files using `/plan-job`:
   - `.csa/jobs/fix-issue-1/job.json` - fix-issue task for issue #1
   - `.csa/jobs/fix-issue-2/job.json` - fix-issue task for issue #2
   - `.csa/jobs/fix-issue-3/job.json` - fix-issue task for issue #3

2. Spawn them:
   ```bash
   csa spawn-jobs "fix-issue-1" "fix-issue-2" "fix-issue-3"
   ```

3. Each agent will:
   - Open in a new Cursor window
   - Receive the job goal as initial prompt
   - Execute all tasks from their job file sequentially
   - Wait for your approval via `csa complete`

## Example: Complex Feature Implementation

For a complex feature that needs research and implementation:

1. Create job files:
   - `.csa/jobs/research-feature/job.json` - research task
   - `.csa/jobs/implement-feature/job.json` - implement task (can reference research notes)

2. Spawn them sequentially:
   ```bash
   # First, spawn research
   csa spawn-jobs "research-feature"
   # Wait for it to complete, then spawn implementation
   csa spawn-jobs "implement-feature"
   ```

## Important Notes

- **Independent tasks**: Ensure tasks are independent when running in parallel
- **Sequential tasks**: For dependent tasks, wait for one batch to complete before spawning the next
- **Job structure**: Each job can have multiple tasks that execute sequentially
- **Task types**: Use `csa validate-tasks` to see available task types and their command sequences
- **Parallel execution**: Each agent runs in their own Cursor window, allowing true parallel work

## Differences from `use-subagents`

- **Structured tasks**: Jobs use structured task types with predefined command sequences
- **Sequential execution**: Tasks within a job execute sequentially with proper timing
- **Better organization**: Job files are easier to review and modify than instruction files
- **Reusable**: Job files can be reused or modified for similar work

## Next Steps

1. Create job files using `/plan-job` for each sub-agent
2. Review the job files to ensure they're correct
3. Spawn agents with `csa spawn-jobs "job1" "job2" ...`
4. Wait for agents with `csa wait <sessionId>`
5. Verify and accept/feedback each agent as they complete

