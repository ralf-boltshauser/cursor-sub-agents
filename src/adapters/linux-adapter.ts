import type { DelayedCommand } from "../platform-adapter.js";
import {
  BaseAdapter,
  LINUX_URL_OPENERS,
  LINUX_WAYLAND_KEYBOARD_TOOLS,
  LINUX_X11_KEYBOARD_TOOLS,
  TOOLS,
} from "./base-adapter.js";

type LinuxEnvironment = "x11" | "wayland" | "unknown";

/**
 * Linux platform adapter with X11/Wayland detection and tool fallbacks
 *
 * Handles URL opening, keyboard automation, and window activation on Linux.
 * Automatically detects X11 vs Wayland and selects appropriate tools:
 * - X11: xdotool (primary), ydotool (fallback)
 * - Wayland: wtype (primary), ydotool, kdotool (KDE only)
 * - URL openers: xdg-open, gio, gnome-open, kde-open, exo-open
 */
export class LinuxAdapter extends BaseAdapter {
  private environment: LinuxEnvironment;
  private urlOpener: string | null = null;
  private keyboardTool: string | null = null;
  private shellCommand: string;

  constructor() {
    super();
    this.environment = this.detectLinuxEnvironment();
    this.shellCommand = this.getDefaultShell();
    // Tools will be detected lazily on first use or via checkRequirements
  }

  /**
   * Detect if running in X11 or Wayland
   */
  private detectLinuxEnvironment(): LinuxEnvironment {
    const sessionType = process.env.XDG_SESSION_TYPE;
    if (sessionType === "wayland" || process.env.WAYLAND_DISPLAY) {
      return "wayland";
    }
    if (sessionType === "x11" || process.env.DISPLAY) {
      return "x11";
    }
    return "unknown";
  }

  /**
   * Get keyboard tools list based on environment
   */
  private getKeyboardToolsList(): string[] {
    if (this.environment === "x11") {
      return Array.from(LINUX_X11_KEYBOARD_TOOLS);
    } else if (this.environment === "wayland") {
      const tools: string[] = Array.from(LINUX_WAYLAND_KEYBOARD_TOOLS);
      // Check for KDE-specific tool
      if (process.env.XDG_CURRENT_DESKTOP?.includes("KDE")) {
        tools.unshift(TOOLS.KDOTOOL);
      }
      return tools;
    }
    return [];
  }

  /**
   * Detect available tools for URL opening and keyboard automation (async)
   */
  private async detectTools(): Promise<void> {
    // Detect URL opener
    for (const opener of LINUX_URL_OPENERS) {
      if (await this.checkToolAvailable(opener)) {
        this.urlOpener = opener;
        break;
      }
    }

    // Detect keyboard automation tool based on environment
    const keyboardTools = this.getKeyboardToolsList();
    for (const tool of keyboardTools) {
      if (await this.checkToolAvailable(tool)) {
        this.keyboardTool = tool;
        break;
      }
    }
  }

  /**
   * Synchronously detect keyboard tool (for delayed command building)
   * Shares logic with async version via getKeyboardToolsList()
   */
  private detectKeyboardToolSync(): string | null {
    const keyboardTools = this.getKeyboardToolsList();
    for (const tool of keyboardTools) {
      if (this.checkToolAvailableSync(tool)) {
        return tool;
      }
    }
    return null;
  }

  /**
   * Synchronously detect URL opener (for delayed command building)
   * Shares logic with async version via LINUX_URL_OPENERS constant
   */
  private detectUrlOpenerSync(): string {
    for (const opener of LINUX_URL_OPENERS) {
      if (this.checkToolAvailableSync(opener)) {
        return opener;
      }
    }
    return TOOLS.XDG_OPEN; // Default fallback
  }

  private async ensureToolsDetected(): Promise<void> {
    if (this.urlOpener === null || this.keyboardTool === null) {
      await this.detectTools();
    }
  }

  /**
   * Open URL in default browser
   * @param url - URL to open
   * @throws {Error} If no URL opener is found or command fails
   */
  async openUrl(url: string): Promise<void> {
    await this.ensureToolsDetected();
    if (!this.urlOpener) {
      throw new Error(
        `No URL opener found on Linux. Install one of: ${LINUX_URL_OPENERS.join(
          ", "
        )}`
      );
    }

    const args =
      this.urlOpener === TOOLS.GIO
        ? ["open", url]
        : this.urlOpener === TOOLS.XDG_OPEN
        ? [url]
        : [url];

    const result = await this.executeCommand(this.urlOpener, args);

    if (!result.success) {
      throw new Error(
        this.formatError(
          "open URL",
          this.urlOpener,
          result.stderr || "Unknown error"
        )
      );
    }
  }

