import chalk from "chalk";
import readline from "readline";
import {
  deleteConfig,
  getActiveConfig,
  getDefaultPromptsArray,
  getGlobalConfigPath,
  getLocalConfigPath,
  loadConfig,
  saveConfig,
  type ConfigFile,
} from "../utils.js";

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

async function displayCurrentConfig(): Promise<void> {
  const active = await getActiveConfig();
  const prompts = active.config?.followUpPrompts || [];

  console.log(chalk.blue("\n📋 Current Active Configuration:"));
  console.log(chalk.gray(`   Source: ${chalk.bold(active.source)}`));
  if (active.path) {
    console.log(chalk.gray(`   Path: ${active.path}`));
  } else {
    console.log(chalk.gray("   Using default prompts"));
  }
  console.log();

  if (prompts.length === 0) {
    console.log(chalk.yellow("   No follow-up prompts configured (using defaults)"));
  } else {
    console.log(chalk.blue(`   Follow-up prompts (${prompts.length}):\n`));
    prompts.forEach((prompt, index) => {
      console.log(
        chalk.gray(`     ${index + 1}. ${chalk.white(prompt.substring(0, 70))}${
          prompt.length > 70 ? "..." : ""
        }`)
      );
    });
  }
  console.log();
}

async function getConfigLocation(): Promise<"local" | "global"> {
  const answer = await question(
    chalk.yellow("Manage (l)ocal or (g)lobal config? [l]: ")
  );
  return answer.toLowerCase().trim() === "g" ? "global" : "local";
}

async function addPromptInteractive(): Promise<void> {
  const isGlobal = (await getConfigLocation()) === "global";
  const configPath = isGlobal
    ? await getGlobalConfigPath()
    : await getLocalConfigPath();

  const prompt = await question(chalk.yellow("Enter the prompt text: "));
  if (!prompt.trim()) {
    console.log(chalk.red("Error: Prompt cannot be empty"));
    return;
  }

  let config = await loadConfig(configPath);
  if (!config) {
    config = { followUpPrompts: [] };
  }

  config.followUpPrompts.push(prompt.trim());
  await saveConfig(configPath, config);

  const location = isGlobal ? "global" : "local";
  console.log(
    chalk.green(`\n✅ Added prompt to ${location} config (${config.followUpPrompts.length} total)\n`)
  );
}

async function removePromptInteractive(): Promise<void> {
  const isGlobal = (await getConfigLocation()) === "global";
  const configPath = isGlobal
    ? await getGlobalConfigPath()
    : await getLocalConfigPath();

  const config = await loadConfig(configPath);
  if (!config || !Array.isArray(config.followUpPrompts) || config.followUpPrompts.length === 0) {
    console.error(chalk.red("Error: No prompts found in config"));
    return;
  }

  console.log(chalk.blue("\nCurrent prompts:"));
  config.followUpPrompts.forEach((prompt, index) => {
    console.log(
      chalk.gray(`  ${index + 1}. ${prompt.substring(0, 60)}${prompt.length > 60 ? "..." : ""}`)
    );
  });
  console.log();

  const indexStr = await question(
    chalk.yellow(`Enter the index to remove (1-${config.followUpPrompts.length}): `)
  );
  const index = parseInt(indexStr.trim(), 10);
  const actualIndex = index - 1;

  if (isNaN(index) || actualIndex < 0 || actualIndex >= config.followUpPrompts.length) {
    console.error(
      chalk.red(
        `Error: Invalid index. Please use a number between 1 and ${config.followUpPrompts.length}`
      )
    );
    return;
  }

  const removed = config.followUpPrompts.splice(actualIndex, 1)[0];
  await saveConfig(configPath, config);

  const location = isGlobal ? "global" : "local";
  console.log(
    chalk.green(
      `\n✅ Removed prompt from ${location} config: ${chalk.gray(removed.substring(0, 60))}${
        removed.length > 60 ? "..." : ""
      }\n`
    )
  );
}

