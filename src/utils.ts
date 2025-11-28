import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import lockfile from "proper-lockfile";
import { AgentState, AgentsRegistry } from "./types.js";

const STATE_DIR = path.join(os.homedir(), ".cursor-agents");
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

export function spawnAgent(
  prompt: string,
  agentId: string,
  delaySeconds: number = 0
): void {
  const completionPrompt = `${prompt}\n\n---\nWhen you are finished, you have to run: cursor-sub-agents complete ${agentId} "your optional return message here"\nThis command will wait for orchestrator approval before completing. You can also run this somewhere during your implementation to check that you are on track! THIS IS ESSENTIAL OTHERWISE YOUR CODE CANNOT BE VERIFIED. DO NOT FINISH WITHOUT RUNNING THIS COMMAND.`;
  const encodedPrompt = urlEncode(completionPrompt);
  const url = `https://cursor.com/link/prompt?text=${encodedPrompt}`;

  // Sequential pattern: open link -> wait 2s -> press Enter -> wait 2s -> press Enter -> wait 2s (then next agent)
  // Each agent gets: open at delaySeconds, Enter1 at delaySeconds+2, Enter2 at delaySeconds+4, then wait 2s before next
  const openDelay = delaySeconds;
  const enter1Delay = delaySeconds + 2;
  const enter2Delay = delaySeconds + 4;

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
