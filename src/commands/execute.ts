import chalk from "chalk";
import {
  getJobLocation,
  getTaskTypeCommands,
  loadJob,
  loadTaskTypes,
  scheduleSelfPrompt,
  sleep,
  validateCommandsExist,
} from "../utils.js";

interface TaskValidationError {
  taskIndex: number;
  taskName: string;
  error: string;
}

export async function scheduleJob(jobId: string): Promise<void> {
  try {
    console.log(chalk.blue(`\n📅 Scheduling job: ${chalk.bold(jobId)}\n`));

    // Load job and show location
    const location = await getJobLocation(jobId);
    const job = await loadJob(jobId);
    const locationText = location === "local" ? chalk.cyan("local") : chalk.yellow("global");
    console.log(chalk.gray(`Source: ${locationText}`));
    console.log(chalk.gray(`Goal: ${job.goal}`));
    console.log(chalk.gray(`Tasks: ${job.tasks.length}\n`));

    if (job.tasks.length === 0) {
      console.error(chalk.red("Error: Job has no tasks"));
      process.exit(1);
    }

    // Validate all tasks upfront before starting execution
    console.log(chalk.blue("🔍 Validating all tasks before scheduling...\n"));
    const errors: TaskValidationError[] = [];
    const allTaskTypes = await loadTaskTypes();

    for (const [taskIndex, task] of job.tasks.entries()) {
      // Validate task structure
      if (!task.name) {
        errors.push({
          taskIndex: taskIndex + 1,
          taskName: "unnamed",
          error: "Task missing 'name' field",
        });
        continue;
      }
      if (!task.type) {
        errors.push({
          taskIndex: taskIndex + 1,
          taskName: task.name,
          error: "Task missing 'type' field",
        });
        continue;
      }
      if (!Array.isArray(task.files)) {
        errors.push({
          taskIndex: taskIndex + 1,
          taskName: task.name,
          error: "Task 'files' must be an array",
        });
        continue;
      }
      if (!task.prompt) {
        errors.push({
          taskIndex: taskIndex + 1,
          taskName: task.name,
          error: "Task missing 'prompt' field",
        });
        continue;
      }

      // Validate task type exists
      if (!(task.type in allTaskTypes)) {
        errors.push({
          taskIndex: taskIndex + 1,
          taskName: task.name,
          error: `Task type "${
            task.type
          }" not found. Available types: ${Object.keys(allTaskTypes).join(
            ", "
          )}`,
        });
        continue;
      }

      // Get commands for this task type
      const commands = await getTaskTypeCommands(task.type);
      if (commands.length === 0) {
        errors.push({
          taskIndex: taskIndex + 1,
          taskName: task.name,
          error: `Task type "${task.type}" has no commands defined`,
        });
        continue;
      }

      // Validate all commands exist
      const missing = await validateCommandsExist(commands);
      if (missing.length > 0) {
        errors.push({
          taskIndex: taskIndex + 1,
          taskName: task.name,
          error: `Missing commands: ${missing.join(", ")}`,
        });
        continue;
      }
    }

    // Report all errors if any
    if (errors.length > 0) {
      console.error(
        chalk.red(
          "\n❌ Validation failed! Found errors in the following tasks:\n"
        )
      );
      for (const error of errors) {
        console.error(
          chalk.red(
            `  Task ${error.taskIndex} (${chalk.bold(error.taskName)}): ${
              error.error
            }`
          )
        );
      }
      console.error(
        chalk.gray(
          `\n  Run 'csa task-types list' to see all available task types`
        )
      );
      console.error(
        chalk.gray(
          `  Run 'csa task-types validate' to check all task types and commands`
        )
      );
      console.error(
        chalk.gray(
          `  Run 'csa validate-job ${jobId}' for detailed validation\n`
        )
      );
      process.exit(1);
    }

    console.log(chalk.green("✅ All tasks validated successfully!\n"));

    // Process each task sequentially
    for (const [taskIndex, task] of job.tasks.entries()) {
      console.log(
        chalk.yellow(
          `\n📋 Task ${taskIndex + 1}/${job.tasks.length}: ${chalk.bold(
            task.name
          )}`
        )
      );
      console.log(chalk.gray(`   Type: ${task.type}`));
      console.log(chalk.gray(`   Files: ${task.files.join(", ")}`));

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
            `      Run 'csa task-types validate' to check all task types.`
          )
        );
        continue;
      }

      console.log(chalk.gray(`   Commands: ${commands.join(" → ")}`));

      // Create kickoff prompt with all files
      const filesList =
        task.files.length === 1
          ? task.files[0]
          : task.files.map((f, i) => `${i + 1}. ${f}`).join("\n");
      const filesInstruction =
        task.files.length === 1
          ? `You are expected to read ${task.files[0]}.`
          : `You are expected to read the following files:\n${filesList}`;
      const kickoffPrompt = `You have the following task: ${task.prompt}. ${filesInstruction} Task type: ${task.type}.\n\nDon't start working yet - wait for me to send you the commands.`;

      // Schedule kickoff prompt (waits for completion)
      console.log(chalk.blue("   📤 Sending kickoff prompt..."));
      await scheduleSelfPrompt(kickoffPrompt, false);

      // Wait between kickoff and first command
      await sleep(1000);

      // Schedule each command sequentially (waits for each to complete)
      for (const [cmdIndex, command] of commands.entries()) {
        const commandText = `/${command}`;
        console.log(chalk.blue(`   📤 Scheduling: ${commandText}`));
        await scheduleSelfPrompt(commandText, true);

        // Wait between commands (except after the last one)
        if (cmdIndex < commands.length - 1) {
          await sleep(1000);
        }
      }

      console.log(chalk.green(`   ✅ Completed ${commands.length} command(s)`));

      // Wait between tasks (except after the last one)
      if (taskIndex < job.tasks.length - 1) {
        console.log(chalk.gray("   ⏳ Waiting before next task..."));
        await sleep(1000);
      }
    }

    console.log(
      chalk.blue(`\n✅ Job scheduled! All prompts have been sent to Cursor.\n`)
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
