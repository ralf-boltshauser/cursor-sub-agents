# Use Sub-Agents

Split the tasks you've received into multiple components that can be run independently.

You then spawn sub-agents via:

```bash
csa spawn "prompt 1" "prompt 2" "prompt 3"
```

Those agents run in parallel and you need to ensure they are independent.

For running in sequence, you just wait until they are finished and then run the next `csa spawn ...` command.

## Workflow

1. **Split the task** into independent components
2. **Spawn agents** with `csa spawn "task1" "task2" "task3"`
3. **Wait for agents** with `csa wait <sessionId>` - this will notify you as soon as the first agent finishes
4. **Verify the finished agent**:
   - If the work is good: `csa accept <agentId>`
   - If changes are needed: `csa feedback <agentId> "your feedback message"`
5. **Repeat steps 3-4**: Go back to `csa wait <sessionId>` to check for the next finished agent, then verify it, and so on until all agents are finished
6. **Take conclusion**: Once all agents are verified and accepted, proceed with your conclusion and next steps

## Important Notes

- Ensure tasks are **independent** - they should not depend on each other to run in parallel
- For sequential tasks, wait for one batch to complete before spawning the next
- Each agent will wait for approval before completing their work
- Use `csa status` to monitor all active sessions and agents
- **The workflow is iterative**: After spawning, use `csa wait` to be notified when agents finish, then verify each one immediately. You don't need to wait for all agents to complete before starting verification

