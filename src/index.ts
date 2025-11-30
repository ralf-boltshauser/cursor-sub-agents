#!/usr/bin/env node

import chalk from "chalk";
import { Command } from "commander";
import { acceptAgent } from "./commands/accept.js";
import { addCommand } from "./commands/add-command.js";
import { listCommands } from "./commands/commands.js";
import { completeAgent } from "./commands/complete.js";
import {
  addPrompt,
  clearConfig,
  copyGlobalToLocal,
  interactiveConfig,
  removePrompt,
  reorderPrompt,
  resetConfig,
  setPrompts,
  showConfig,
  useGlobal,
} from "./commands/config.js";
import { scheduleJob } from "./commands/execute.js";
import { feedbackAgent } from "./commands/feedback.js";
import { spawnAgentsWithJobs } from "./commands/spawn-jobs.js";
import { spawnAgents } from "./commands/spawn.js";
import { listStatus } from "./commands/status.js";
import {
  addTaskType,
  editTaskType,
  interactiveTaskTypes,
  listTaskTypes,
  removeTaskType,
  showTaskType,
  validateTaskTypes,
} from "./commands/task-types.js";
import { validateJob } from "./commands/validate-job.js";
import { waitForAgents } from "./commands/wait.js";

const program = new Command();

program
  .name("cursor-sub-agents")
  .description("Manage multiple Cursor sub-agents in parallel")
  .version("1.5.2");

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
  .command("spawn-jobs")
  .description(
    "Spawn agents using job files (one agent per job, opens new windows)"
  )
  .argument("<jobIds...>", "One or more job IDs to spawn")
  .action(async (jobIds: string[]) => {
    const sessionId = await spawnAgentsWithJobs(jobIds);
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
  .description("List all sessions and their agents")
  .argument("[sessionId]", "Optional session ID to filter by")
  .action(async (sessionId?: string) => {
    await listStatus(sessionId);
  });

program
  .command("add-command")
  .description("Install a Cursor command template")
  .action(async () => {
    await addCommand();
  });

program
  .command("commands")
  .description("Open ~/.cursor/commands folder")
  .action(async () => {
    await listCommands();
  });

program
  .command("schedule")
  .description("Schedule a job by sending sequential Cursor commands")
  .argument("<jobId>", "Job ID to schedule")
  .action(async (jobId: string) => {
    await scheduleJob(jobId);
  });

program
  .command("validate-job")
  .description("Validate a job.json file (structure, task types, commands)")
  .argument("<jobId>", "Job ID to validate")
  .action(async (jobId: string) => {
    await validateJob(jobId);
  });

// Task Types Management
const taskTypesCommand = program
  .command("task-types")
  .description("Manage task types (interactive mode if no subcommand)");

taskTypesCommand
  .command("list")
  .description("List all task types (global + project)")
  .action(async () => {
    await listTaskTypes();
  });

taskTypesCommand
  .command("show")
  .description("Show details of a specific task type")
  .argument("<name>", "Task type name")
  .action(async (name: string) => {
    await showTaskType(name);
  });

taskTypesCommand
  .command("add")
  .description("Add a new task type")
  .argument("<name>", "Task type name")
  .argument("[commands...]", "Command sequence (space-separated)")
  .option("-g, --global", "Add to global config instead of project")
  .action(
    async (
      name: string,
      commands: string[],
      options?: { global?: boolean }
    ) => {
      await addTaskType(
        name,
        commands.length > 0 ? commands : undefined,
        options?.global || false
      );
    }
  );

taskTypesCommand
  .command("remove")
  .description("Remove a task type")
  .argument("<name>", "Task type name")
  .option("-g, --global", "Remove from global config instead of project")
  .action(async (name: string, options?: { global?: boolean }) => {
    await removeTaskType(name, options?.global || false);
  });

taskTypesCommand
  .command("edit")
  .description("Edit an existing task type")
  .argument("<name>", "Task type name")
  .option("-g, --global", "Edit in global config instead of project")
  .action(async (name: string, options?: { global?: boolean }) => {
    await editTaskType(name, options?.global || false);
  });

taskTypesCommand
  .command("validate")
  .description("Validate that all commands in task-types.json exist")
  .action(async () => {
    await validateTaskTypes();
  });

// Default action: interactive mode
taskTypesCommand.action(async () => {
  await interactiveTaskTypes();
});

// Config commands
const configCommand = program
  .command("config")
  .description("Manage follow-up prompt configuration");

configCommand
  .command("show")
  .description("Show current configuration")
  .action(async () => {
    await showConfig();
  });

configCommand
  .command("add")
  .description("Add a follow-up prompt")
  .argument("<prompt>", "The prompt text to add")
  .option("-g, --global", "Add to global config instead of local")
  .action(async (prompt: string, options?: { global?: boolean }) => {
    await addPrompt(prompt, options?.global || false);
  });

configCommand
  .command("remove")
  .description("Remove a follow-up prompt by index")
  .argument("<index>", "Index of the prompt to remove (1-based)")
  .option("-g, --global", "Remove from global config instead of local")
  .action(async (index: string, options?: { global?: boolean }) => {
    const indexNum = parseInt(index, 10);
    if (isNaN(indexNum) || indexNum < 1) {
      console.error(chalk.red("Error: Index must be a positive number"));
      process.exit(1);
    }
    await removePrompt(indexNum, options?.global || false);
  });

configCommand
  .command("reorder")
  .description("Reorder prompts by moving one to a new position")
  .argument("<from>", "Current index of the prompt (1-based)")
  .argument("<to>", "New index position (1-based)")
  .option("-g, --global", "Reorder in global config instead of local")
  .action(async (from: string, to: string, options?: { global?: boolean }) => {
    const fromNum = parseInt(from, 10);
    const toNum = parseInt(to, 10);
    if (isNaN(fromNum) || isNaN(toNum) || fromNum < 1 || toNum < 1) {
      console.error(chalk.red("Error: Both indices must be positive numbers"));
      process.exit(1);
    }
    await reorderPrompt(fromNum, toNum, options?.global || false);
  });

configCommand
  .command("set")
  .description("Set/overwrite all follow-up prompts")
  .argument(
    "<prompts...>",
    "One or more prompts (space-separated, use quotes for multi-word)"
  )
  .option("-g, --global", "Set global config instead of local")
  .action(async (prompts: string[], options?: { global?: boolean }) => {
    await setPrompts(prompts, options?.global || false);
  });

configCommand
  .command("copy-global")
  .description("Copy global config to local config")
  .action(async () => {
    await copyGlobalToLocal();
  });

configCommand
  .command("clear")
  .description("Clear all follow-up prompts")
  .option("-g, --global", "Clear global config instead of local")
  .action(async (options?: { global?: boolean }) => {
    await clearConfig(options?.global || false);
  });

configCommand
  .command("reset")
  .description("Reset config to default prompts")
  .option("-g, --global", "Reset global config instead of local")
  .action(async (options?: { global?: boolean }) => {
    await resetConfig(options?.global || false);
  });

configCommand
  .command("use-global")
  .description("Delete local config and use global config")
  .action(async () => {
    await useGlobal();
  });

// Default action: start interactive mode
configCommand.action(async () => {
  await interactiveConfig();
});

program.parse();
