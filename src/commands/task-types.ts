import chalk from "chalk";
import readline from "readline";
import {
  loadTaskTypes,
  loadGlobalTaskTypes,
  loadProjectTaskTypes,
  saveGlobalTaskTypes,
  saveProjectTaskTypes,
  validateCommandsExist,
  ensureGlobalTaskTypesFile,
  ensureProjectTaskTypesDir,
  TaskTypeMapping,
} from "../utils.js";

// Validate all task types and their commands
export async function validateTaskTypes(): Promise<void> {
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

function question(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// List all task types (global + project)
export async function listTaskTypes(): Promise<void> {
  await ensureGlobalTaskTypesFile();
  await ensureProjectTaskTypesDir();

  const globalTypes = await loadGlobalTaskTypes();
  const projectTypes = await loadProjectTaskTypes();
  const mergedTypes = await loadTaskTypes();

  console.log(chalk.blue("\n📋 Task Types\n"));

  if (Object.keys(mergedTypes).length === 0) {
    console.log(chalk.gray("  No task types defined."));
    console.log(chalk.gray("  Use 'csa task-types add <name>' to create one.\n"));
    return;
  }

  // Show global task types
  if (Object.keys(globalTypes).length > 0) {
    console.log(chalk.yellow("  Global (available in all projects):"));
    for (const [name, commands] of Object.entries(globalTypes)) {
      const isOverridden = name in projectTypes;
      const marker = isOverridden ? chalk.gray(" (overridden by project)") : "";
      console.log(
        chalk.gray(`    • ${chalk.bold(name)}: ${commands.join(" → ")}${marker}`)
      );
    }
    console.log();
  }

  // Show project task types
  if (Object.keys(projectTypes).length > 0) {
    console.log(chalk.yellow("  Project (this project only):"));
    for (const [name, commands] of Object.entries(projectTypes)) {
      console.log(
        chalk.gray(`    • ${chalk.bold(name)}: ${commands.join(" → ")}`)
      );
    }
    console.log();
  }

  // Show merged (what's actually used)
  console.log(chalk.green("  Active (merged, project overrides global):"));
  for (const [name, commands] of Object.entries(mergedTypes)) {
    const source = name in projectTypes ? "project" : "global";
    console.log(
      chalk.gray(`    • ${chalk.bold(name)}: ${commands.join(" → ")} ${chalk.dim(`[${source}]`)}`)
    );
  }
  console.log();
}

// Show details of a specific task type
export async function showTaskType(name: string): Promise<void> {
  const mergedTypes = await loadTaskTypes();
  const globalTypes = await loadGlobalTaskTypes();
  const projectTypes = await loadProjectTaskTypes();

  if (!(name in mergedTypes)) {
    console.error(chalk.red(`\n❌ Task type "${name}" not found\n`));
    process.exit(1);
  }

  const commands = mergedTypes[name];
  const isGlobal = name in globalTypes;
  const isProject = name in projectTypes;
  const source = isProject ? "project" : "global";

  console.log(chalk.blue(`\n📋 Task Type: ${chalk.bold(name)}\n`));
  console.log(chalk.gray(`  Source: ${source}`));
  console.log(chalk.gray(`  Commands (${commands.length}):`));
  commands.forEach((cmd, index) => {
    console.log(chalk.gray(`    ${index + 1}. ${chalk.bold(cmd)}`));
  });

  // Validate commands
  const missing = await validateCommandsExist(commands);
  if (missing.length > 0) {
    console.log(chalk.red(`\n  ⚠️  Missing commands: ${missing.join(", ")}`));
  } else {
    console.log(chalk.green(`\n  ✅ All commands exist`));
  }
  console.log();
}

// Add a new task type
export async function addTaskType(
  name: string,
  commands?: string[],
  isGlobal: boolean = false
): Promise<void> {
  if (commands && commands.length > 0) {
    // Quick add with commands provided
    await addTaskTypeQuick(name, commands, isGlobal);
  } else {
    // Interactive add
    await addTaskTypeInteractive(name, isGlobal);
  }
}

async function addTaskTypeQuick(
  name: string,
  commands: string[],
  isGlobal: boolean
): Promise<void> {
  // Validate commands exist
  const missing = await validateCommandsExist(commands);
  if (missing.length > 0) {
    console.error(
      chalk.red(
        `\n❌ Missing commands: ${missing.join(", ")}\n  Run 'csa task-types validate' to check all commands.\n`
      )
    );
    process.exit(1);
  }

  const types = isGlobal
    ? await loadGlobalTaskTypes()
    : await loadProjectTaskTypes();
  const saveFn = isGlobal ? saveGlobalTaskTypes : saveProjectTaskTypes;

  if (name in types) {
    const overwrite = await question(
      chalk.yellow(
        `Task type "${name}" already exists. Overwrite? (y/N): `
      )
    );
    if (overwrite.toLowerCase().trim() !== "y") {
      console.log(chalk.gray("Cancelled."));
      return;
    }
  }

  types[name] = commands;
  await saveFn(types);

  const location = isGlobal ? "global" : "project";
  console.log(
    chalk.green(
      `\n✅ Task type "${name}" added to ${location} configuration\n`
    )
  );
}

async function addTaskTypeInteractive(
  name: string,
  isGlobal: boolean
): Promise<void> {
  const types = isGlobal
    ? await loadGlobalTaskTypes()
    : await loadProjectTaskTypes();
  const saveFn = isGlobal ? saveGlobalTaskTypes : saveProjectTaskTypes;

  if (name in types) {
    const overwrite = await question(
      chalk.yellow(
        `Task type "${name}" already exists. Overwrite? (y/N): `
      )
    );
    if (overwrite.toLowerCase().trim() !== "y") {
      console.log(chalk.gray("Cancelled."));
      return;
    }
  }

  console.log(chalk.blue(`\n📝 Adding task type: ${chalk.bold(name)}\n`));
  console.log(
    chalk.gray(
      "Enter commands one by one (press Enter with empty line to finish):\n"
    )
  );

  const commands: string[] = [];
  let index = 1;

  while (true) {
    const command = await question(
      chalk.yellow(`  Command ${index} (or press Enter to finish): `)
    );
    const trimmed = command.trim();
    if (trimmed === "") {
      break;
    }
    commands.push(trimmed);
    index++;
  }

  if (commands.length === 0) {
    console.error(chalk.red("\n❌ No commands provided. Cancelled.\n"));
    return;
  }

  // Validate commands exist
  const missing = await validateCommandsExist(commands);
  if (missing.length > 0) {
    console.error(
      chalk.red(
        `\n❌ Missing commands: ${missing.join(", ")}\n  Run 'csa task-types validate' to check all commands.\n`
      )
    );
    const continueAnyway = await question(
      chalk.yellow("Continue anyway? (y/N): ")
    );
    if (continueAnyway.toLowerCase().trim() !== "y") {
      console.log(chalk.gray("Cancelled."));
      return;
    }
  }

  types[name] = commands;
  await saveFn(types);

  const location = isGlobal ? "global" : "project";
  console.log(
    chalk.green(
      `\n✅ Task type "${name}" added to ${location} configuration\n`
    )
  );
}

// Remove a task type
export async function removeTaskType(
  name: string,
  isGlobal: boolean = false
): Promise<void> {
  const types = isGlobal
    ? await loadGlobalTaskTypes()
    : await loadProjectTaskTypes();
  const saveFn = isGlobal ? saveGlobalTaskTypes : saveProjectTaskTypes;

  if (!(name in types)) {
    const location = isGlobal ? "global" : "project";
    console.error(
      chalk.red(`\n❌ Task type "${name}" not found in ${location} configuration\n`)
    );
    process.exit(1);
  }

  const confirm = await question(
    chalk.yellow(
      `Remove task type "${name}"? This cannot be undone. (y/N): `
    )
  );
  if (confirm.toLowerCase().trim() !== "y") {
    console.log(chalk.gray("Cancelled."));
    return;
  }

  delete types[name];
  await saveFn(types);

  const location = isGlobal ? "global" : "project";
  console.log(
    chalk.green(
      `\n✅ Task type "${name}" removed from ${location} configuration\n`
    )
  );
}

// Edit a task type
export async function editTaskType(
  name: string,
  isGlobal: boolean = false
): Promise<void> {
  const types = isGlobal
    ? await loadGlobalTaskTypes()
    : await loadProjectTaskTypes();
  const saveFn = isGlobal ? saveGlobalTaskTypes : saveProjectTaskTypes;

  if (!(name in types)) {
    const location = isGlobal ? "global" : "project";
    console.error(
      chalk.red(`\n❌ Task type "${name}" not found in ${location} configuration\n`)
    );
    process.exit(1);
  }

  const currentCommands = types[name];
  console.log(chalk.blue(`\n📝 Editing task type: ${chalk.bold(name)}\n`));
  console.log(chalk.gray("Current commands:"));
  currentCommands.forEach((cmd, index) => {
    console.log(chalk.gray(`  ${index + 1}. ${chalk.bold(cmd)}`));
  });
  console.log();

  console.log(
    chalk.gray(
      "Enter new commands one by one (press Enter with empty line to finish):\n"
    )
  );

  const commands: string[] = [];
  let index = 1;

  while (true) {
    const command = await question(
      chalk.yellow(`  Command ${index} (or press Enter to finish): `)
    );
    const trimmed = command.trim();
    if (trimmed === "") {
      break;
    }
    commands.push(trimmed);
    index++;
  }

  if (commands.length === 0) {
    console.error(chalk.red("\n❌ No commands provided. Cancelled.\n"));
    return;
  }

  // Validate commands exist
  const missing = await validateCommandsExist(commands);
  if (missing.length > 0) {
    console.error(
      chalk.red(
        `\n❌ Missing commands: ${missing.join(", ")}\n  Run 'csa task-types validate' to check all commands.\n`
      )
    );
    const continueAnyway = await question(
      chalk.yellow("Continue anyway? (y/N): ")
    );
    if (continueAnyway.toLowerCase().trim() !== "y") {
      console.log(chalk.gray("Cancelled."));
      return;
    }
  }

  types[name] = commands;
  await saveFn(types);

  const location = isGlobal ? "global" : "project";
  console.log(
    chalk.green(
      `\n✅ Task type "${name}" updated in ${location} configuration\n`
    )
  );
}

// Interactive mode
export async function interactiveTaskTypes(): Promise<void> {
  await ensureGlobalTaskTypesFile();
  await ensureProjectTaskTypesDir();

  while (true) {
    console.log(chalk.blue("\n📋 Task Types Manager\n"));
    console.log(chalk.gray(" 1. List all task types"));
    console.log(chalk.gray(" 2. Show task type details"));
    console.log(chalk.gray(" 3. Add task type"));
    console.log(chalk.gray(" 4. Edit task type"));
    console.log(chalk.gray(" 5. Remove task type"));
    console.log(chalk.gray(" 6. Validate task types"));
    console.log(chalk.gray(" 7. Exit\n"));

    const choice = await question(chalk.yellow("Select option (1-7): "));
    const choiceNum = parseInt(choice.trim(), 10);

    if (choiceNum === 1) {
      await listTaskTypes();
    } else if (choiceNum === 2) {
      const name = await question(chalk.yellow("Task type name: "));
      await showTaskType(name.trim());
    } else if (choiceNum === 3) {
      const name = await question(chalk.yellow("Task type name: "));
      const location = await question(
        chalk.yellow("Location (g)lobal or (p)roject? [p]: ")
      );
      const isGlobal = location.toLowerCase().trim() === "g";
      await addTaskType(name.trim(), undefined, isGlobal);
    } else if (choiceNum === 4) {
      const name = await question(chalk.yellow("Task type name: "));
      const location = await question(
        chalk.yellow("Location (g)lobal or (p)roject? [p]: ")
      );
      const isGlobal = location.toLowerCase().trim() === "g";
      await editTaskType(name.trim(), isGlobal);
    } else if (choiceNum === 5) {
      const name = await question(chalk.yellow("Task type name: "));
      const location = await question(
        chalk.yellow("Location (g)lobal or (p)roject? [p]: ")
      );
      const isGlobal = location.toLowerCase().trim() === "g";
      await removeTaskType(name.trim(), isGlobal);
    } else if (choiceNum === 6) {
      await validateTaskTypes();
    } else if (choiceNum === 7) {
      console.log(chalk.gray("\nGoodbye!\n"));
      break;
    } else {
      console.error(chalk.red("\n❌ Invalid option\n"));
    }
  }
}

