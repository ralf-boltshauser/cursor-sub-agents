import { loadState, saveState, findAgentById, STATE_FILE } from '../utils.js';
import chalk from 'chalk';
import fs from 'fs';

export async function completeAgent(agentId: string, returnMessage?: string, timeoutMinutes: number = 30): Promise<void> {
  const state = await loadState();
  const found = findAgentById(state, agentId);

  if (!found) {
    console.error(chalk.red(`Error: Agent ${agentId} not found`));
    process.exit(1);
  }

  const { sessionId, agent } = found;

  // Check current status
  if (agent.status === 'approved') {
    console.log(chalk.green(`✓ Agent ${agentId} already approved`));
    return;
  }

  // Check if this is a resubmission (was feedback_requested) or first submission
  const isResubmission = agent.status === 'feedback_requested';
  
  // Mark as pending verification (first time or resubmission after feedback)
  agent.status = 'pending_verification';
  agent.submittedAt = new Date().toISOString();
  if (returnMessage) {
    agent.returnMessage = returnMessage;
  }
  
  // Increment feedback count if this is a resubmission
  if (isResubmission) {
    agent.feedbackCount = (agent.feedbackCount || 0) + 1;
  } else if (agent.feedbackCount === undefined) {
    agent.feedbackCount = 0;
  }

  await saveState(state);

  console.log(chalk.blue(`\n📋 Agent ${agentId} submitted for verification`));
  if (returnMessage) {
    console.log(chalk.gray(`  Message: ${returnMessage}`));
  }
  console.log(chalk.yellow(`\n⏳ Waiting for orchestrator feedback...\n`));

  // Wait for approval or feedback
  const timeoutMs = timeoutMinutes * 60 * 1000;
  const startTime = Date.now();
  let isResolved = false;
  let isWatching = false;

  return new Promise<void>((resolve, reject) => {
    const checkStatus = async () => {
      if (isResolved) return;

      try {
        const currentState = await loadState();
        const found = findAgentById(currentState, agentId);
        
        if (!found) {
          console.error(chalk.red('Error: Agent not found'));
          isResolved = true;
          resolve();
          return;
        }

        const currentAgent = found.agent;
        const timedOut = Date.now() - startTime > timeoutMs;

        if (timedOut) {
          isResolved = true;
          if (isWatching) {
            fs.unwatchFile(STATE_FILE);
          }
          console.error(chalk.red(`\n⏰ Timeout: No response from orchestrator after ${timeoutMinutes} minutes`));
          reject(new Error('Timeout waiting for feedback'));
          return;
        }

        // Check if approved
        if (currentAgent.status === 'approved') {
          isResolved = true;
          if (isWatching) {
            fs.unwatchFile(STATE_FILE);
          }
          console.log(chalk.green('\n✅ Approved by orchestrator'));
          console.log(chalk.green('Task complete!\n'));
          resolve();
          return;
        }

        // Check if feedback received
        if (currentAgent.status === 'feedback_requested' && currentAgent.feedback) {
          isResolved = true;
          if (isWatching) {
            fs.unwatchFile(STATE_FILE);
          }
          console.log(chalk.yellow('\n📨 Feedback received:'));
          console.log(chalk.gray(`  ${currentAgent.feedback}\n`));
          resolve();
          return;
        }

      } catch (error) {
        console.error(chalk.red(`Error checking status: ${error}`));
      }
    };

    // Watch for file changes
    const watchFile = () => {
      if (isWatching) return;
      isWatching = true;
      fs.watchFile(STATE_FILE, { interval: 1000 }, async (curr, prev) => {
        if (curr.mtimeMs !== prev.mtimeMs) {
          await checkStatus();
        }
      });
    };

    // Start watching
    watchFile();

    // Also check periodically (in case file watching misses something)
    const checkInterval = setInterval(() => {
      if (isResolved) {
        clearInterval(checkInterval);
        return;
      }
      checkStatus();
    }, 2000);

    // Check immediately
    checkStatus();
  });
}
