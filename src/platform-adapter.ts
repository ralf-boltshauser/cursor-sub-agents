import { LinuxAdapter } from "./adapters/linux-adapter.js";
import { MacOSAdapter } from "./adapters/macos-adapter.js";
import { WindowsAdapter } from "./adapters/windows-adapter.js";

/**
 * Command structure for delayed execution
 */
export interface DelayedCommand {
  shell: string;
  args: string[];
}

/**
 * Platform-agnostic interface for OS-specific operations
 *
 * This interface abstracts platform-specific operations like opening URLs,
 * keyboard automation, and window activation. Each platform (macOS, Linux, Windows)
 * has its own implementation that handles the specific tools and commands needed.
 *
 * @example
 * ```typescript
 * const adapter = getPlatformAdapter();
 * await adapter.openUrl("https://example.com");
 * await adapter.typeText("Hello World");
 * await adapter.pressEnter();
 * ```
 */
export interface PlatformAdapter {
  // Open URL in default browser
  openUrl(url: string): Promise<void>;

  // Type text into active window
  typeText(text: string): Promise<void>;

  // Press Enter key
  pressEnter(): Promise<void>;

  // Activate/focus Cursor application window
  activateCursor(): Promise<void>;

  // Get shell command for delayed execution
  getShellCommand(): string;

  // Check if required tools are available
  checkRequirements(): Promise<{
    available: boolean;
    missing: string[];
    details: Array<{
      tool: string;
      available: boolean;
      installation?: string;
    }>;
  }>;

  // Build delayed command for opening URL (for use with spawn)
  buildDelayedOpenUrlCommand(url: string, delaySeconds: number): DelayedCommand;

  // Build delayed command for pressing Enter (for use with spawn)
  buildDelayedEnterCommand(delaySeconds: number): DelayedCommand;

  // Build delayed command for typing text (for use with spawn)
  buildDelayedTypeTextCommand(
    text: string,
    delaySeconds: number
  ): DelayedCommand;
}

/**
 * Factory function to get the appropriate platform adapter
 */
export function getPlatformAdapter(): PlatformAdapter {
  const platform = process.platform;

  if (platform === "darwin") {
    return new MacOSAdapter();
  } else if (platform === "linux") {
    return new LinuxAdapter();
  } else if (platform === "win32") {
    return new WindowsAdapter();
  } else {
    throw new Error(
      `Unsupported platform: ${platform}. Supported platforms: darwin (macOS), linux, win32 (Windows)`
    );
  }
}
