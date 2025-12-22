import { spawnSync } from "child_process";
import type { DelayedCommand, PlatformAdapter } from "../platform-adapter.js";

/**
 * Tool name constants for cross-platform compatibility
 */
export const TOOLS = {
  // macOS
  OSASCRIPT: "osascript",
  OPEN: "open",
  // Linux - URL openers
  XDG_OPEN: "xdg-open",
  GIO: "gio",
  GNOME_OPEN: "gnome-open",
  KDE_OPEN: "kde-open",
  EXO_OPEN: "exo-open",
  // Linux - Keyboard automation (X11)
  XDOTOOL: "xdotool",
  YDOTOOL: "ydotool",
  // Linux - Keyboard automation (Wayland)
  WTYPE: "wtype",
  KDOTOOL: "kdotool",
  // Windows
  POWERSHELL: "powershell",
  CMD: "cmd",
} as const;

/**
 * Linux URL opener tools in priority order
 */
export const LINUX_URL_OPENERS = [
  TOOLS.XDG_OPEN,
  TOOLS.GIO,
  TOOLS.GNOME_OPEN,
  TOOLS.KDE_OPEN,
  TOOLS.EXO_OPEN,
] as const;

/**
 * Linux X11 keyboard automation tools in priority order
 */
export const LINUX_X11_KEYBOARD_TOOLS = [TOOLS.XDOTOOL, TOOLS.YDOTOOL] as const;

/**
 * Linux Wayland keyboard automation tools in priority order
 */
export const LINUX_WAYLAND_KEYBOARD_TOOLS = [
  TOOLS.WTYPE,
  TOOLS.YDOTOOL,
] as const;

/**
 * Abstract base class for platform adapters with common functionality.
 *
 * Provides shared utilities for tool detection, text escaping, and command execution.
 * Platform-specific adapters should extend this class and implement the abstract methods.
 */
export abstract class BaseAdapter implements PlatformAdapter {
  abstract openUrl(url: string): Promise<void>;
  abstract typeText(text: string): Promise<void>;
  abstract pressEnter(): Promise<void>;
  abstract activateCursor(): Promise<void>;
  abstract getShellCommand(): string;
  abstract checkRequirements(): Promise<{
    available: boolean;
    missing: string[];
    details: Array<{
      tool: string;
      available: boolean;
      installation?: string;
    }>;
  }>;
  abstract buildDelayedOpenUrlCommand(
    url: string,
    delaySeconds: number
  ): DelayedCommand;
  abstract buildDelayedEnterCommand(delaySeconds: number): DelayedCommand;
  abstract buildDelayedTypeTextCommand(
    text: string,
    delaySeconds: number
  ): DelayedCommand;

  /**
   * Check if a tool is available in PATH (async version)
   */
  protected async checkToolAvailable(tool: string): Promise<boolean> {
    return this.checkToolAvailableSync(tool);
  }

  /**
   * Check if a tool is available in PATH (synchronous version)
   * Useful for delayed command building where async operations aren't possible
   */
  protected checkToolAvailableSync(tool: string): boolean {
    const whichCmd = process.platform === "win32" ? "where" : "which";
    const result = spawnSync(whichCmd, [tool], { stdio: "ignore" });
    return result.status === 0;
  }

  /**
   * Get the user's shell command
   */
  protected getDefaultShell(): string {
    if (process.env.SHELL) {
      return process.env.SHELL;
    }
    // Fallback to common shells
    if (process.platform === "win32") {
      return "cmd.exe";
    }
    return "/bin/bash";
  }

  /**
   * Execute a command and return the result with improved type safety
   * @param command - The command to execute
   * @param args - Command arguments
   * @param options - Optional input and encoding
   * @returns Discriminated union: { success: true, stdout?, stderr? } | { success: false, stderr: string, stdout? }
   * @throws Never throws - always returns a result object
   */
  protected async executeCommand(
    command: string,
    args: string[],
    options?: { input?: string; encoding?: BufferEncoding }
  ): Promise<
    | { success: true; stdout?: string; stderr?: string }
    | { success: false; stderr: string; stdout?: string }
  > {
    const { spawnSync } = await import("child_process");
    const result = spawnSync(command, args, {
      stdio: options?.input ? ["pipe", "pipe", "pipe"] : "pipe",
      input: options?.input,
      encoding: options?.encoding || "utf8",
    });

    const stderr = result.stderr?.toString();
    const stdout = result.stdout?.toString();

    if (result.status === 0) {
      return { success: true, stdout, stderr };
    } else {
      return {
        success: false,
        stderr: stderr || `Command failed with exit code ${result.status}`,
        stdout,
      };
    }
  }

