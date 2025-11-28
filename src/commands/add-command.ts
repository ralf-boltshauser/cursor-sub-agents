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

function readMultiLine(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const lines: string[] = [];

  return new Promise((resolve) => {
    console.log(
      chalk.gray(
        "(Enter content line by line. Press Ctrl+D (Mac/Linux) or Ctrl+Z (Windows) when done, or type 'END' on a new line to finish)"
      )
    );

    rl.on("line", (line) => {
      if (line.trim() === "END") {
        rl.close();
        resolve(lines.join("\n"));
      } else {
        lines.push(line);
      }
    });

    rl.on("close", () => {
      resolve(lines.join("\n"));
    });
  });
}

function sanitizeFileName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
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

export async function addCommand(templateName?: string): Promise<void> {
  try {
    // If template name provided, install template
    if (templateName) {
      const location = await question(
        chalk.yellow("Install location (g)lobal or (p)roject? [p]: ")
      );
      const isGlobal = location.toLowerCase().trim() === "g";
      await installTemplate(templateName, isGlobal);
      return;
    }

    // Check if user wants to install a template
    const templates = await listTemplates();
    if (templates.length > 0) {
      console.log(chalk.blue("\n📝 Create a new Cursor command\n"));
      const useTemplate = await question(
        chalk.yellow(
          `Install template or create new? (t)emplate or (n)ew? [n]: `
        )
      );

      if (useTemplate.toLowerCase().trim() === "t") {
        console.log(chalk.gray("\nAvailable templates:"));
        templates.forEach((t) => console.log(chalk.gray(`  - ${t}`)));
        const selectedTemplate = await question(
          chalk.yellow("\nTemplate name: ")
        );
        if (templates.includes(selectedTemplate.trim())) {
          const location = await question(
            chalk.yellow("Install location (g)lobal or (p)roject? [p]: ")
          );
          const isGlobal = location.toLowerCase().trim() === "g";
          await installTemplate(selectedTemplate.trim(), isGlobal);
          return;
        } else {
          console.error(
            chalk.red(`Error: Template "${selectedTemplate}" not found`)
          );
          process.exit(1);
        }
      }
    }

    // Create new command from scratch
    console.log(chalk.blue("\n📝 Create a new Cursor command\n"));

    // Get command name
    const commandName = await question(chalk.yellow("Command name: "));
    if (!commandName.trim()) {
      console.error(chalk.red("Error: Command name cannot be empty"));
      process.exit(1);
    }

    const fileName = sanitizeFileName(commandName);
    if (!fileName) {
      console.error(chalk.red("Error: Invalid command name"));
      process.exit(1);
    }

    // Get command description
    const description = await question(chalk.yellow("Description: "));

    // Get command content
    console.log(chalk.yellow("\nCommand content (Markdown):"));
    const content = await readMultiLine();

    // Ask for global or project
    const location = await question(
      chalk.yellow("Install location (g)lobal or (p)roject? [p]: ")
    );
    const isGlobal = location.toLowerCase().trim() === "g";

    const commandsDir = isGlobal ? GLOBAL_COMMANDS_DIR : PROJECT_COMMANDS_DIR;
    const commandFile = path.join(commandsDir, `${fileName}.md`);

    // Check if file already exists
    try {
      await fs.access(commandFile);
      console.error(
        chalk.red(
          `Error: Command "${fileName}" already exists at ${commandFile}`
        )
      );
      process.exit(1);
    } catch {
      // File doesn't exist, continue
    }

    // Create directory if it doesn't exist
    await fs.mkdir(commandsDir, { recursive: true });

    // Create markdown content
    const markdownContent = `# ${commandName}

${description ? `${description}\n` : ""}${content ? `\n${content}` : ""}
`;

    // Write file
    await fs.writeFile(commandFile, markdownContent, "utf-8");

    console.log(
      chalk.green(
        `\n✅ Command "${commandName}" created successfully at:\n   ${commandFile}`
      )
    );
    console.log(
      chalk.gray(
        `\n💡 Use "/${commandName}" in Cursor chat to trigger this command.`
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
