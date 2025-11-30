import chalk from "chalk";
import {
  getTaskTypeCommands,
  loadJob,
  scheduleSelfPrompt,
  sleep,
  validateCommandsExist,
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
          chalk.gray(`      Run 'csa validate-tasks' to check all task types.`)
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
      const kickoffPrompt = `You have the following task: ${task.prompt}. ${filesInstruction} Task type: ${task.type}.`;

      // Execute kickoff prompt (waits for completion)
      console.log(chalk.blue("   📤 Sending kickoff prompt..."));
      await scheduleSelfPrompt(kickoffPrompt, false);

      // Wait between kickoff and first command
      await sleep(2000);

      // Execute each command sequentially (waits for each to complete)
      for (const [cmdIndex, command] of commands.entries()) {
        const commandText = `/${command}`;
        console.log(chalk.blue(`   📤 Executing: ${commandText}`));
        await scheduleSelfPrompt(commandText, true);

        // Wait between commands (except after the last one)
        if (cmdIndex < commands.length - 1) {
          await sleep(2000);
        }
      }

      console.log(chalk.green(`   ✅ Completed ${commands.length} command(s)`));

      // Wait between tasks (except after the last one)
      if (taskIndex < job.tasks.length - 1) {
        console.log(chalk.gray("   ⏳ Waiting before next task..."));
        await sleep(2000);
      }
    }

    console.log(chalk.blue(`\n✅ Job execution completed!\n`));
  } catch (error) {
    console.error(
      chalk.red(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      )
    );
    process.exit(1);
  }
}