  /**
   * Type text into the active window
   * @param text - Text to type
   * @throws {Error} If no keyboard tool is found or command fails
   */
  async typeText(text: string): Promise<void> {
    await this.ensureToolsDetected();
    if (!this.keyboardTool) {
      const env = this.environment === "x11" ? "X11" : "Wayland";
      const tools =
        env === "X11"
          ? LINUX_X11_KEYBOARD_TOOLS.join(" or ")
          : LINUX_WAYLAND_KEYBOARD_TOOLS.join(" or ");
      throw new Error(
        `No keyboard automation tool found for ${env} on Linux. Install ${tools}`
      );
    }

    // Escape text based on tool
    let command: string[];
    if (this.keyboardTool === TOOLS.XDOTOOL) {
      // xdotool requires shell escaping
      const escaped = this.escapeTextForShell(text);
      command = ["type", escaped];
    } else if (this.keyboardTool === TOOLS.WTYPE) {
      // wtype uses - for stdin or direct text
      command = [text];
    } else if (this.keyboardTool === TOOLS.YDOTOOL) {
      // ydotool uses type command
      command = ["type", "--file", "-"];
    } else if (this.keyboardTool === TOOLS.KDOTOOL) {
      // kdotool (KDE-specific)
      command = ["type", text];
    } else {
      throw new Error(
        `Unsupported keyboard tool on Linux: ${this.keyboardTool}`
      );
    }

    if (
      this.keyboardTool === TOOLS.YDOTOOL ||
      this.keyboardTool === TOOLS.WTYPE
    ) {
      // For tools that support stdin
      const result = await this.executeCommand(this.keyboardTool, command, {
        input: text,
        encoding: "utf8",
      });
      if (!result.success) {
        throw new Error(
          this.formatError(
            "type text",
            this.keyboardTool,
            result.stderr || "Unknown error"
          )
        );
      }
    } else {
      // For tools that take text as argument
      const result = await this.executeCommand(this.keyboardTool, command);
      if (!result.success) {
        throw new Error(
          this.formatError(
            "type text",
            this.keyboardTool,
            result.stderr || "Unknown error"
          )
        );
      }
    }
  }

  /**
   * Press Enter key
   * @throws {Error} If no keyboard tool is found or command fails
   */
  async pressEnter(): Promise<void> {
    await this.ensureToolsDetected();
    if (!this.keyboardTool) {
      const env = this.environment === "x11" ? "X11" : "Wayland";
      const tools =
        env === "X11"
          ? LINUX_X11_KEYBOARD_TOOLS.join(" or ")
          : LINUX_WAYLAND_KEYBOARD_TOOLS.join(" or ");
      throw new Error(
        `No keyboard automation tool found for ${env} on Linux. Install ${tools}`
      );
    }

    let command: string[];
    if (this.keyboardTool === TOOLS.XDOTOOL) {
      command = ["key", "Return"];
    } else if (this.keyboardTool === TOOLS.WTYPE) {
      command = ["-k", "Return"];
    } else if (this.keyboardTool === TOOLS.YDOTOOL) {
      command = ["key", "28:1", "28:0"]; // Enter key press and release
    } else if (this.keyboardTool === TOOLS.KDOTOOL) {
      command = ["key", "Return"];
    } else {
      throw new Error(
        `Unsupported keyboard tool on Linux: ${this.keyboardTool}`
      );
    }

    const result = await this.executeCommand(this.keyboardTool, command);

    if (!result.success) {
      throw new Error(
        this.formatError(
          "press Enter",
          this.keyboardTool,
          result.stderr || "Unknown error"
        )
      );
    }
  }