async function reorderPromptInteractive(): Promise<void> {
  const isGlobal = (await getConfigLocation()) === "global";
  const configPath = isGlobal
    ? await getGlobalConfigPath()
    : await getLocalConfigPath();

  const config = await loadConfig(configPath);
  if (!config || !Array.isArray(config.followUpPrompts) || config.followUpPrompts.length === 0) {
    console.error(chalk.red("Error: No prompts found in config"));
    return;
  }

  console.log(chalk.blue("\nCurrent prompts:"));
  config.followUpPrompts.forEach((prompt, index) => {
    console.log(
      chalk.gray(`  ${index + 1}. ${prompt.substring(0, 60)}${prompt.length > 60 ? "..." : ""}`)
    );
  });
  console.log();

  const fromStr = await question(
    chalk.yellow(`Move prompt from position (1-${config.followUpPrompts.length}): `)
  );
  const toStr = await question(
    chalk.yellow(`Move to position (1-${config.followUpPrompts.length}): `)
  );

  const from = parseInt(fromStr.trim(), 10);
  const to = parseInt(toStr.trim(), 10);
  const fromIndex = from - 1;
  const toIndex = to - 1;

  if (
    isNaN(from) ||
    isNaN(to) ||
    fromIndex < 0 ||
    fromIndex >= config.followUpPrompts.length ||
    toIndex < 0 ||
    toIndex >= config.followUpPrompts.length
  ) {
    console.error(
      chalk.red(
        `Error: Invalid indices. Please use numbers between 1 and ${config.followUpPrompts.length}`
      )
    );
    return;
  }

  const [moved] = config.followUpPrompts.splice(fromIndex, 1);
  config.followUpPrompts.splice(toIndex, 0, moved);
  await saveConfig(configPath, config);

  const location = isGlobal ? "global" : "local";
  console.log(
    chalk.green(`\n✅ Moved prompt from position ${from} to ${to} in ${location} config\n`)
  );
}

async function setPromptsInteractive(): Promise<void> {
  const isGlobal = (await getConfigLocation()) === "global";
  const configPath = isGlobal
    ? await getGlobalConfigPath()
    : await getLocalConfigPath();

  console.log(chalk.yellow("\nEnter prompts (one per line, empty line to finish):"));
  const prompts: string[] = [];
  let lineNumber = 1;

  while (true) {
    const prompt = await question(chalk.gray(`  ${lineNumber}. `));
    if (!prompt.trim()) {
      break;
    }
    prompts.push(prompt.trim());
    lineNumber++;
  }

  if (prompts.length === 0) {
    console.log(chalk.red("Error: At least one prompt is required"));
    return;
  }

  const config: ConfigFile = { followUpPrompts: prompts };
  await saveConfig(configPath, config);

  const location = isGlobal ? "global" : "local";
  console.log(
    chalk.green(`\n✅ Set ${prompts.length} prompt(s) in ${location} config\n`)
  );
}

async function copyGlobalToLocalInteractive(): Promise<void> {
  const globalPath = await getGlobalConfigPath();
  const localPath = await getLocalConfigPath();

  const globalConfig = await loadConfig(globalPath);
  if (!globalConfig) {
    console.error(chalk.red("Error: No global config found"));
    return;
  }

  await saveConfig(localPath, globalConfig);
  console.log(chalk.green("\n✅ Copied global config to local config\n"));
}

async function clearConfigInteractive(): Promise<void> {
  const isGlobal = (await getConfigLocation()) === "global";
  const configPath = isGlobal
    ? await getGlobalConfigPath()
    : await getLocalConfigPath();

  const confirm = await question(
    chalk.yellow(`Are you sure you want to clear ${isGlobal ? "global" : "local"} config? (y/N): `)
  );
  if (confirm.toLowerCase().trim() !== "y") {
    console.log(chalk.gray("Cancelled."));
    return;
  }

  const config: ConfigFile = { followUpPrompts: [] };
  await saveConfig(configPath, config);

  const location = isGlobal ? "global" : "local";
  console.log(chalk.green(`\n✅ Cleared ${location} config\n`));
}

