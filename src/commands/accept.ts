import { loadState, saveState, findAgentById } from '../utils.js';
import chalk from 'chalk';

export async function acceptAgent(agentId: string): Promise<void> {
  const state = await loadState();
  const found = findAgentById(state, agentId);

  if (!found) {
    console.error(chalk.red(`Error: Agent ${agentId} not found`));
    process.exit(1);
  }

  const { agent } = found;

  if (agent.status === 'approved') {
    console.log(chalk.yellow(`Agent ${agentId} is already approved`));
    return;
  }

  if (agent.status !== 'pending_verification' && agent.status !== 'feedback_requested') {
    console.error(chalk.red(`Error: Agent ${agentId} is not pending verification (current status: ${agent.status})`));
    process.exit(1);
  }

  agent.status = 'approved';
  agent.verifiedAt = new Date().toISOString();
  agent.completedAt = new Date().toISOString();

  await saveState(state);

  console.log(chalk.green(`✅ Agent ${agentId} approved`));
  if (agent.returnMessage) {
    console.log(chalk.gray(`  Message: ${agent.returnMessage}`));
  }
}
