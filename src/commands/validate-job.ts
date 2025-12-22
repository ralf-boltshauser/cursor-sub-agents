import chalk from "chalk";
import {
  getTaskTypeCommands,
  loadJobFileRaw,
  loadTaskTypes,
  validateCommandsExist,
  validateJobStructure,
} from "../utils.js";

export async function validateJob(jobId: string): Promise<void> {
  try {
    console.log(chalk.blue(`\n🔍 Validating job: ${chalk.bold(jobId)}\n`));

    // Load job file using utility function
    let job: any;
    let jobFile: string;
    try {
      const result = await loadJobFileRaw(jobId);
      job = result.job;
      jobFile = result.jobFile;
    } catch (error) {
      console.error(
        chalk.red(
          `❌ Failed to load job: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      );
      process.exit(1);
    }

    // Validate basic structure using the new validation function
    console.log(chalk.gray("Validating job structure..."));
    const structureErrors = validateJobStructure(job, jobId);

    if (structureErrors.length > 0) {
      console.error(chalk.red("  ❌ Job structure validation failed:\n"));
      for (const error of structureErrors) {
        console.error(chalk.red(`    • ${error}`));
      }
      console.error(chalk.gray(`\n  File: ${jobFile}`));
      console.error(
        chalk.gray(
          `\n  Run 'csa validate-job ${jobId}' after fixing the structure errors above.`
        )
      );
      process.exit(1);
    }

    console.log(chalk.green(`  ✅ Job structure valid`));
    console.log(chalk.gray(`  Goal: ${job.goal}`));
    console.log(chalk.gray(`  Tasks: ${job.tasks.length}\n`));

    // Validate each task
    let hasErrors = false;
    const allTaskTypes = await loadTaskTypes();

    for (const [taskIndex, task] of job.tasks.entries()) {
      console.log(
        chalk.gray(
          `Validating task ${taskIndex + 1}/${job.tasks.length}: ${chalk.bold(
            task.name || "unnamed"
          )}`
        )
      );

      // Validate task structure
      if (!task.name) {
        console.error(chalk.red("  ❌ Task missing 'name' field"));
        hasErrors = true;
        continue;
      }
      if (!task.type) {
        console.error(chalk.red("  ❌ Task missing 'type' field"));
        hasErrors = true;
        continue;
      }
      if (!Array.isArray(task.files)) {
        console.error(chalk.red("  ❌ Task 'files' must be an array"));
        hasErrors = true;
        continue;
      }
      if (!task.prompt) {
        console.error(chalk.red("  ❌ Task missing 'prompt' field"));
        hasErrors = true;
        continue;
      }

      // Validate task type exists
      if (!(task.type in allTaskTypes)) {
        console.error(
          chalk.red(
            `  ❌ Task type "${
              task.type
            }" not found. Available types: ${Object.keys(allTaskTypes).join(
              ", "
            )}`
          )
        );
        console.error(
          chalk.gray(
            `     Run 'csa task-types list' to see all available task types`
          )
        );
        hasErrors = true;
        continue;
      }

      // Get commands for this task type
      const commands = await getTaskTypeCommands(task.type);
      if (commands.length === 0) {
        console.warn(
          chalk.yellow(`  ⚠️  Task type "${task.type}" has no commands defined`)
        );
      } else {
        // Validate commands exist
        const missing = await validateCommandsExist(commands);
        if (missing.length > 0) {
          console.error(
            chalk.red(
              `  ❌ Missing commands: ${missing
                .map((c) => chalk.bold(c))
                .join(", ")}`
            )
          );
          console.error(
            chalk.gray(
              `     Expected files: ~/.cursor/commands/{command}.md or .cursor/commands/{command}.md`
            )
          );
          hasErrors = true;
        } else {
          console.log(
            chalk.green(
              `  ✅ Task type "${task.type}" valid (${
                commands.length
              } command(s): ${commands.join(", ")})`
            )
          );
        }
      }

      // Validate files (warn if files don't exist, but don't fail)
      if (task.files.length === 0) {
        console.warn(chalk.yellow("  ⚠️  Task has no files specified"));
      } else {
        console.log(
          chalk.gray(`  Files: ${task.files.length} file(s) specified`)
        );
      }
    }

    console.log();

    if (hasErrors) {
      console.error(
        chalk.red(
          "❌ Job validation failed. Please fix the errors above before scheduling."
        )
      );
      process.exit(1);
    } else {
      console.log(chalk.green("✅ Job is valid and ready to schedule!"));
      console.log(
        chalk.gray(`\n  Schedule with: ${chalk.bold(`csa schedule ${jobId}`)}`)
      );
      console.log(
        chalk.gray(
          `  Or spawn as sub-job: ${chalk.bold(`csa spawn-jobs ${jobId}`)}`
        )
      );
      console.log();
    }
  } catch (error) {
    console.error(
      chalk.red(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      )
    );
    process.exit(1);
  }
}