async function resetConfigInteractive(): Promise<void> {
  const isGlobal = (await getConfigLocation()) === "global";
  const configPath = isGlobal
    ? await getGlobalConfigPath()
    : await getLocalConfigPath();

  const confirm = await question(
    chalk.yellow(`Are you sure you want to reset ${isGlobal ? "global" : "local"} config to defaults? (y/N): `)
  );
  if (confirm.toLowerCase().trim() !== "y") {
    console.log(chalk.gray("Cancelled."));
    return;
  }

  const defaultPrompts = getDefaultPromptsArray();
  const config: ConfigFile = { followUpPrompts: defaultPrompts };
  await saveConfig(configPath, config);

  const location = isGlobal ? "global" : "local";
  console.log(
    chalk.green(
      `\n✅ Reset ${location} config to defaults (${defaultPrompts.length} prompt(s))\n`
    )
  );
}

async function useGlobalInteractive(): Promise<void> {
  const localPath = await getLocalConfigPath();
  const localConfig = await loadConfig(localPath);

  if (!localConfig) {
    console.log(chalk.yellow("No local config found. Already using global config."));
    return;
  }

  const confirm = await question(
    chalk.yellow("Are you sure you want to delete local config and use global? (y/N): ")
  );
  if (confirm.toLowerCase().trim() !== "y") {
    console.log(chalk.gray("Cancelled."));
    return;
  }

  await deleteConfig(localPath);
  console.log(
    chalk.green("\n✅ Deleted local config. Now using global config (or defaults)\n")
  );
}

export async function showConfig(): Promise<void> {
  await displayCurrentConfig();
}

export async function addPrompt(prompt: string, isGlobal: boolean): Promise<void> {
  const configPath = isGlobal
    ? await getGlobalConfigPath()
    : await getLocalConfigPath();

  let config = await loadConfig(configPath);
  if (!config) {
    config = { followUpPrompts: [] };
  }

  config.followUpPrompts.push(prompt);
  await saveConfig(configPath, config);

  const location = isGlobal ? "global" : "local";
  console.log(
    chalk.green(`\n✅ Added prompt to ${location} config (${config.followUpPrompts.length} total)\n`)
  );
}

export async function removePrompt(index: number, isGlobal: boolean): Promise<void> {
  const configPath = isGlobal
    ? await getGlobalConfigPath()
    : await getLocalConfigPath();

  const config = await loadConfig(configPath);
  if (!config || !Array.isArray(config.followUpPrompts)) {
    console.error(chalk.red("Error: No config found or invalid config"));
    process.exit(1);
  }

  const actualIndex = index - 1; // Convert to 0-based
  if (actualIndex < 0 || actualIndex >= config.followUpPrompts.length) {
    console.error(
      chalk.red(
        `Error: Invalid index. Please use a number between 1 and ${config.followUpPrompts.length}`
      )
    );
    process.exit(1);
  }

  const removed = config.followUpPrompts.splice(actualIndex, 1)[0];
  await saveConfig(configPath, config);

  const location = isGlobal ? "global" : "local";
  console.log(
    chalk.green(
      `\n✅ Removed prompt from ${location} config: ${chalk.gray(removed.substring(0, 60))}${
        removed.length > 60 ? "..." : ""
      }\n`
    )
  );
}

export async function reorderPrompt(from: number, to: number, isGlobal: boolean): Promise<void> {
  const configPath = isGlobal
    ? await getGlobalConfigPath()
    : await getLocalConfigPath();

  const config = await loadConfig(configPath);
  if (!config || !Array.isArray(config.followUpPrompts)) {
    console.error(chalk.red("Error: No config found or invalid config"));
    process.exit(1);
  }

  const fromIndex = from - 1; // Convert to 0-based
  const toIndex = to - 1;

  if (
    fromIndex < 0 ||
    fromIndex >= config.followUpPrompts.length ||
    toIndex < 0 ||
    toIndex >= config.followUpPrompts.length
  ) {
    console.error(
      chalk.red(
        `Error: Invalid indices. Please use numbers between 1 and ${config.followUpPrompts.length}`
      )
    );
    process.exit(1);
  }

  const [moved] = config.followUpPrompts.splice(fromIndex, 1);
  config.followUpPrompts.splice(toIndex, 0, moved);
  await saveConfig(configPath, config);

  const location = isGlobal ? "global" : "local";
  console.log(
    chalk.green(
      `\n✅ Moved prompt from position ${from} to ${to} in ${location} config\n`
    )
  );
}

