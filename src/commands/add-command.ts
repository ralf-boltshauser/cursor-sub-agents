import chalk from "chalk";
import { promises as fs } from "fs";
import os from "os";
import path, { dirname } from "path";
import readline from "readline";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const GLOBAL_COMMANDS_DIR = path.join(os.homedir(), ".cursor", "commands");
const PROJECT_COMMANDS_DIR = path.join(process.cwd(), ".cursor", "commands");

// Resolve templates directory
// When installed: node_modules/cursor-sub-agents/dist/commands/add-command.js
// Templates are at: node_modules/cursor-sub-agents/templates/
// So: dist/commands -> dist/ -> package root -> templates/
const TEMPLATES_DIR = path.join(__dirname, "..", "..", "templates");

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

async function listTemplates(): Promise<string[]> {
  try {
    const files = await fs.readdir(TEMPLATES_DIR);
    return files
      .filter((file) => file.endsWith(".md"))
      .map((file) => file.replace(".md", ""));
  } catch {
    return [];
  }
}

async function installTemplate(
  templateName: string,
  isGlobal: boolean
): Promise<void> {
  const templateFile = path.join(TEMPLATES_DIR, `${templateName}.md`);

  try {
    await fs.access(templateFile);
  } catch {
    console.error(chalk.red(`Error: Template "${templateName}" not found`));
    process.exit(1);
  }

  const commandsDir = isGlobal ? GLOBAL_COMMANDS_DIR : PROJECT_COMMANDS_DIR;
  const commandFile = path.join(commandsDir, `${templateName}.md`);

  // Check if file already exists
  try {
    await fs.access(commandFile);
    const overwrite = await question(
      chalk.yellow(
        `Command "${templateName}" already exists. Overwrite? (y/N): `
      )
    );
    if (overwrite.toLowerCase().trim() !== "y") {
      console.log(chalk.gray("Cancelled."));
      return;
    }
  } catch {
    // File doesn't exist, continue
  }

  // Create directory if it doesn't exist
  await fs.mkdir(commandsDir, { recursive: true });

  // Read template and write to destination
  const templateContent = await fs.readFile(templateFile, "utf-8");
  await fs.writeFile(commandFile, templateContent, "utf-8");

  console.log(
    chalk.green(
      `\n✅ Template "${templateName}" installed successfully at:\n   ${commandFile}`
    )
  );
  console.log(
    chalk.gray(
      `\n💡 Use "/${templateName}" in Cursor chat to trigger this command.`
    )
  );
}

export async function addCommand(): Promise<void> {
  try {
    const templates = await listTemplates();

    if (templates.length === 0) {
      console.error(chalk.red("Error: No templates found"));
      process.exit(1);
    }

    console.log(chalk.blue("\n📝 Install a Cursor command template\n"));
    console.log(chalk.gray("Available templates:\n"));

    templates.forEach((template, index) => {
      console.log(chalk.yellow(`  ${index + 1}. ${template}`));
    });

    const selection = await question(
      chalk.yellow(`\nSelect template (1-${templates.length}): `)
    );

    const selectedIndex = parseInt(selection.trim(), 10) - 1;

    if (
      isNaN(selectedIndex) ||
      selectedIndex < 0 ||
      selectedIndex >= templates.length
    ) {
      console.error(
        chalk.red(
          `Error: Invalid selection. Please choose a number between 1 and ${templates.length}`
        )
      );
      process.exit(1);
    }

    const selectedTemplate = templates[selectedIndex];

    const location = await question(
      chalk.yellow("Install location (g)lobal or (p)roject? [p]: ")
    );
    const isGlobal = location.toLowerCase().trim() === "g";

    await installTemplate(selectedTemplate, isGlobal);
  } catch (error) {
    console.error(
      chalk.red(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      )
    );
    process.exit(1);
  }
}
