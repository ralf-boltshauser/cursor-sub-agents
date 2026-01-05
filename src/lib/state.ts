import { promises as fs } from "fs";
import lockfile from "proper-lockfile";
import { AgentsRegistry } from "../types.js";
import { LOCK_OPTIONS, STATE_DIR, STATE_FILE } from "./constants.js";

export async function ensureStateDir(): Promise<void> {
  try {
    await fs.mkdir(STATE_DIR, { recursive: true });
  } catch {
    // Directory might already exist, ignore
  }
}

export async function loadState(): Promise<AgentsRegistry> {
  await ensureStateDir();
  let release: (() => Promise<void>) | null = null;

  try {
    // Acquire lock before reading
    release = await lockfile.lock(STATE_FILE, LOCK_OPTIONS);

    try {
      const content = await fs.readFile(STATE_FILE, "utf-8");
      const parsed = JSON.parse(content) as unknown;
      // Basic validation - ensure it has sessions property
      if (
        parsed &&
        typeof parsed === "object" &&
        "sessions" in parsed &&
        typeof (parsed as Record<string, unknown>).sessions === "object"
      ) {
        return parsed as AgentsRegistry;
      }
      // If structure is invalid, return empty state
      return { sessions: {} };
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