  async activateCursor(): Promise<void> {
    await this.ensureToolsDetected();
    if (this.environment === "x11" && this.keyboardTool === TOOLS.XDOTOOL) {
      // Try to find and activate Cursor window
      const result = await this.executeCommand(TOOLS.XDOTOOL, [
        "search",
        "--name",
        "Cursor",
        "windowactivate",
      ]);

      // Non-fatal - continue anyway if activation fails
      if (!result.success) {
        console.warn(this.formatWarning("Could not activate Cursor window"));
      }
    } else {
      // Wayland or other tools don't have reliable window activation
      // This is a limitation of Wayland's security model
      console.warn(
        this.formatWarning(
          "Window activation not supported for this environment/tool combination"
        )
      );
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
    // Re-detect tools to ensure we have current state
    await this.detectTools();

    const details: Array<{
      tool: string;
      available: boolean;
      installation?: string;
    }> = [];

    // Check environment
    details.push(
      this.createRequirementDetail(
        `Display Server (${this.environment})`,
        this.environment !== "unknown",
        "Unable to detect display server. Ensure XDG_SESSION_TYPE or DISPLAY/WAYLAND_DISPLAY is set."
      )
    );

    // Check URL opener
    const urlOpenerAvailable = this.urlOpener !== null;
    details.push(
      this.createRequirementDetail(
        `URL Opener (${this.urlOpener || "none"})`,
        urlOpenerAvailable,
        this.getUrlOpenerInstallation()
      )
    );

    // Check keyboard automation tool
    const keyboardToolAvailable = this.keyboardTool !== null;
    details.push(
      this.createRequirementDetail(
        `Keyboard Automation (${this.keyboardTool || "none"})`,
        keyboardToolAvailable,
        this.getKeyboardToolInstallation()
      )
    );

    // Check shell
    const shellDetail = await this.checkShellRequirement(this.shellCommand);
    details.push(shellDetail);

    return this.buildRequirementResult(details);
  }

  private getUrlOpenerInstallation(): string {
    // Try to detect package manager
    const packageManagers = [
      { cmd: "pacman", install: "sudo pacman -S xdg-utils" },
      { cmd: "apt", install: "sudo apt-get install xdg-utils" },
      { cmd: "yum", install: "sudo yum install xdg-utils" },
      { cmd: "dnf", install: "sudo dnf install xdg-utils" },
      { cmd: "zypper", install: "sudo zypper install xdg-utils" },
    ];

    for (const pm of packageManagers) {
      if (this.checkToolAvailableSync(pm.cmd)) {
        return pm.install;
      }
    }

    return "Install xdg-utils using your distribution's package manager";
  }

  private getKeyboardToolInstallation(): string {
    if (this.environment === "x11") {
      const packageManagers = [
        { cmd: "pacman", install: "sudo pacman -S xdotool" },
        { cmd: "apt", install: "sudo apt-get install xdotool" },
        { cmd: "yum", install: "sudo yum install xdotool" },
        { cmd: "dnf", install: "sudo dnf install xdotool" },
        { cmd: "zypper", install: "sudo zypper install xdotool" },
      ];

      for (const pm of packageManagers) {
        if (this.checkToolAvailableSync(pm.cmd)) {
          return pm.install;
        }
      }

      return "Install xdotool using your distribution's package manager (e.g., sudo pacman -S xdotool for Arch)";
    } else {
      // Wayland
      const packageManagers = [
        { cmd: "pacman", install: "sudo pacman -S wtype" },
        { cmd: "apt", install: "sudo apt-get install wtype" },
        { cmd: "yum", install: "sudo yum install wtype" },
        { cmd: "dnf", install: "sudo dnf install wtype" },
        { cmd: "zypper", install: "sudo zypper install wtype" },
      ];

      for (const pm of packageManagers) {
        if (this.checkToolAvailableSync(pm.cmd)) {
          return `${pm.install} (or install ydotool: sudo pacman -S ydotool)`;
        }
      }

      return "Install wtype or ydotool using your distribution's package manager (e.g., sudo pacman -S wtype for Arch)";
    }
  }

  buildDelayedOpenUrlCommand(
    url: string,
    delaySeconds: number
  ): DelayedCommand {
    const opener = this.detectUrlOpenerSync();
    const args = opener === TOOLS.GIO ? ["open", url] : [url];
    const escapedArgs = args
      .map((a) => `"${this.escapeUrlForShell(a)}"`)
      .join(" ");
    const command = `${opener} ${escapedArgs}`;
    return this.buildDelayedCommand(delaySeconds, command);
  }

  buildDelayedEnterCommand(delaySeconds: number): DelayedCommand {
    const tool = this.detectKeyboardToolSync();

    if (!tool) {
      // Fallback to xdotool (most common)
      const command = `${TOOLS.XDOTOOL} key Return`;
      return this.buildDelayedCommand(delaySeconds, command);
    }

    let command: string;
    if (tool === TOOLS.XDOTOOL) {
      command = `${TOOLS.XDOTOOL} key Return`;
    } else if (tool === TOOLS.WTYPE) {
      command = `${TOOLS.WTYPE} -k Return`;
    } else if (tool === TOOLS.YDOTOOL) {
      command = `${TOOLS.YDOTOOL} key 28:1 28:0`;
    } else if (tool === TOOLS.KDOTOOL) {
      command = `${TOOLS.KDOTOOL} key Return`;
    } else {
      // Fallback
      command = `${TOOLS.XDOTOOL} key Return`;
    }
    return this.buildDelayedCommand(delaySeconds, command);
  }

  buildDelayedTypeTextCommand(
    text: string,
    delaySeconds: number
  ): DelayedCommand {
    const tool = this.detectKeyboardToolSync();
    const escaped = this.escapeTextForShell(text);

    if (!tool) {
      // Fallback to xdotool (most common)
      const command = `${TOOLS.XDOTOOL} type "${escaped}"`;
      return this.buildDelayedCommand(delaySeconds, command);
    }

    let command: string;
    if (tool === TOOLS.XDOTOOL) {
      command = `${TOOLS.XDOTOOL} type "${escaped}"`;
    } else if (tool === TOOLS.WTYPE) {
      command = `${TOOLS.WTYPE} "${escaped}"`;
    } else if (tool === TOOLS.YDOTOOL) {
      // ydotool uses stdin, so we need a different approach
      command = `echo "${escaped}" | ${TOOLS.YDOTOOL} type --file -`;
    } else if (tool === TOOLS.KDOTOOL) {
      command = `${TOOLS.KDOTOOL} type "${escaped}"`;
    } else {
      // Fallback
      command = `${TOOLS.XDOTOOL} type "${escaped}"`;
    }
    return this.buildDelayedCommand(delaySeconds, command);
  }
}
