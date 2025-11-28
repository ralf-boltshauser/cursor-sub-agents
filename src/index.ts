#!/usr/bin/env node

import chalk from "chalk";
import { Command } from "commander";
import { acceptAgent } from "./commands/accept.js";
import { addCommand } from "./commands/add-command.js";
import { completeAgent } from "./commands/complete.js";
import { feedbackAgent } from "./commands/feedback.js";
import { spawnAgents } from "./commands/spawn.js";
import { listStatus } from "./commands/status.js";
import { waitForAgents } from "./commands/wait.js";

const program = new Command();

program
  .name("cursor-sub-agents")
  .description("Manage multiple Cursor sub-agents in parallel")
  .version("1.1.0");

program
  .command("spawn")
  .description("Spawn agents and return immediately with session ID")
  .argument("<prompts...>", "One or more prompts to execute in parallel")
  .action(async (prompts: string[]) => {
    const sessionId = await spawnAgents(prompts);
    // Output session ID for scripting
    console.log(chalk.gray(`\nSession ID: ${sessionId}`));
  });

program
  .command("wait")
  .description("Wait for agents to submit work and show status")
  .argument("<sessionId>", "Session ID to wait for")
  .action(async (sessionId: string) => {
    await waitForAgents(sessionId);
  });

program
  .command("complete")
  .description("Submit agent work and wait for orchestrator approval")
  .argument("<agentId>", "Agent ID to mark as completed")
  .argument("[message]", "Optional return message")
  .option("-t, --timeout <minutes>", "Timeout in minutes", "30")
  .action(
    async (
      agentId: string,
      message?: string,
      options?: { timeout?: string }
    ) => {
      const timeout = options?.timeout ? parseInt(options.timeout, 10) : 30;
      await completeAgent(agentId, message, timeout);
    }
  );

program
  .command("accept")
  .description("Approve an agent's work")
  .argument("<agentId>", "Agent ID to approve")
  .action(async (agentId: string) => {
    await acceptAgent(agentId);
  });

program
  .command("feedback")
  .description("Request changes from an agent")
  .argument("<agentId>", "Agent ID to provide feedback to")
  .argument("<message>", "Feedback message")
  .action(async (agentId: string, message: string) => {
    await feedbackAgent(agentId, message);
  });

program
  .command("status")
  .alias("list")
  .description("List all sessions and their agents")
  .action(async () => {
    await listStatus();
  });

program
  .command("add-command")
  .alias("new-command")
  .description("Install a Cursor command template")
  .action(async () => {
    await addCommand();
  });

program.parse();
