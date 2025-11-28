import { loadState, saveState, findAgentById } from '../utils.js';
import chalk from 'chalk';

export async function feedbackAgent(agentId: string, feedbackMessage: string): Promise<void> {
  const state = await loadState();
  const found = findAgentById(state, agentId);

  if (!found) {
    console.error(chalk.red(`Error: Agent ${agentId} not found`));
    process.exit(1);
  }

  const { agent } = found;

  if (agent.status === 'approved') {
    console.error(chalk.red(`Error: Agent ${agentId} is already approved and cannot receive feedback`));
    process.exit(1);
  }

  if (agent.status !== 'pending_verification') {
    console.error(chalk.red(`Error: Agent ${agentId} is not pending verification (current status: ${agent.status})`));
    process.exit(1);
  }

  agent.status = 'feedback_requested';
  agent.feedback = feedbackMessage;
  agent.verifiedAt = new Date().toISOString();

  await saveState(state);

  console.log(chalk.yellow(`📨 Feedback sent to agent ${agentId}`));
  console.log(chalk.gray(`  Message: ${feedbackMessage}`));
  if (agent.returnMessage) {
    console.log(chalk.gray(`  Original message: ${agent.returnMessage}`));
  }
}
