import chalk from "chalk";
import {
  loadTaskTypes,
  validateCommandsExist,
  ensureGlobalTaskTypesFile,
} from "../utils.js";

export async function validateTasks(): Promise<void> {
  try {
    // Ensure global task-types.json exists (creates with defaults if missing)
    await ensureGlobalTaskTypesFile();

    // Load task types
    const taskTypes = await loadTaskTypes();

    if (Object.keys(taskTypes).length === 0) {
      console.error(chalk.red("Error: No task types found"));
      process.exit(1);
    }

    console.log(chalk.blue("\n🔍 Validating task types and commands...\n"));

    let hasErrors = false;
    const taskTypeNames = Object.keys(taskTypes);

    for (const taskType of taskTypeNames) {
      const commands = taskTypes[taskType];
      console.log(chalk.gray(`Checking task type: ${chalk.bold(taskType)}`));

      if (!Array.isArray(commands) || commands.length === 0) {
        console.error(
          chalk.red(`  ❌ Task type "${taskType}" has no commands defined`)
        );
        hasErrors = true;
        continue;
      }

      const missing = await validateCommandsExist(commands);

      if (missing.length > 0) {
        console.error(
          chalk.red(
            `  ❌ Missing commands: ${missing.map((c) => chalk.bold(c)).join(", ")}`
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
            `  ✅ All ${commands.length} command(s) exist: ${commands.join(", ")}`
          )
        );
      }
    }

    console.log();

    if (hasErrors) {
      console.error(
        chalk.red(
          "❌ Validation failed. Please install missing commands or update task-types.json"
        )
      );
      process.exit(1);
    } else {
      console.log(chalk.green("✅ All task types and commands are valid!"));
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

