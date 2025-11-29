import chalk from "chalk";
import { AgentState } from "../types.js";
import {
  cleanupOldSessions,
  generateAgentId,
  generateSessionId,
  loadState,
  saveState,
  spawnAgent,
} from "../utils.js";

export async function spawnAgents(prompts: string[]): Promise<string> {
  if (prompts.length === 0) {
    console.error(chalk.red("Error: At least one prompt is required"));
    process.exit(1);
  }

  // Clean up old sessions on startup
  await cleanupOldSessions();

  const state = await loadState();
  const sessionId = generateSessionId(); // Longer, more unique session ID (8 chars)
  const agents: AgentState[] = [];
  const startedAt = new Date().toISOString();

  console.log(chalk.blue(`\n🚀 Session created: ${sessionId}\n`));

  // Get the current working directory (repository)
  const repository = process.cwd();

  // Create agents
  for (const prompt of prompts) {
    const agentId = generateAgentId(); // Unique agent ID (6 chars)
    const agent: AgentState = {
      id: agentId,
      prompt,
      status: "running",
      startedAt,
      repository,
    };
    agents.push(agent);

    console.log(
      chalk.gray(
        `  • Agent ${chalk.bold(agentId)}: ${prompt.substring(0, 60)}${
          prompt.length > 60 ? "..." : ""
        }`
      )
    );
  }

  // Save initial state
  state.sessions[sessionId] = {
    agents,
    createdAt: startedAt,
  };
  await saveState(state);

  // Spawn all agents sequentially with proper timing
  // Pattern per agent: open link -> wait 2s -> Enter -> wait 2s -> Enter -> wait 2s -> follow-up prompts
  // Each follow-up prompt takes 4 seconds: 1s typing + 1s delay + 2s before next
  // Calculate total time per agent: 6s (base) + 4s per follow-up
  console.log(chalk.blue("\n📡 Spawning agents...\n"));

  // Get follow-up prompts count for delay calculation (use first agent's prompts as reference)
  const { getFollowUpPromptsAsync } = await import("../utils.js");
  const followUpCount = (await getFollowUpPromptsAsync(agents[0]?.id || ""))
    .length;
  const timePerAgent = 6 + followUpCount * 4; // 6s base + 4s per follow-up

  for (const [index, agent] of agents.entries()) {
    // Each agent starts after previous completes
    // Agent 0 at 0s, agent 1 at timePerAgent, agent 2 at timePerAgent*2, etc.
    const delaySeconds = index * timePerAgent;
    await spawnAgent(agent.prompt, agent.id, delaySeconds);
  }

  console.log(
    chalk.yellow(
      `\n⏳ To wait for agents: ${chalk.bold(
        `cursor-sub-agents wait ${sessionId}`
      )}\n`
    )
  );

  return sessionId;
}
