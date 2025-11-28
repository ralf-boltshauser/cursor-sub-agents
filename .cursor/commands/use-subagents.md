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
3. **Wait for completion** with `csa wait <sessionId>`
4. **Review and approve** with `csa accept <agentId>` or provide feedback with `csa feedback <agentId> "message"`
5. **Check status** anytime with `csa status`

## Important Notes

- Ensure tasks are **independent** - they should not depend on each other to run in parallel
- For sequential tasks, wait for one batch to complete before spawning the next
- Each agent will wait for approval before completing their work
- Use `csa status` to monitor all active sessions and agents

