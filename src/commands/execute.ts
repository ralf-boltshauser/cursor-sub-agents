import chalk from "chalk";
import {
  loadJob,
  getTaskTypeCommands,
  validateCommandsExist,
  scheduleSelfPrompt,
} from "../utils.js";

export async function executeJob(jobId: string): Promise<void> {
  try {
    console.log(chalk.blue(`\n🚀 Executing job: ${chalk.bold(jobId)}\n`));

    // Load job
    const job = await loadJob(jobId);
    console.log(chalk.gray(`Goal: ${job.goal}`));
    console.log(chalk.gray(`Tasks: ${job.tasks.length}\n`));

    if (job.tasks.length === 0) {
      console.error(chalk.red("Error: Job has no tasks"));
      process.exit(1);
    }

    // Calculate timing
    // Each action takes time: type text, wait, Enter, wait
    // Kickoff: type (~1s) + wait (0.5s) + Enter + wait (1s) + Enter + wait (2s) = ~4.5s
    // Command: type (~0.5s) + wait (0.5s) + Enter + wait (1s) + Enter + wait (2s) = ~4s
    const KICKOFF_TIME = 4.5;
    const COMMAND_TIME = 4.0;

    let currentDelay = 0;

    // Process each task
    for (const [taskIndex, task] of job.tasks.entries()) {
      console.log(
        chalk.yellow(
          `\n📋 Task ${taskIndex + 1}/${job.tasks.length}: ${chalk.bold(task.name)}`
        )
      );
      console.log(chalk.gray(`   Type: ${task.type}`));
      console.log(chalk.gray(`   File: ${task.file}`));

      // Get commands for this task type
      const commands = await getTaskTypeCommands(task.type);

      if (commands.length === 0) {
        console.error(
          chalk.red(
            `   ❌ No commands found for task type "${task.type}". Skipping task.`
          )
        );
        continue;
      }

      // Validate all commands exist
      const missing = await validateCommandsExist(commands);
      if (missing.length > 0) {
        console.error(
          chalk.red(
            `   ❌ Missing commands: ${missing.join(", ")}. Skipping task.`
          )
        );
        console.error(
          chalk.gray(
            `      Run 'csa validate-tasks' to check all task types.`
          )
        );
        continue;
      }

      console.log(
        chalk.gray(`   Commands: ${commands.join(" → ")}`)
      );

      // Create kickoff prompt
      const kickoffPrompt = `You have the following task: ${task.prompt}. You are expected to read ${task.file}. Task type: ${task.type}.`;

      // Schedule kickoff prompt
      scheduleSelfPrompt(kickoffPrompt, currentDelay, false);
      currentDelay += KICKOFF_TIME;

      // Schedule each command
      for (const command of commands) {
        const commandText = `/${command}`;
        scheduleSelfPrompt(commandText, currentDelay, true);
        currentDelay += COMMAND_TIME;
      }

      console.log(
        chalk.green(
          `   ✅ Scheduled ${commands.length} command(s) starting in ${(currentDelay - commands.length * COMMAND_TIME - KICKOFF_TIME).toFixed(1)}s`
        )
      );
    }

    console.log(
      chalk.blue(
        `\n⏳ Execution scheduled. Total time: ~${currentDelay.toFixed(1)}s\n`
      )
    );
    console.log(
      chalk.gray(
        "💡 Commands will be sent to Cursor sequentially. Make sure Cursor is focused and ready.\n"
      )
    );
  } catch (error) {
    console.error(
      chalk.red(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      )
    );
    process.exit(1);
  }
}

