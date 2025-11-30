import chalk from "chalk";
import { AgentState } from "../types.js";
import {
  cleanupOldSessions,
  generateAgentId,
  generateSessionId,
  loadJob,
  loadState,
  saveState,
  sleep,
  spawnAgentWithJob,
} from "../utils.js";

export async function spawnAgentsWithJobs(jobIds: string[]): Promise<string> {
  if (jobIds.length === 0) {
    console.error(chalk.red("Error: At least one job ID is required"));
    process.exit(1);
  }

  // Clean up old sessions on startup
  await cleanupOldSessions();

  const state = await loadState();
  const sessionId = generateSessionId();
  const agents: AgentState[] = [];
  const startedAt = new Date().toISOString();

  console.log(chalk.blue(`\n🚀 Session created: ${sessionId}\n`));

  const repository = process.cwd();

  // Create agents from jobs
  for (const jobId of jobIds) {
    try {
      const job = await loadJob(jobId);
      const agentId = generateAgentId();
      const agent: AgentState = {
        id: agentId,
        prompt: job.goal, // Use job goal as prompt
        status: "running",
        startedAt,
        repository,
      };
      agents.push(agent);

      console.log(
        chalk.gray(
          `  • Agent ${chalk.bold(agentId)} (${chalk.bold(
            jobId
          )}): ${job.goal.substring(0, 60)}${job.goal.length > 60 ? "..." : ""}`
        )
      );
      console.log(chalk.gray(`     Tasks: ${job.tasks.length}`));
    } catch (error) {
      console.error(
        chalk.red(
          `  ❌ Failed to load job ${jobId}: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      );
    }
  }

  if (agents.length === 0) {
    console.error(chalk.red("Error: No valid jobs found"));
    process.exit(1);
  }

  // Save initial state
  state.sessions[sessionId] = {
    agents,
    createdAt: startedAt,
  };
  await saveState(state);

  console.log(chalk.blue("\n📡 Spawning agents with jobs...\n"));

  // Spawn agents sequentially with await (not detached processes)
  // Each agent opens a new window and executes their job tasks
  for (const [index, jobId] of jobIds.entries()) {
    const agent = agents[index];
    if (!agent) continue;

    console.log(
      chalk.yellow(
        `\n📋 Spawning agent ${chalk.bold(agent.id)} with job ${chalk.bold(
          jobId
        )}...`
      )
    );

    try {
      // This will open a new window and execute all tasks sequentially
      await spawnAgentWithJob(jobId, agent.id);
      console.log(
        chalk.green(`  ✅ Agent ${agent.id} spawned and job tasks scheduled`)
      );
    } catch (error) {
      console.error(
        chalk.red(
          `  ❌ Failed to spawn agent ${agent.id}: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      );
    }

    // Wait between agents to avoid window conflicts and ensure previous window is done
    if (index < jobIds.length - 1) {
      console.log(chalk.gray("  ⏳ Waiting before next agent..."));
      await sleep(3000); // Longer wait to ensure previous agent's tasks are done
    }
  }

  console.log(
    chalk.yellow(
      `\n⏳ Now wait for sub-jobs to report with: ${chalk.bold(
        `csa wait ${sessionId}`
      )}\n`
    )
  );

  return sessionId;
}
