// Small utility functions
import { TWENTY_FOUR_HOURS_MS } from "./lib/constants.js";
import { loadState, saveState } from "./lib/state.js";
import { AgentsRegistry, AgentState } from "./types.js";

// Re-export everything from lib modules for backward compatibility
export * from "./lib/commands.js";
export * from "./lib/config.js";
export {
  GLOBAL_JOBS_DIR,
  PROJECT_JOBS_DIR,
  STATE_FILE,
} from "./lib/constants.js";
export * from "./lib/jobs.js";
export * from "./lib/spawning.js";
export * from "./lib/state.js";
export * from "./lib/tasks.js";
export * from "./lib/validation.js";

// Small utility functions
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
      if (ageMs >= TWENTY_FOUR_HOURS_MS) {
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

export function urlEncode(prompt: string): string {
  // Use encodeURIComponent which encodes spaces as %20
  // Then replace any + signs with %2B to ensure they're not interpreted as spaces
  // This ensures spaces stay as %20 and are not converted to + during URL parsing
  return encodeURIComponent(prompt).replace(/\+/g, "%2B");
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
