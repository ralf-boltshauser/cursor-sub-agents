import chalk from "chalk";
import { AgentState } from "../types.js";
import {
  cleanupOldSessions,
  generateAgentId,
  generateSessionId,
  getJobLocation,
  loadJob,
  loadJobFileRaw,
  loadState,
  saveState,
  sleep,
  spawnAgentWithJob,
  validateJobStructure,
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
      const location = await getJobLocation(jobId);

      // Load and validate job structure before loading
      let jobFile: string;
      let job: unknown;
      try {
        const result = await loadJobFileRaw(jobId);
        job = result.job;
        jobFile = result.jobFile;
      } catch (error) {
        console.error(
          chalk.red(
            `  ❌ Failed to load job ${jobId}: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        );
        continue;
      }

      // Validate job structure
      const structureErrors = validateJobStructure(job, jobId);
      if (structureErrors.length > 0) {
        console.error(chalk.red(`  ❌ Job ${jobId} validation failed:\n`));
        for (const error of structureErrors) {
          console.error(chalk.red(`    • ${error}`));
        }
        console.error(chalk.gray(`    File: ${jobFile}`));
        console.error(
          chalk.gray(
            `    Run 'csa validate-job ${jobId}' for detailed validation\n`
          )
        );
        continue;
      }

      // Load the validated job (this will work now since structure is valid)
      const validatedJob = await loadJob(jobId);
      const agentId = generateAgentId();
      const agent: AgentState = {
        id: agentId,
        prompt: validatedJob.goal, // Use job goal as prompt
        status: "running",
        startedAt,
        repository,
      };
      agents.push(agent);

      const locationText =
        location === "local" ? chalk.cyan("local") : chalk.yellow("global");
      console.log(
        chalk.gray(
          `  • Agent ${chalk.bold(agentId)} (${chalk.bold(
            jobId
          )}): ${validatedJob.goal.substring(0, 60)}${
            validatedJob.goal.length > 60 ? "..." : ""
          }`
        )
      );
      console.log(chalk.gray(`     Source: ${locationText}`));
      console.log(chalk.gray(`     Tasks: ${validatedJob.tasks.length}`));
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
      `\n🤖 AUTOMATED WORKFLOW: You must now automatically monitor and approve all agents.\n`
    )
  );
  console.log(
    chalk.blue(
      `\n📋 Next steps (execute these automatically, in a loop until all agents are approved):\n`
    )
  );
  console.log(
    chalk.gray(
      `  1. Run: ${chalk.bold(
        `csa wait ${sessionId}`
      )} - This will notify you when an agent completes\n`
    )
  );
  console.log(
    chalk.gray(
      `  2. Review the completed agent's work (check files, test, verify changes)\n`
    )
  );
  console.log(
    chalk.gray(
      `  3. If work is good: Run ${chalk.bold(
        `csa accept <agentId>`
      )} to approve\n`
    )
  );
  console.log(
    chalk.gray(
      `     If changes needed: Run ${chalk.bold(
        `csa feedback <agentId> "your feedback"`
      )} to request changes\n`
    )
  );
  console.log(
    chalk.gray(
      `  4. Go back to step 1 (run ${chalk.bold(
        `csa wait ${sessionId}`
      )} again) until all agents are approved\n`
    )
  );
  console.log(
    chalk.yellow(
      `\n🚀 START NOW: Execute ${chalk.bold(
        `csa wait ${sessionId}`
      )} to begin monitoring.\n`
    )
  );

  return sessionId;
}
