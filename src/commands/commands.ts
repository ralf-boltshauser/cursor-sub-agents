import chalk from "chalk";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import readline from "readline";
import {
  loadTaskTypes,
  validateCommandsExist,
  ensureGlobalTaskTypesFile,
} from "../utils.js";

const GLOBAL_COMMANDS_DIR = path.join(os.homedir(), ".cursor", "commands");

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

export async function listCommands(): Promise<void> {
  try {
    // Ensure directory exists
    try {
      await fs.mkdir(GLOBAL_COMMANDS_DIR, { recursive: true });
    } catch {
      // Directory might already exist, ignore
    }

    // Output the cd command for the user to execute
    console.log(chalk.blue(`\n📂 Change to commands directory:\n`));
    console.log(chalk.yellow(`cd ${GLOBAL_COMMANDS_DIR}\n`));

    // Check for missing commands
    await ensureGlobalTaskTypesFile();
    const taskTypes = await loadTaskTypes();

    // Get all unique commands from all task types
    const allCommands = new Set<string>();
    Object.values(taskTypes).forEach((commands) => {
      commands.forEach((cmd) => allCommands.add(cmd));
    });

    if (allCommands.size === 0) {
      console.log(chalk.gray("💡 No task types defined yet.\n"));
      return;
    }

    // Check which commands are missing
    const missingCommands = await validateCommandsExist(Array.from(allCommands));

    if (missingCommands.length > 0) {
      console.log(
        chalk.yellow(
          `\n⚠️  Found ${missingCommands.length} missing command(s):\n`
        )
      );
      missingCommands.forEach((cmd) => {
        console.log(chalk.gray(`  • ${cmd}`));
      });

      const answer = await question(
        chalk.yellow(
          `\nCreate empty .md files for all missing commands? (y/N): `
        )
      );

      if (answer.toLowerCase().trim() === "y") {
        console.log(chalk.blue("\n📝 Creating command files...\n"));

        for (const command of missingCommands) {
          const commandFile = path.join(GLOBAL_COMMANDS_DIR, `${command}.md`);
          const content = `# ${command}\n\nAdd your command instructions here.\n`;
          await fs.writeFile(commandFile, content, "utf-8");
          console.log(chalk.green(`  ✅ Created: ${command}.md`));
        }

        console.log(
          chalk.green(
            `\n✅ Created ${missingCommands.length} command file(s)!\n`
          )
        );
      } else {
        console.log(chalk.gray("\nSkipped creating command files.\n"));
      }
    } else {
      console.log(
        chalk.green(
          `\n✅ All ${allCommands.size} command(s) from task-types.json exist!\n`
        )
      );
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

