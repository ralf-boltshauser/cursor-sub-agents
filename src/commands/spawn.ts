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
  // Pattern per agent: open link -> wait 2s -> Enter -> wait 2s -> Enter -> wait 2s (then next)
  // Each agent takes 6 seconds total (0s open, 2s Enter1, 4s Enter2, 6s next starts)
  console.log(chalk.blue("\n📡 Spawning agents...\n"));
  agents.forEach((agent, index) => {
    // Each agent starts after previous completes: agent 0 at 0s, agent 1 at 6s, agent 2 at 12s, etc.
    const delaySeconds = index * 6;
    spawnAgent(agent.prompt, agent.id, delaySeconds);
  });

  console.log(
    chalk.yellow(
      `\n⏳ To wait for agents: ${chalk.bold(
        `cursor-sub-agents wait ${sessionId}`
      )}\n`
    )
  );

  return sessionId;
}
