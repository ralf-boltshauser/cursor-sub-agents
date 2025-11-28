import { loadState, STATE_FILE } from '../utils.js';
import chalk from 'chalk';
import fs from 'fs';

export async function waitForAgents(sessionId: string): Promise<void> {
  const state = await loadState();
  const session = state.sessions[sessionId];

  if (!session) {
    console.error(chalk.red(`Error: Session ${sessionId} not found`));
    process.exit(1);
  }

  // Check if all agents are approved
  const allApproved = session.agents.every(
    agent => agent.status === 'approved'
  );

  if (allApproved) {
    console.log(chalk.green('\n✅ All agents approved! Session complete.\n'));
    displaySessionStatus(sessionId, session);
    return;
  }

  // Check for pending agents
  const pendingAgents = session.agents.filter(
    agent => agent.status === 'pending_verification'
  );

  if (pendingAgents.length > 0) {
    // Already have pending agents, show status and return
    console.log(chalk.blue('\n📋 Agents pending verification:\n'));
    for (const agent of pendingAgents) {
      console.log(chalk.gray(`  • Agent ${chalk.bold(agent.id)}`));
      if (agent.returnMessage) {
        console.log(chalk.gray(`    Message: ${agent.returnMessage}`));
      }
    }
    console.log();
    displaySessionStatus(sessionId, session);
    return;
  }

  // No pending agents yet, wait for one to submit
  console.log(chalk.yellow('\n⏳ Waiting for agents to submit...\n'));

  return new Promise<void>((resolve) => {
    let isResolved = false;
    let isWatching = false;

    const checkForPending = async () => {
      if (isResolved) return;

      try {
        const currentState = await loadState();
        const currentSession = currentState.sessions[sessionId];

        if (!currentSession) {
          console.error(chalk.red('Error: Session not found'));
          isResolved = true;
          resolve();
          return;
        }

        // Check for pending agents
        const pending = currentSession.agents.filter(
          agent => agent.status === 'pending_verification'
        );

        // Check if all approved
        const allDone = currentSession.agents.every(
          agent => agent.status === 'approved'
        );

        if (allDone) {
          isResolved = true;
          if (isWatching) {
            fs.unwatchFile(STATE_FILE);
          }
          console.log(chalk.green('\n✅ All agents approved! Session complete.\n'));
          displaySessionStatus(sessionId, currentSession);
          resolve();
          return;
        }

        if (pending.length > 0) {
          isResolved = true;
          if (isWatching) {
            fs.unwatchFile(STATE_FILE);
          }
          
          console.log(chalk.blue('\n📋 Agent(s) submitted:\n'));
          for (const agent of pending) {
            console.log(chalk.gray(`  • Agent ${chalk.bold(agent.id)}`));
            if (agent.returnMessage) {
              console.log(chalk.gray(`    Message: ${agent.returnMessage}`));
            }
          }
          console.log();
          displaySessionStatus(sessionId, currentSession);
          resolve();
        }
      } catch (error) {
        console.error(chalk.red(`Error checking status: ${error}`));
        isResolved = true;
        if (isWatching) {
          fs.unwatchFile(STATE_FILE);
        }
        resolve();
      }
    };

    // Watch for file changes
    const watchFile = () => {
      if (isWatching) return;
      isWatching = true;
      fs.watchFile(STATE_FILE, { interval: 500 }, async (curr, prev) => {
        if (curr.mtimeMs !== prev.mtimeMs) {
          await checkForPending();
        }
      });
    };

    // Start watching
    watchFile();

    // Also check immediately
    checkForPending();
  });
}

function displaySessionStatus(sessionId: string, session: any): void {
  console.log(chalk.bold(`Session: ${sessionId}\n`));
  
  // Simple table
  const idWidth = 8;
  const statusWidth = 20;
  const messageWidth = 50;

  const header = [
    chalk.bold('ID'.padEnd(idWidth)),
    chalk.bold('Status'.padEnd(statusWidth)),
    chalk.bold('Message'),
  ].join(' │ ');

  const separator = '─'.repeat(idWidth) + '─┼─' +
                   '─'.repeat(statusWidth) + '─┼─' +
                   '─'.repeat(messageWidth);

  console.log(header);
  console.log(chalk.gray(separator));

  for (const agent of session.agents) {
    const statusIcon = getStatusIcon(agent.status);
    const statusText = getStatusText(agent.status);
    const message = agent.returnMessage || agent.feedback || '-';
    const messageDisplay = message.length > messageWidth - 2 
      ? message.substring(0, messageWidth - 5) + '...'
      : message;

    const row = [
      chalk.bold(agent.id).padEnd(idWidth),
      `${statusIcon} ${statusText}`.padEnd(statusWidth),
      messageDisplay,
    ].join(' │ ');

    console.log(row);
  }
  console.log();
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'running':
      return chalk.yellow('⏳');
    case 'pending_verification':
      return chalk.blue('📋');
    case 'feedback_requested':
      return chalk.yellow('📨');
    case 'approved':
      return chalk.green('✅');
    case 'completed':
      return chalk.green('✓');
    case 'failed':
      return chalk.red('✗');
    case 'timeout':
      return chalk.red('⏰');
    default:
      return '?';
  }
}

function getStatusText(status: string): string {
  switch (status) {
    case 'running':
      return chalk.yellow('running');
    case 'pending_verification':
      return chalk.blue('pending');
    case 'feedback_requested':
      return chalk.yellow('needs changes');
    case 'approved':
      return chalk.green('approved');
    case 'completed':
      return chalk.green('completed');
    case 'failed':
      return chalk.red('failed');
    case 'timeout':
      return chalk.red('timeout');
    default:
      return status;
  }
}
