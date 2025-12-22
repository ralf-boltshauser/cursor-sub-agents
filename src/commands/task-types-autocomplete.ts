import chalk from "chalk";
import readline from "readline";
import { getAllAvailableCommands } from "../utils.js";

interface CommandInfo {
  name: string;
  preview: string;
  location: "global" | "project";
}

function displayMatches(
  matches: CommandInfo[],
  searchTerm: string,
  maxDisplay: number = 10
): void {
  if (matches.length === 0) {
    process.stdout.write(chalk.red(`\n  No matches found for "${searchTerm}"\n`));
    return;
  }

  process.stdout.write(chalk.gray(`\n  Matches (${matches.length}):\n`));
  matches.slice(0, maxDisplay).forEach((cmd, idx) => {
    const highlight = cmd.name.toLowerCase().includes(searchTerm.toLowerCase())
      ? chalk.yellow(cmd.name)
      : cmd.name;
    process.stdout.write(
      chalk.gray(
        `  ${idx + 1}. ${highlight} ${chalk.dim(`[${cmd.location}]`)} - ${cmd.preview.substring(0, 50)}\n`
      )
    );
  });
  if (matches.length > maxDisplay) {
    process.stdout.write(
      chalk.gray(`  ... and ${matches.length - maxDisplay} more\n`)
    );
  }
}

export async function promptCommandWithAutocomplete(
  availableCommands: CommandInfo[],
  index: number
): Promise<string | null> {
  return new Promise((resolve) => {
    let currentInput = "";
    let matches: CommandInfo[] = [];
    let selectedIndex = 0;

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      completer: (line: string) => {
        const searchTerm = line.toLowerCase();
        matches = availableCommands.filter(
          (cmd) =>
            cmd.name.toLowerCase().includes(searchTerm) ||
            cmd.preview.toLowerCase().includes(searchTerm)
        );
        return [matches.map((cmd) => cmd.name), line];
      },
    });

    // Show initial hint
    console.log(
      chalk.gray(
        `\n💡 Type to search commands, press Tab to autocomplete, or Enter to finish`
      )
    );

    // Set up raw mode for better control (if available)
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    const prompt = () => {
      process.stdout.write(
        chalk.yellow(`\n  Command ${index} (or press Enter to finish): `)
      );
    };

    prompt();

    let buffer = "";

    process.stdin.on("data", (data: Buffer) => {
      const char = data.toString();

      // Handle Enter
      if (char === "\r" || char === "\n") {
        process.stdout.write("\n");
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        rl.close();

        const trimmed = buffer.trim();
        if (trimmed === "") {
          resolve(null);
          return;
        }

        // Check if it's an exact match
        const exactMatch = availableCommands.find(
          (cmd) => cmd.name === trimmed
        );
        if (exactMatch) {
          resolve(trimmed);
          return;
        }

        // Check if it's a number (select from matches)
        const num = parseInt(trimmed, 10);
        if (!isNaN(num) && num > 0 && num <= matches.length) {
          resolve(matches[num - 1].name);
          return;
        }

        // Allow non-existent commands - they'll be created later
        // Just confirm with the user
        console.log(
          chalk.yellow(
            `\n  ⚠️  Command "${trimmed}" doesn't exist yet. It will be created after you finish.`
          )
        );
        resolve(trimmed);
        return;
      }

      // Handle backspace
      if (char === "\b" || char === "\x7f") {
        if (buffer.length > 0) {
          buffer = buffer.slice(0, -1);
          process.stdout.write("\b \b");
          currentInput = buffer;
          matches = availableCommands.filter(
            (cmd) =>
              cmd.name.toLowerCase().includes(currentInput.toLowerCase()) ||
              cmd.preview.toLowerCase().includes(currentInput.toLowerCase())
          );
          // Clear previous matches display and show new ones
          process.stdout.write("\n");
          displayMatches(matches, currentInput);
          prompt();
          process.stdout.write(buffer);
        }
        return;
      }

      // Handle other characters
      if (char.charCodeAt(0) >= 32) {
        buffer += char;
        process.stdout.write(char);
        currentInput = buffer;
        matches = availableCommands.filter(
          (cmd) =>
            cmd.name.toLowerCase().includes(currentInput.toLowerCase()) ||
            cmd.preview.toLowerCase().includes(currentInput.toLowerCase())
        );
        // Clear and redraw matches
        process.stdout.write("\n");
        displayMatches(matches, currentInput);
        prompt();
        process.stdout.write(buffer);
      }
    });
  });
}