  /**
   * Escape text for PowerShell (Windows)
   */
  protected escapeTextForPowerShell(text: string): string {
    return text
      .replace(/`/g, "``") // Escape backticks
      .replace(/\$/g, "`$") // Escape dollar signs
      .replace(/"/g, '`"') // Escape double quotes
      .replace(/'/g, "''"); // Escape single quotes
  }

  /**
   * Escape text for AppleScript (macOS)
   */
  protected escapeTextForAppleScript(text: string): string {
    return text
      .replace(/\\/g, "\\\\") // Escape backslashes first
      .replace(/"/g, '\\"') // Escape double quotes
      .replace(/\$/g, "\\$") // Escape dollar signs
      .replace(/\n/g, "\\n") // Handle newlines
      .replace(/\r/g, "\\r") // Handle carriage returns
      .replace(/\t/g, "\\t"); // Handle tabs
  }

  /**
   * Escape text for shell commands (Linux/macOS)
   */
  protected escapeTextForShell(text: string): string {
    return text.replace(/"/g, '\\"').replace(/\$/g, "\\$");
  }

  /**
   * Build sleep command for delayed execution
   */
  protected buildSleepCommand(seconds: number): string {
    if (process.platform === "win32") {
      return `powershell -Command "Start-Sleep -Seconds ${seconds}"`;
    } else {
      return `sleep ${seconds}`;
    }
  }

  /**
   * Escape URL for shell commands (consistent escaping across platforms)
   */
  protected escapeUrlForShell(url: string): string {
    return url.replace(/"/g, '\\"');
  }

  /**
   * Build a delayed command with sleep + command execution pattern
   * This is a common pattern used across all platforms for delayed operations
   * Windows uses `;` as separator, Unix uses `&&`
   */
  protected buildDelayedCommand(
    delaySeconds: number,
    command: string
  ): DelayedCommand {
    const shell = this.getShellCommand();
    const sleepCmd = this.buildSleepCommand(delaySeconds);
    const separator = process.platform === "win32" ? ";" : "&&";
    const script = `${sleepCmd}${separator} ${command}`;

    if (process.platform === "win32") {
      // Windows uses cmd.exe with /c flag
      return { shell: "cmd.exe", args: ["/c", script] };
    } else {
      // Unix shells use -c flag
      return { shell, args: ["-c", script] };
    }
  }

  /**
   * Create a requirement detail entry
   */
  protected createRequirementDetail(
    tool: string,
    available: boolean,
    installation?: string
  ): {
    tool: string;
    available: boolean;
    installation?: string;
  } {
    return {
      tool,
      available,
      installation: available ? undefined : installation,
    };
  }

  /**
   * Build requirement check result from details array
   */
  protected buildRequirementResult(
    details: Array<{
      tool: string;
      available: boolean;
      installation?: string;
    }>
  ): {
    available: boolean;
    missing: string[];
    details: Array<{
      tool: string;
      available: boolean;
      installation?: string;
    }>;
  } {
    const missing = details.filter((d) => !d.available).map((d) => d.tool);
    return {
      available: missing.length === 0,
      missing,
      details,
    };
  }

  /**
   * Check shell availability and create requirement detail
   */
  protected async checkShellRequirement(shellCommand: string): Promise<{
    tool: string;
    available: boolean;
    installation?: string;
  }> {
    const shellName =
      process.platform === "win32"
        ? shellCommand.split("\\").pop()?.split(".")[0] || "cmd"
        : shellCommand.split("/").pop() || "bash";
    const available = await this.checkToolAvailable(shellName);
    return this.createRequirementDetail(
      `Shell (${shellCommand})`,
      available,
      "Shell should be available by default on this system."
    );
  }

  /**
   * Format error message with platform context
   */
  protected formatError(
    operation: string,
    tool: string,
    error: string
  ): string {
    const platform =
      process.platform === "darwin"
        ? "macOS"
        : process.platform === "linux"
        ? "Linux"
        : process.platform === "win32"
        ? "Windows"
        : "unknown platform";
    return `Failed to ${operation} on ${platform} using ${tool}: ${error}`;
  }

  /**
   * Format warning message with platform context
   */
  protected formatWarning(message: string): string {
    const platform =
      process.platform === "darwin"
        ? "macOS"
        : process.platform === "linux"
        ? "Linux"
        : process.platform === "win32"
        ? "Windows"
        : "unknown platform";
    return `Warning: ${message} on ${platform}`;
  }
}
