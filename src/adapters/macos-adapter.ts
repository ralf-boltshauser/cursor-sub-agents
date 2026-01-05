import { spawnSync } from "child_process";
import type { DelayedCommand } from "../platform-adapter.js";
import { BaseAdapter, TOOLS } from "./base-adapter.js";

/**
 * AppleScript command templates
 */
const APPLESCRIPT = {
  KEYSTROKE: (text: string) =>
    `tell application "System Events" to keystroke "${text}"`,
  KEYSTROKE_RETURN: `tell application "System Events" to keystroke return`,
  ACTIVATE_CURSOR: `tell application "Cursor" to activate`,
} as const;

/**
 * macOS platform adapter using osascript and open
 *
 * Handles URL opening, keyboard automation, and window activation on macOS
 * using native AppleScript and open command.
 */
export class MacOSAdapter extends BaseAdapter {
  private shellCommand: string;

  constructor() {
    super();
    // Detect shell dynamically
    this.shellCommand = this.getDefaultShell();
    // Try common zsh locations if SHELL is not set
    if (!process.env.SHELL) {
      const zshLocations = ["/opt/homebrew/bin/zsh", "/bin/zsh"];
      for (const zsh of zshLocations) {
        const result = spawnSync("test", ["-x", zsh], { stdio: "ignore" });
        if (result.status === 0) {
          this.shellCommand = zsh;
          break;
        }
      }
    }
  }

  /**
   * Open URL in default browser
   * @param url - URL to open
   * @throws {Error} If open command fails
   */
  async openUrl(url: string): Promise<void> {
    const { spawn } = await import("child_process");
    return new Promise((resolve, reject) => {
      const process = spawn(TOOLS.OPEN, [url], {
        detached: true,
        stdio: "ignore",
      });
      process.unref();
      process.on("error", reject);
      process.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              this.formatError(
                "open URL",
                TOOLS.OPEN,
                `command exited with code ${code}`
              )
            )
          );
        }
      });
    });
  }

  /**
   * Type text into the active window
   * @param text - Text to type
   * @throws {Error} If osascript command fails
   */
  async typeText(text: string): Promise<void> {
    // Always activate Cursor first to ensure keystrokes go to the right window
    try {
      await this.activateCursor();
      // Small delay to ensure window is focused
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      // Non-fatal - continue anyway
    }

    const escapedText = this.escapeTextForAppleScript(text);
    const applescript = APPLESCRIPT.KEYSTROKE(escapedText);

    const result = await this.executeCommand(TOOLS.OSASCRIPT, ["-"], {
      input: applescript,
      encoding: "utf8",
    });

    if (!result.success) {
      throw new Error(
        this.formatError(
          "type text",
          TOOLS.OSASCRIPT,
          result.stderr || "Unknown error"
        )
      );
    }
  }

  /**
   * Press Enter key
   * @throws {Error} If osascript command fails
   */
  async pressEnter(): Promise<void> {
    // Always activate Cursor first to ensure keystrokes go to the right window
    try {
      await this.activateCursor();
      // Small delay to ensure window is focused
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      // Non-fatal - continue anyway
    }

    const result = await this.executeCommand(TOOLS.OSASCRIPT, ["-"], {
      input: APPLESCRIPT.KEYSTROKE_RETURN,
      encoding: "utf8",
    });

    if (!result.success) {
      throw new Error(
        this.formatError(
          "press Enter",
          TOOLS.OSASCRIPT,
          result.stderr || "Unknown error"
        )
      );
    }
  }

  /**
   * Activate/focus Cursor application window
   * Non-fatal: continues even if activation fails
   */
  async activateCursor(): Promise<void> {
    const result = await this.executeCommand(TOOLS.OSASCRIPT, ["-"], {
      input: APPLESCRIPT.ACTIVATE_CURSOR,
      encoding: "utf8",
    });

    // Non-fatal - continue anyway if activation fails
    if (!result.success) {
      console.warn(this.formatWarning("Could not activate Cursor window"));
    }
  }

  getShellCommand(): string {
    return this.shellCommand;
  }

  async checkRequirements(): Promise<{
    available: boolean;
    missing: string[];
    details: Array<{
      tool: string;
      available: boolean;
      installation?: string;
    }>;
  }> {
    const details: Array<{
      tool: string;
      available: boolean;
      installation?: string;
    }> = [];

    // Check osascript
    const osascriptAvailable = await this.checkToolAvailable(TOOLS.OSASCRIPT);
    details.push(
      this.createRequirementDetail(
        TOOLS.OSASCRIPT,
        osascriptAvailable,
        "osascript is part of macOS and should be available by default. If missing, this may indicate a system issue."
      )
    );

    // Check open
    const openAvailable = await this.checkToolAvailable(TOOLS.OPEN);
    details.push(
      this.createRequirementDetail(
        TOOLS.OPEN,
        openAvailable,
        "open is part of macOS and should be available by default. If missing, this may indicate a system issue."
      )
    );

    // Check shell
    const shellDetail = await this.checkShellRequirement(this.shellCommand);
    // Override installation message for macOS
    if (!shellDetail.available) {
      shellDetail.installation =
        "Install zsh: Usually pre-installed on macOS. If missing, install via Homebrew: brew install zsh";
    }
    details.push(shellDetail);

    return this.buildRequirementResult(details);
  }

  buildDelayedOpenUrlCommand(
    url: string,
    delaySeconds: number
  ): DelayedCommand {
    const escapedUrl = this.escapeUrlForShell(url);
    const command = `${TOOLS.OPEN} "${escapedUrl}"`;
    return this.buildDelayedCommand(delaySeconds, command);
  }

  buildDelayedEnterCommand(delaySeconds: number): DelayedCommand {
    // Activate Cursor first, then press Enter
    // Escape single quotes for shell: ' becomes '\'' (end quote, escaped quote, start quote)
    const activateScript = APPLESCRIPT.ACTIVATE_CURSOR.replace(/'/g, "'\\''");
    const keystrokeScript = APPLESCRIPT.KEYSTROKE_RETURN.replace(/'/g, "'\\''");
    const command = `${TOOLS.OSASCRIPT} -e '${activateScript}' && sleep 0.2 && ${TOOLS.OSASCRIPT} -e '${keystrokeScript}'`;
    return this.buildDelayedCommand(delaySeconds, command);
  }

  buildDelayedTypeTextCommand(
    text: string,
    delaySeconds: number
  ): DelayedCommand {
    const escapedText = this.escapeTextForAppleScript(text);
    const applescript = APPLESCRIPT.KEYSTROKE(escapedText);
    // Activate Cursor first, then type text
    // Escape single quotes for shell: ' becomes '\'' (end quote, escaped quote, start quote)
    const activateScript = APPLESCRIPT.ACTIVATE_CURSOR.replace(/'/g, "'\\''");
    const escapedScript = applescript.replace(/'/g, "'\\''");
    const command = `${TOOLS.OSASCRIPT} -e '${activateScript}' && sleep 0.2 && ${TOOLS.OSASCRIPT} -e '${escapedScript}'`;
    return this.buildDelayedCommand(delaySeconds, command);
  }
}
