import { promises as fs } from "fs";
import path from "path";
import { GLOBAL_COMMANDS_DIR, PROJECT_COMMANDS_DIR } from "./constants.js";

// Get all available commands with their preview (first line)
export async function getAllAvailableCommands(): Promise<
  Array<{ name: string; preview: string; location: "global" | "project" }>
> {
  const commands: Array<{
    name: string;
    preview: string;
    location: "global" | "project";
  }> = [];

  // Get global commands
  try {
    const globalFiles = await fs.readdir(GLOBAL_COMMANDS_DIR);
    for (const file of globalFiles) {
      if (file.endsWith(".md")) {
        const commandName = file.replace(".md", "");
        const filePath = path.join(GLOBAL_COMMANDS_DIR, file);
        try {
          const content = await fs.readFile(filePath, "utf-8");
          const firstLine = content.split("\n")[0] || "";
          // Remove # if it's a markdown header
          const preview = firstLine.replace(/^#+\s*/, "").trim() || commandName;
          commands.push({ name: commandName, preview, location: "global" });
        } catch {
          // If we can't read the file, just add the name
          commands.push({
            name: commandName,
            preview: commandName,
            location: "global",
          });
        }
      }
    }
  } catch {
    // Global directory doesn't exist, that's fine
  }

  // Get project commands (avoid duplicates)
  try {
    const projectFiles = await fs.readdir(PROJECT_COMMANDS_DIR);
    for (const file of projectFiles) {
      if (file.endsWith(".md")) {
        const commandName = file.replace(".md", "");
        // Skip if already in global
        if (commands.some((c) => c.name === commandName)) {
          continue;
        }
        const filePath = path.join(PROJECT_COMMANDS_DIR, file);
        try {
          const content = await fs.readFile(filePath, "utf-8");
          const firstLine = content.split("\n")[0] || "";
          const preview = firstLine.replace(/^#+\s*/, "").trim() || commandName;
          commands.push({ name: commandName, preview, location: "project" });
        } catch {
          commands.push({
            name: commandName,
            preview: commandName,
            location: "project",
          });
        }
      }
    }
  } catch {
    // Project directory doesn't exist, that's fine
  }

  // Sort by name
  commands.sort((a, b) => a.name.localeCompare(b.name));

  return commands;
}

async function commandExists(command: string): Promise<boolean> {
  const globalCommandFile = path.join(GLOBAL_COMMANDS_DIR, `${command}.md`);
  const projectCommandFile = path.join(PROJECT_COMMANDS_DIR, `${command}.md`);

  try {
    // Check global first
    await fs.access(globalCommandFile);
    return true;
  } catch {
    // Check project
    try {
      await fs.access(projectCommandFile);
      return true;
    } catch {
      return false;
    }
  }
}

// Check where a command is defined: "global", "project", or null if missing
export async function getCommandLocation(
  command: string
): Promise<"global" | "project" | null> {
  const globalCommandFile = path.join(GLOBAL_COMMANDS_DIR, `${command}.md`);
  const projectCommandFile = path.join(PROJECT_COMMANDS_DIR, `${command}.md`);

  try {
    await fs.access(globalCommandFile);
    return "global";
  } catch {
    try {
      await fs.access(projectCommandFile);
      return "project";
    } catch {
      return null;
    }
  }
}

export async function validateCommandsExist(
  commands: string[]
): Promise<string[]> {
  const missing: string[] = [];
  for (const command of commands) {
    if (!(await commandExists(command))) {
      missing.push(command);
    }
  }
  return missing;
}
