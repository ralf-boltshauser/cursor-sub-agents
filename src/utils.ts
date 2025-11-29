import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import lockfile from "proper-lockfile";
import { AgentState, AgentsRegistry } from "./types.js";

const STATE_DIR = path.join(os.homedir(), ".csa");
export const STATE_FILE = path.join(STATE_DIR, "state.json");
const LOCK_OPTIONS = {
  retries: {
    retries: 10,
    minTimeout: 100,
    maxTimeout: 1000,
  },
};

export function generateId(length: number = 6): string {
  // Generate longer IDs to reduce collision risk
  // 6 chars gives ~2 billion combinations, 8 chars gives ~2 trillion
  return Math.random()
    .toString(36)
    .substring(2, 2 + length);
}

export function generateSessionId(): string {
  // Longer session IDs for better uniqueness
  return generateId(8);
}

export function generateAgentId(): string {
  // Agent IDs can be shorter but still unique
  return generateId(6);
}

export async function ensureStateDir(): Promise<void> {
  try {
    await fs.mkdir(STATE_DIR, { recursive: true });
  } catch {
    // Directory might already exist, ignore
  }
}

export function getRepositoryIdentifier(repoPath: string): string {
  if (!repoPath || repoPath === "unknown") {
    return "unknown";
  }

  // Normalize path separators
  const normalized = repoPath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter((p) => p.length > 0);

  if (parts.length === 0) {
    return "unknown";
  }

  // If it's just one part, return it
  if (parts.length === 1) {
    return parts[0];
  }

  // Return parent/dirname format for better context
  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

export async function loadState(): Promise<AgentsRegistry> {
  await ensureStateDir();
  let release: (() => Promise<void>) | null = null;

  try {
    // Acquire lock before reading
    release = await lockfile.lock(STATE_FILE, LOCK_OPTIONS);

    try {
      const content = await fs.readFile(STATE_FILE, "utf-8");
      return JSON.parse(content);
    } catch (error) {
      // File doesn't exist or is corrupted, return empty state
      return { sessions: {} };
    } finally {
      // Always release the lock
      if (release) {
        await release();
      }
    }
  } catch (error) {
    // Lock acquisition failed - handle gracefully
    // Return empty state to avoid reading partially written files
    // The caller can retry if needed
    return { sessions: {} };
  }
}

export async function saveState(state: AgentsRegistry): Promise<void> {
  await ensureStateDir();
  let release: (() => Promise<void>) | null = null;

  try {
    // Acquire lock before writing
    release = await lockfile.lock(STATE_FILE, LOCK_OPTIONS);

    // Atomic write: write to temp file first, then rename
    const tempFile = `${STATE_FILE}.tmp.${Date.now()}.${Math.random()
      .toString(36)
      .substring(2, 9)}`;
    const stateContent = JSON.stringify(state, null, 2);

    try {
      // Write to temp file
      await fs.writeFile(tempFile, stateContent, "utf-8");

      // Atomic rename (rename is atomic on most filesystems)
      await fs.rename(tempFile, STATE_FILE);
    } catch (writeError) {
      // Clean up temp file if it exists
      try {
        await fs.unlink(tempFile);
      } catch {
        // Ignore cleanup errors
      }
      throw writeError;
    } finally {
      // Always release the lock
      if (release) {
        await release();
      }
    }
  } catch (error) {
    // Lock acquisition failed - throw error to let caller handle it
    throw new Error(
      `Failed to save state: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export function urlEncode(prompt: string): string {
  // Use encodeURIComponent which encodes spaces as %20
  // Then replace any + signs with %2B to ensure they're not interpreted as spaces
  // This ensures spaces stay as %20 and are not converted to + during URL parsing
  return encodeURIComponent(prompt).replace(/\+/g, "%2B");
}

// Config file management
export interface ConfigFile {
  followUpPrompts: string[];
}

const GLOBAL_CONFIG_FILE = path.join(STATE_DIR, "config.json");
const LOCAL_CONFIG_FILE = path.join(process.cwd(), ".csa", "config.json");

export async function getLocalConfigPath(): Promise<string> {
  return LOCAL_CONFIG_FILE;
}

export async function getGlobalConfigPath(): Promise<string> {
  return GLOBAL_CONFIG_FILE;
}

export async function ensureConfigDir(configPath: string): Promise<void> {
  const dir = path.dirname(configPath);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {
    // Directory might already exist, ignore
  }
}

export async function loadConfig(
  configPath: string
): Promise<ConfigFile | null> {
  try {
    await ensureConfigDir(configPath);
    const content = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(content) as ConfigFile;
    if (config && Array.isArray(config.followUpPrompts)) {
      return config;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveConfig(
  configPath: string,
  config: ConfigFile
): Promise<void> {
  await ensureConfigDir(configPath);
  const content = JSON.stringify(config, null, 2);
  await fs.writeFile(configPath, content, "utf-8");
}

export async function getActiveConfig(): Promise<{
  config: ConfigFile | null;
  source: "local" | "global" | "default";
  path: string;
}> {
  // Try local config first
  try {
    const localConfig = await loadConfig(LOCAL_CONFIG_FILE);
    if (localConfig) {
      return { config: localConfig, source: "local", path: LOCAL_CONFIG_FILE };
    }
  } catch {
    // Local config doesn't exist or is invalid, continue
  }

  // Try global config
  try {
    const globalConfig = await loadConfig(GLOBAL_CONFIG_FILE);
    if (globalConfig) {
      return {
        config: globalConfig,
        source: "global",
        path: GLOBAL_CONFIG_FILE,
      };
    }
  } catch {
    // Global config doesn't exist or is invalid, continue
  }

  // Return defaults
  return {
    config: {
      followUpPrompts: [
        "Verify if the changes you have implemented are actually working and align with the instructions provided",
        "please complete your work by executing ```csa complete {agentId}```",
      ],
    },
    source: "default",
    path: "",
  };
}

export async function deleteConfig(configPath: string): Promise<void> {
  try {
    await fs.unlink(configPath);
  } catch {
    // File doesn't exist, ignore
  }
}

/**
 * Get follow-up prompts from config files, environment variable, or return defaults
 * Priority: local config > global config > env var > defaults
 * The string "{agentId}" will be replaced with the actual agent ID
 */
export async function getFollowUpPrompts(agentId: string): Promise<string[]>;
export function getFollowUpPrompts(agentId: string): string[];
export function getFollowUpPrompts(
  agentId: string
): string[] | Promise<string[]> {
  // Check environment variable first (highest priority for backward compatibility)
  const envPrompts = process.env.CSA_FOLLOWUP_PROMPTS;

  if (envPrompts) {
    try {
      // Try parsing as JSON first
      const parsed = JSON.parse(envPrompts);
      if (Array.isArray(parsed)) {
        return parsed.map((prompt: string) =>
          typeof prompt === "string"
            ? prompt.replace(/{agentId}/g, agentId)
            : String(prompt)
        );
      }
    } catch {
      // Not JSON, try pipe-separated format
    }

    // Try pipe-separated format
    if (envPrompts.includes("|")) {
      return envPrompts
        .split("|")
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
        .map((p) => p.replace(/{agentId}/g, agentId));
    }

    // Single prompt
    return [envPrompts.replace(/{agentId}/g, agentId)];
  }

  // If called synchronously (for backward compatibility), return defaults
  // Otherwise, this will be handled by the async version
  return [
    "Verify if the changes you have implemented are actually working and align with the instructions provided",
    `please complete your work by executing \`\`\`csa complete ${agentId}\`\`\``,
  ];
}

export async function getFollowUpPromptsAsync(
  agentId: string
): Promise<string[]> {
  // Check environment variable first (highest priority for backward compatibility)
  const envPrompts = process.env.CSA_FOLLOWUP_PROMPTS;

  if (envPrompts) {
    try {
      // Try parsing as JSON first
      const parsed = JSON.parse(envPrompts);
      if (Array.isArray(parsed)) {
        return parsed.map((prompt: string) =>
          typeof prompt === "string"
            ? prompt.replace(/{agentId}/g, agentId)
            : String(prompt)
        );
      }
    } catch {
      // Not JSON, try pipe-separated format
    }

    // Try pipe-separated format
    if (envPrompts.includes("|")) {
      return envPrompts
        .split("|")
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
        .map((p) => p.replace(/{agentId}/g, agentId));
    }

    // Single prompt
    return [envPrompts.replace(/{agentId}/g, agentId)];
  }

  // Try config files
  const activeConfig = await getActiveConfig();
  if (activeConfig.config) {
    return activeConfig.config.followUpPrompts.map((p) =>
      p.replace(/{agentId}/g, agentId)
    );
  }

  // Return defaults
  return [
    "Verify if the changes you have implemented are actually working and align with the instructions provided",
    `please complete your work by executing \`\`\`csa complete ${agentId}\`\`\``,
  ];
}

export async function spawnAgent(
  prompt: string,
  agentId: string,
  delaySeconds: number = 0,
  followUpPrompts?: string[]
): Promise<void> {
  // Use only the original prompt in the URL (no appended completion instructions)
  const encodedPrompt = urlEncode(prompt);
  const url = `https://cursor.com/link/prompt?text=${encodedPrompt}`;

  // Get follow-up prompts (from parameter, config files, env var, or defaults)
  const followUps = followUpPrompts || (await getFollowUpPromptsAsync(agentId));

  // Sequential pattern: open link -> wait 2s -> Enter -> wait 2s -> Enter -> wait 2s -> follow-up prompts
  // Each agent gets: open at delaySeconds, Enter1 at delaySeconds+2, Enter2 at delaySeconds+4, then follow-ups
  const openDelay = delaySeconds;
  const enter1Delay = delaySeconds + 2;
  const enter2Delay = delaySeconds + 4;
  let currentDelay = delaySeconds + 6; // Start follow-ups after the two Enters

  // Open URL at scheduled time
  if (openDelay > 0) {
    const openScript = `sleep ${openDelay} && open "${url}"`;
    spawn("/opt/homebrew/bin/zsh", ["-c", openScript], {
      detached: true,
      stdio: "ignore",
    }).unref();
  } else {
    spawn("open", [url], {
      detached: true,
      stdio: "ignore",
    }).unref();
  }

  // First Enter press
  const enter1Script = `sleep ${enter1Delay} && osascript -e 'tell application "System Events" to keystroke return'`;
  spawn("/opt/homebrew/bin/zsh", ["-c", enter1Script], {
    detached: true,
    stdio: "ignore",
  }).unref();

  // Second Enter press
  const enter2Script = `sleep ${enter2Delay} && osascript -e 'tell application "System Events" to keystroke return'`;
  spawn("/opt/homebrew/bin/zsh", ["-c", enter2Script], {
    detached: true,
    stdio: "ignore",
  }).unref();

  // Send follow-up prompts via osascript keystrokes
  followUps.forEach((followUp, index) => {
    const followUpDelay = currentDelay + index * 2; // 2 seconds between each follow-up
    // Escape special characters for osascript AppleScript string
    // In AppleScript strings, we need to escape backslashes and quotes
    const escapedPrompt = followUp
      .replace(/\\/g, "\\\\") // Escape backslashes first
      .replace(/"/g, '\\"'); // Escape double quotes
    // Use osascript with proper AppleScript syntax - keystroke accepts text directly
    // We use double quotes in the shell command and escape them properly in AppleScript
    const followUpScript = `sleep ${followUpDelay} && osascript -e 'tell application "System Events" to keystroke "${escapedPrompt}"' && sleep 2 && osascript -e 'tell application "System Events" to keystroke return'`;
    spawn("/opt/homebrew/bin/zsh", ["-c", followUpScript], {
      detached: true,
      stdio: "ignore",
    }).unref();
  });
}

export function findAgentById(
  state: AgentsRegistry,
  agentId: string
): { sessionId: string; agent: AgentState } | null {
  for (const [sessionId, session] of Object.entries(state.sessions)) {
    const agent = session.agents.find((a) => a.id === agentId);
    if (agent) {
      return { sessionId, agent };
    }
  }
  return null;
}

/**
 * Removes completed sessions older than 24 hours.
 * Handles edge cases like missing completedAt, invalid dates, and corrupted state.
 * @returns The number of sessions removed
 */
export async function cleanupOldSessions(): Promise<number> {
  try {
    const state = await loadState();
    const now = Date.now();
    const twentyFourHoursMs = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    const sessions = state.sessions;
    const sessionIds = Object.keys(sessions);
    let removedCount = 0;

    // Filter out old completed sessions
    const cleanedSessions: AgentsRegistry["sessions"] = {};

    for (const sessionId of sessionIds) {
      const session = sessions[sessionId];

      // Skip if session is missing or malformed
      if (!session) {
        continue;
      }

      // Only remove sessions that have completedAt set
      if (!session.completedAt) {
        // Keep incomplete sessions
        cleanedSessions[sessionId] = session;
        continue;
      }

      // Validate and parse the completedAt date
      let completedAtTime: number;
      try {
        const parsedDate = new Date(session.completedAt);
        completedAtTime = parsedDate.getTime();

        // Check if date is valid
        if (isNaN(completedAtTime)) {
          // Invalid date, keep the session to be safe
          cleanedSessions[sessionId] = session;
          continue;
        }
      } catch {
        // Invalid date format, keep the session to be safe
        cleanedSessions[sessionId] = session;
        continue;
      }

      // Check if session is older than 24 hours
      const ageMs = now - completedAtTime;
      if (ageMs >= twentyFourHoursMs) {
        // Session is old enough to remove
        removedCount++;
      } else {
        // Keep the session
        cleanedSessions[sessionId] = session;
      }
    }

    // Only save if we actually removed something or if state structure changed
    if (
      removedCount > 0 ||
      Object.keys(cleanedSessions).length !== sessionIds.length
    ) {
      state.sessions = cleanedSessions;
      await saveState(state);
    }

    return removedCount;
  } catch (error) {
    // If cleanup fails, log but don't throw - we don't want to break the main functionality
    // In production, you might want to log this to a file or monitoring service
    console.error("Error during session cleanup:", error);
    return 0;
  }
}
