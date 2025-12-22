import { spawnSync } from "child_process";
import type { DelayedCommand } from "../platform-adapter.js";
import { BaseAdapter, TOOLS } from "./base-adapter.js";

/**
 * Windows platform adapter using PowerShell and cmd
 *
 * Handles URL opening, keyboard automation, and window activation on Windows
 * using PowerShell SendKeys and AppActivate, with cmd for URL opening.
 */
export class WindowsAdapter extends BaseAdapter {
  private shellCommand: string;

  constructor() {
    super();
    // Prefer PowerShell, fallback to cmd
    // Check synchronously for shell
    const powershellCheck = spawnSync("where", [TOOLS.POWERSHELL], {
      stdio: "ignore",
    });
    if (powershellCheck.status === 0) {
      this.shellCommand = "powershell.exe";
    } else {
      this.shellCommand = "cmd.exe";
    }
  }

  /**
   * Build PowerShell SendKeys script
   * @param keys - Keys to send (e.g., "{ENTER}" or text)
   * @param forDelayedCommand - If true, escape for use in cmd.exe delayed command
   * @returns PowerShell script string
   */
  private buildPowerShellSendKeysScript(
    keys: string,
    forDelayedCommand: boolean = false
  ): string {
    let script = `
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.SendKeys]::SendWait("${keys}")
    `.trim();

    // For delayed commands, we need to escape quotes for cmd.exe
    if (forDelayedCommand) {
      // Escape double quotes for cmd.exe: " becomes \"
      script = script.replace(/"/g, '\\"');
    }

    return script;
  }

  /**
   * Open URL in default browser
   * @param url - URL to open
   * @throws {Error} If cmd start command fails
   */
  async openUrl(url: string): Promise<void> {
    const result = await this.executeCommand(TOOLS.CMD, [
      "/c",
      "start",
      "",
      url,
    ]);

    if (!result.success) {
      throw new Error(
        this.formatError(
          "open URL",
          TOOLS.CMD,
          result.stderr || "Unknown error"
        )
      );
    }
  }

  /**
   * Type text into the active window
   * @param text - Text to type
   * @throws {Error} If PowerShell SendKeys command fails
   */
  async typeText(text: string): Promise<void> {
    const escapedText = this.escapeTextForPowerShell(text);
    const powershellScript = this.buildPowerShellSendKeysScript(escapedText);

    const result = await this.executeCommand(TOOLS.POWERSHELL, [
      "-Command",
      powershellScript,
    ]);

    if (!result.success) {
      throw new Error(
        this.formatError(
          "type text",
          TOOLS.POWERSHELL,
          result.stderr || "Unknown error"
        )
      );
    }
  }

  /**
   * Press Enter key
   * @throws {Error} If PowerShell SendKeys command fails
   */
  async pressEnter(): Promise<void> {
    const powershellScript = this.buildPowerShellSendKeysScript("{ENTER}");

    const result = await this.executeCommand(TOOLS.POWERSHELL, [
      "-Command",
      powershellScript,
    ]);

    if (!result.success) {
      throw new Error(
        this.formatError(
          "press Enter",
          TOOLS.POWERSHELL,
          result.stderr || "Unknown error"
        )
      );
    }
  }

  async activateCursor(): Promise<void> {
    // Use PowerShell AppActivate to bring Cursor to foreground
    const powershellScript = `
      Add-Type -AssemblyName Microsoft.VisualBasic
      try {
        [Microsoft.VisualBasic.Interaction]::AppActivate("Cursor")
      } catch {
        # Try alternative method if AppActivate fails
        Get-Process | Where-Object {$_.MainWindowTitle -like "*Cursor*"} | ForEach-Object {
          [Microsoft.VisualBasic.Interaction]::AppActivate($_.Id)
        }
      }
    `.trim();

    const result = await this.executeCommand("powershell", [
      "-Command",
      powershellScript,
    ]);

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

    // Check PowerShell
    const powershellAvailable = await this.checkToolAvailable(TOOLS.POWERSHELL);
    details.push(
      this.createRequirementDetail(
        "PowerShell",
        powershellAvailable,
        "PowerShell should be available on Windows 7+. If missing, install PowerShell from Microsoft."
      )
    );

    // Check cmd
    const cmdAvailable = await this.checkToolAvailable(TOOLS.CMD);
    details.push(
      this.createRequirementDetail(
        "cmd.exe",
        cmdAvailable,
        "cmd.exe should be available on all Windows systems. If missing, this may indicate a system issue."
      )
    );

    // Check shell
    const shellDetail = await this.checkShellRequirement(this.shellCommand);
    details.push(shellDetail);

    // Check PowerShell execution policy (may block scripts)
    if (powershellAvailable) {
      const policyResult = await this.executeCommand(TOOLS.POWERSHELL, [
        "-Command",
        "Get-ExecutionPolicy",
      ]);
      const executionPolicy = policyResult.stdout?.trim().toLowerCase();
      const policyRestrictive =
        executionPolicy === "restricted" || executionPolicy === "all signed";

      details.push({
        tool: "PowerShell Execution Policy",
        available: !policyRestrictive,
        installation: policyRestrictive
          ? "PowerShell execution policy is restrictive. Run: Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser"
          : undefined,
      });
    }

    return this.buildRequirementResult(details);
  }

  buildDelayedOpenUrlCommand(
    url: string,
    delaySeconds: number
  ): DelayedCommand {
    const escapedUrl = this.escapeUrlForShell(url);
    const command = `${TOOLS.CMD} /c start "" "${escapedUrl}"`;
    return this.buildDelayedCommand(delaySeconds, command);
  }

  buildDelayedEnterCommand(delaySeconds: number): DelayedCommand {
    const sendKeysScript = this.buildPowerShellSendKeysScript("{ENTER}", true);
    const command = `${TOOLS.POWERSHELL} -Command "${sendKeysScript}"`;
    return this.buildDelayedCommand(delaySeconds, command);
  }

  buildDelayedTypeTextCommand(
    text: string,
    delaySeconds: number
  ): DelayedCommand {
    const escapedText = this.escapeTextForPowerShell(text);
    const sendKeysScript = this.buildPowerShellSendKeysScript(
      escapedText,
      true
    );
    const command = `${TOOLS.POWERSHELL} -Command "${sendKeysScript}"`;
    return this.buildDelayedCommand(delaySeconds, command);
  }
}
