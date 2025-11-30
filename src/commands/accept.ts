import { loadState, saveState, findAgentById } from '../utils.js';
import { AgentState } from '../types.js';
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
  
  // Check if there are more agents to wait for
  const session = state.sessions[found.sessionId];
  if (!session) {
    return;
  }
  
  const runningAgents = session.agents.filter(
    (a: AgentState) => a.status === 'running'
  );
  const pendingAgents = session.agents.filter(
    (a: AgentState) => a.status === 'pending_verification'
  );
  const allApproved = session.agents.every(
    (a: AgentState) => a.status === 'approved'
  );
  
  console.log();
  if (allApproved) {
    console.log(
      chalk.green(
        `\n🎉 All agents approved! Session ${found.sessionId} is complete.\n`
      )
    );
  } else if (pendingAgents.length > 0 || runningAgents.length > 0) {
    console.log(
      chalk.yellow(
        `\n🤖 AUTOMATED WORKFLOW: Continue monitoring for more agent completions.\n`
      )
    );
    console.log(
      chalk.blue(
        `\n📋 Next step: Run ${chalk.bold(`csa wait ${found.sessionId}`)} to check for more agent completions.\n`
      )
    );
    if (pendingAgents.length > 0) {
      console.log(
        chalk.gray(
          `  (${pendingAgents.length} agent(s) already pending verification)\n`
        )
      );
    }
    if (runningAgents.length > 0) {
      console.log(
        chalk.gray(
          `  (${runningAgents.length} agent(s) still running)\n`
        )
      );
    }
  }
}
