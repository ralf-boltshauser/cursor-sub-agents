import { loadState, getRepositoryIdentifier, cleanupOldSessions } from '../utils.js';
import chalk from 'chalk';
import { AgentState } from '../types.js';

export async function listStatus(sessionId?: string): Promise<void> {
  // Clean up old sessions before displaying status
  await cleanupOldSessions();
  
  const state = await loadState();
  const sessions = Object.entries(state.sessions);

  if (sessions.length === 0) {
    console.log(chalk.gray('No active or past sessions'));
    return;
  }

  // Filter sessions if sessionId is provided
  const targetSessionId = sessionId;
  const filteredSessions = targetSessionId 
    ? sessions.filter(([id]) => id === targetSessionId)
    : sessions;

  if (targetSessionId && filteredSessions.length === 0) {
    console.log(chalk.red(`Session ${targetSessionId} not found`));
    return;
  }

  // Collect all agents from filtered sessions
  const allAgents: Array<{
    id: string;
    startedAt: string;
    repository: string;
    prompt: string;
    status: AgentState['status'];
    sessionId: string;
    returnMessage?: string;
    feedback?: string;
  }> = [];

  for (const [sessionId, session] of filteredSessions) {
    for (const agent of session.agents) {
      allAgents.push({
        id: agent.id,
        startedAt: agent.startedAt,
        repository: agent.repository || process.cwd(), // Fallback to current dir if not set
        prompt: agent.prompt,
        status: agent.status,
        sessionId,
        returnMessage: agent.returnMessage,
        feedback: agent.feedback,
      });
    }
  }

  // Sort by startedAt (newest first)
  allAgents.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  // Display as table
  displayTable(allAgents);
}

function displayTable(agents: Array<{
  id: string;
  startedAt: string;
  repository: string;
  prompt: string;
  status: AgentState['status'];
  sessionId: string;
  returnMessage?: string;
  feedback?: string;
}>): void {
  if (agents.length === 0) {
    console.log(chalk.gray('No agents found'));
    return;
  }

  // Calculate column widths
  const idWidth = agents.length > 0 
    ? Math.max(4, Math.max(...agents.map(a => a.id.length)) + 2)
    : 6;
  const statusWidth = 12;
  const startedAtWidth = 20;
  const repoWidth = agents.length > 0
    ? Math.min(35, Math.max(18, Math.max(...agents.map(a => getRepositoryIdentifier(a.repository).length)) + 2))
    : 25;
  const promptWidth = agents.length > 0
    ? Math.min(45, Math.max(25, Math.max(...agents.map(a => Math.min(45, a.prompt.length))))) + 2
    : 35;
  const messageWidth = 35;

  // Header
  const header = [
    chalk.bold('ID'.padEnd(idWidth)),
    chalk.bold('Status'.padEnd(statusWidth)),
    chalk.bold('Started At'.padEnd(startedAtWidth)),
    chalk.bold('Repository'.padEnd(repoWidth)),
    chalk.bold('Prompt'.padEnd(promptWidth)),
    chalk.bold('Message'),
  ].join(' │ ');

  const separator = '─'.repeat(idWidth) + '─┼─' +
                   '─'.repeat(statusWidth) + '─┼─' +
                   '─'.repeat(startedAtWidth) + '─┼─' +
                   '─'.repeat(repoWidth) + '─┼─' +
                   '─'.repeat(promptWidth) + '─┼─' +
                   '─'.repeat(messageWidth);

  console.log('\n' + header);
  console.log(chalk.gray(separator));

  // Rows
  for (const agent of agents) {
    const statusIcon = getStatusIcon(agent.status);
    const statusText = getStatusText(agent.status);
    const repoDisplay = truncatePath(getRepositoryIdentifier(agent.repository), repoWidth - 2);
    const promptDisplay = truncateText(agent.prompt, promptWidth - 2);
    const startedAtDisplay = new Date(agent.startedAt).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    // Show message for relevant statuses
    const messageDisplay = 
      (agent.status === 'completed' || agent.status === 'approved' || agent.status === 'failed' || agent.status === 'timeout' || agent.status === 'pending_verification') && agent.returnMessage
        ? chalk.gray(truncateText(agent.returnMessage, messageWidth - 2))
        : agent.status === 'feedback_requested' && agent.feedback
          ? chalk.yellow(truncateText(agent.feedback, messageWidth - 2))
          : chalk.gray('-');

    const row = [
      chalk.bold(agent.id).padEnd(idWidth),
      `${statusIcon} ${statusText}`.padEnd(statusWidth),
      startedAtDisplay.padEnd(startedAtWidth),
      repoDisplay.padEnd(repoWidth),
      promptDisplay.padEnd(promptWidth),
      messageDisplay,
    ].join(' │ ');

    console.log(row);
  }
  console.log();
}

function getStatusIcon(status: AgentState['status']): string {
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

function getStatusText(status: AgentState['status']): string {
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
      return chalk.green('done');
    case 'failed':
      return chalk.red('failed');
    case 'timeout':
      return chalk.red('timeout');
    default:
      return status;
  }
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
}

function truncatePath(path: string, maxLength: number): string {
  if (path.length <= maxLength) {
    return path;
  }
  // Show beginning if it's short enough, otherwise truncate from start
  const parts = path.split('/');
  if (parts.length >= 2) {
    const short = `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
    if (short.length <= maxLength) {
      return short;
    }
  }
  return '...' + path.substring(path.length - maxLength + 3);
}