export async function setPrompts(prompts: string[], isGlobal: boolean): Promise<void> {
  const configPath = isGlobal
    ? await getGlobalConfigPath()
    : await getLocalConfigPath();

  const config: ConfigFile = { followUpPrompts: prompts };
  await saveConfig(configPath, config);

  const location = isGlobal ? "global" : "local";
  console.log(
    chalk.green(
      `\n✅ Set ${prompts.length} prompt(s) in ${location} config\n`
    )
  );
}

export async function copyGlobalToLocal(): Promise<void> {
  const globalPath = await getGlobalConfigPath();
  const localPath = await getLocalConfigPath();

  const globalConfig = await loadConfig(globalPath);
  if (!globalConfig) {
    console.error(chalk.red("Error: No global config found"));
    process.exit(1);
  }

  await saveConfig(localPath, globalConfig);
  console.log(chalk.green("\n✅ Copied global config to local config\n"));
}

export async function clearConfig(isGlobal: boolean): Promise<void> {
  const configPath = isGlobal
    ? await getGlobalConfigPath()
    : await getLocalConfigPath();

  const config: ConfigFile = { followUpPrompts: [] };
  await saveConfig(configPath, config);

  const location = isGlobal ? "global" : "local";
  console.log(chalk.green(`\n✅ Cleared ${location} config\n`));
}

export async function resetConfig(isGlobal: boolean): Promise<void> {
  const configPath = isGlobal
    ? await getGlobalConfigPath()
    : await getLocalConfigPath();

  const defaultPrompts = getDefaultPromptsArray();
  const config: ConfigFile = { followUpPrompts: defaultPrompts };
  await saveConfig(configPath, config);

  const location = isGlobal ? "global" : "local";
  console.log(
    chalk.green(
      `\n✅ Reset ${location} config to defaults (${defaultPrompts.length} prompt(s))\n`
    )
  );
}

export async function useGlobal(): Promise<void> {
  const localPath = await getLocalConfigPath();
  await deleteConfig(localPath);
  console.log(
    chalk.green(
      "\n✅ Deleted local config. Now using global config (or defaults)\n"
    )
  );
}

export async function interactiveConfig(): Promise<void> {
  while (true) {
    await displayCurrentConfig();

    console.log(chalk.blue("Available actions:"));
    console.log(chalk.gray("  1. Add prompt"));
    console.log(chalk.gray("  2. Remove prompt"));
    console.log(chalk.gray("  3. Reorder prompts"));
    console.log(chalk.gray("  4. Set all prompts"));
    console.log(chalk.gray("  5. Copy global to local"));
    console.log(chalk.gray("  6. Clear config"));
    console.log(chalk.gray("  7. Reset config to defaults"));
    console.log(chalk.gray("  8. Use global config"));
    console.log(chalk.gray("  9. Refresh view"));
    console.log(chalk.gray("  10. Exit"));
    console.log();

    const choice = await question(chalk.yellow("Select an action (1-10): "));
    const choiceNum = parseInt(choice.trim(), 10);

    console.log();

    switch (choiceNum) {
      case 1:
        await addPromptInteractive();
        break;
      case 2:
        await removePromptInteractive();
        break;
      case 3:
        await reorderPromptInteractive();
        break;
      case 4:
        await setPromptsInteractive();
        break;
      case 5:
        await copyGlobalToLocalInteractive();
        break;
      case 6:
        await clearConfigInteractive();
        break;
      case 7:
        await resetConfigInteractive();
        break;
      case 8:
        await useGlobalInteractive();
        break;
      case 9:
        // Just refresh by continuing the loop
        break;
      case 10:
        console.log(chalk.gray("Exiting..."));
        return;
      default:
        console.log(chalk.red("Invalid choice. Please select 1-10."));
    }
  }
}
