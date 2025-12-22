import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import lockfile from "proper-lockfile";
import { AgentState, AgentsRegistry, Job } from "./types.js";

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

// Default follow-up prompts (DRY - defined once, used everywhere)
const DEFAULT_FOLLOW_UP_PROMPTS = [
  "Verify if the changes you have implemented are actually working and align with the instructions provided!",
  "to hand off your work run the following command: csa complete {agentId}",
];

export function getDefaultPromptsArray(): string[] {
  return [...DEFAULT_FOLLOW_UP_PROMPTS];
}

function getDefaultPrompts(agentId: string): string[] {
  return DEFAULT_FOLLOW_UP_PROMPTS.map((prompt) =>
    prompt.replace(/{agentId}/g, agentId)
  );
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
      followUpPrompts: DEFAULT_FOLLOW_UP_PROMPTS,
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
  return getDefaultPrompts(agentId);
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
  return getDefaultPrompts(agentId);
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
  // Each follow-up takes 4 seconds: 1s to type + 1s delay + 2s before next
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
  // Each prompt: type text -> wait -> press Enter -> wait before next
  followUps.forEach((followUp, index) => {
    const typeDelay = currentDelay + index * 4; // Start typing at this time
    // Estimate typing time: ~0.1s per 10 characters, minimum 0.5s
    const typingTime = Math.max(0.5, followUp.length * 0.01);
    const enterDelay = typeDelay + typingTime; // Press Enter after typing completes

    // Escape special characters for osascript AppleScript string
    // AppleScript uses backslash escaping within double-quoted strings
    const escapedPrompt = followUp
      .replace(/\\/g, "\\\\") // Escape backslashes first
      .replace(/"/g, '\\"') // Escape double quotes
      .replace(/\$/g, "\\$"); // Escape dollar signs for shell

    // Type the prompt text using osascript
    // Use a single keystroke command for the entire string
    const typeScript = `sleep ${typeDelay} && osascript -e 'tell application "System Events" to keystroke "${escapedPrompt}"'`;
    spawn("/opt/homebrew/bin/zsh", ["-c", typeScript], {
      detached: true,
      stdio: "ignore",
    }).unref();

    // Press Enter after typing completes
    const enterScript = `sleep ${enterDelay.toFixed(
      2
    )} && osascript -e 'tell application "System Events" to keystroke return'`;
    spawn("/opt/homebrew/bin/zsh", ["-c", enterScript], {
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

// Task Types Configuration
export interface TaskTypeMapping {
  [taskType: string]: string[];
}

const GLOBAL_TASK_TYPES_FILE = path.join(STATE_DIR, "task-types.json");
const PROJECT_TASK_TYPES_FILE = path.join(
  process.cwd(),
  ".csa",
  "task-types.json"
);

const DEFAULT_TASK_TYPES: TaskTypeMapping = {
  "fix-issue": ["research", "plan-fix", "implement", "review"],
  implement: [
    "understand",
    "implement",
    "fix-issues",
    "review",
    "e2e-test",
    "update-plan",
  ],
  research: ["research", "document"],
  "identify-issues": ["analyze", "identify", "document"],
};

// Ensure global task types file exists with defaults
export async function ensureGlobalTaskTypesFile(): Promise<void> {
  try {
    await ensureStateDir();
    try {
      await fs.access(GLOBAL_TASK_TYPES_FILE);
      // File exists, don't overwrite
    } catch {
      // File doesn't exist, create with defaults
      await saveGlobalTaskTypes(DEFAULT_TASK_TYPES);
    }
  } catch (error) {
    // Ignore errors during initialization
  }
}

// Ensure project task types directory exists
export async function ensureProjectTaskTypesDir(): Promise<void> {
  const projectDir = path.join(process.cwd(), ".csa");
  try {
    await fs.mkdir(projectDir, { recursive: true });
  } catch {
    // Directory might already exist, ignore
  }
}

// Load task types: merge project (overrides) + global (defaults)
export async function loadTaskTypes(): Promise<TaskTypeMapping> {
  await ensureGlobalTaskTypesFile();
  await ensureProjectTaskTypesDir();

  // Load global task types
  let globalTypes: TaskTypeMapping = {};
  try {
    const content = await fs.readFile(GLOBAL_TASK_TYPES_FILE, "utf-8");
    const parsed = JSON.parse(content) as TaskTypeMapping;
    if (parsed && typeof parsed === "object") {
      globalTypes = parsed;
    }
  } catch {
    // Use defaults if global file doesn't exist or is invalid
    globalTypes = { ...DEFAULT_TASK_TYPES };
  }

  // Load project task types (if exists)
  let projectTypes: TaskTypeMapping = {};
  try {
    const content = await fs.readFile(PROJECT_TASK_TYPES_FILE, "utf-8");
    const parsed = JSON.parse(content) as TaskTypeMapping;
    if (parsed && typeof parsed === "object") {
      projectTypes = parsed;
    }
  } catch {
    // Project file doesn't exist, that's fine
  }

  // Merge: project overrides global
  return { ...globalTypes, ...projectTypes };
}

// Load only global task types
export async function loadGlobalTaskTypes(): Promise<TaskTypeMapping> {
  await ensureGlobalTaskTypesFile();
  try {
    const content = await fs.readFile(GLOBAL_TASK_TYPES_FILE, "utf-8");
    const taskTypes = JSON.parse(content) as TaskTypeMapping;
    if (taskTypes && typeof taskTypes === "object") {
      return taskTypes;
    }
    return { ...DEFAULT_TASK_TYPES };
  } catch {
    return { ...DEFAULT_TASK_TYPES };
  }
}

// Load only project task types
export async function loadProjectTaskTypes(): Promise<TaskTypeMapping> {
  await ensureProjectTaskTypesDir();
  try {
    const content = await fs.readFile(PROJECT_TASK_TYPES_FILE, "utf-8");
    const taskTypes = JSON.parse(content) as TaskTypeMapping;
    if (taskTypes && typeof taskTypes === "object") {
      return taskTypes;
    }
    return {};
  } catch {
    return {};
  }
}

// Save global task types
export async function saveGlobalTaskTypes(
  taskTypes: TaskTypeMapping
): Promise<void> {
  await ensureStateDir();
  const content = JSON.stringify(taskTypes, null, 2);
  await fs.writeFile(GLOBAL_TASK_TYPES_FILE, content, "utf-8");
}

// Save project task types
export async function saveProjectTaskTypes(
  taskTypes: TaskTypeMapping
): Promise<void> {
  await ensureProjectTaskTypesDir();
  const content = JSON.stringify(taskTypes, null, 2);
  await fs.writeFile(PROJECT_TASK_TYPES_FILE, content, "utf-8");
}

// Get task type commands (from merged task types)
export async function getTaskTypeCommands(taskType: string): Promise<string[]> {
  const taskTypes = await loadTaskTypes();
  return taskTypes[taskType] || [];
}

// Command Validation
const GLOBAL_COMMANDS_DIR = path.join(os.homedir(), ".cursor", "commands");
const PROJECT_COMMANDS_DIR = path.join(process.cwd(), ".cursor", "commands");

// Get all available commands with their preview (first line)
export async function getAllAvailableCommands(): Promise<
  Array<{ name: string; preview: string; location: "global" | "project" }>
> {
  const commands: Array<{
    name: string;
    preview: string;
    location: "global" | "project";
  }> = [];

  // Get global commands
  try {
    const globalFiles = await fs.readdir(GLOBAL_COMMANDS_DIR);
    for (const file of globalFiles) {
      if (file.endsWith(".md")) {
        const commandName = file.replace(".md", "");
        const filePath = path.join(GLOBAL_COMMANDS_DIR, file);
        try {
          const content = await fs.readFile(filePath, "utf-8");
          const firstLine = content.split("\n")[0] || "";
          // Remove # if it's a markdown header
          const preview = firstLine.replace(/^#+\s*/, "").trim() || commandName;
          commands.push({ name: commandName, preview, location: "global" });
        } catch {
          // If we can't read the file, just add the name
          commands.push({
            name: commandName,
            preview: commandName,
            location: "global",
          });
        }
      }
    }
  } catch {
    // Global directory doesn't exist, that's fine
  }

  // Get project commands (avoid duplicates)
  try {
    const projectFiles = await fs.readdir(PROJECT_COMMANDS_DIR);
    for (const file of projectFiles) {
      if (file.endsWith(".md")) {
        const commandName = file.replace(".md", "");
        // Skip if already in global
        if (commands.some((c) => c.name === commandName)) {
          continue;
        }
        const filePath = path.join(PROJECT_COMMANDS_DIR, file);
        try {
          const content = await fs.readFile(filePath, "utf-8");
          const firstLine = content.split("\n")[0] || "";
          const preview = firstLine.replace(/^#+\s*/, "").trim() || commandName;
          commands.push({ name: commandName, preview, location: "project" });
        } catch {
          commands.push({
            name: commandName,
            preview: commandName,
            location: "project",
          });
        }
      }
    }
  } catch {
    // Project directory doesn't exist, that's fine
  }

  // Sort by name
  commands.sort((a, b) => a.name.localeCompare(b.name));

  return commands;
}

async function commandExists(command: string): Promise<boolean> {
  const globalCommandFile = path.join(GLOBAL_COMMANDS_DIR, `${command}.md`);
  const projectCommandFile = path.join(PROJECT_COMMANDS_DIR, `${command}.md`);

  try {
    // Check global first
    await fs.access(globalCommandFile);
    return true;
  } catch {
    // Check project
    try {
      await fs.access(projectCommandFile);
      return true;
    } catch {
      return false;
    }
  }
}

// Check where a command is defined: "global", "project", or null if missing
export async function getCommandLocation(
  command: string
): Promise<"global" | "project" | null> {
  const globalCommandFile = path.join(GLOBAL_COMMANDS_DIR, `${command}.md`);
  const projectCommandFile = path.join(PROJECT_COMMANDS_DIR, `${command}.md`);

  try {
    await fs.access(globalCommandFile);
    return "global";
  } catch {
    try {
      await fs.access(projectCommandFile);
      return "project";
    } catch {
      return null;
    }
  }
}

export async function validateCommandsExist(
  commands: string[]
): Promise<string[]> {
  const missing: string[] = [];
  for (const command of commands) {
    if (!(await commandExists(command))) {
      missing.push(command);
    }
  }
  return missing;
}

// Job Utilities
export const GLOBAL_JOBS_DIR = path.join(STATE_DIR, "jobs");
export const PROJECT_JOBS_DIR = path.join(process.cwd(), ".csa", "jobs");

// Ensure global jobs directory exists
export async function ensureGlobalJobsDir(): Promise<void> {
  try {
    await ensureStateDir();
    await fs.mkdir(GLOBAL_JOBS_DIR, { recursive: true });
  } catch {
    // Directory might already exist, ignore
  }
}

// Ensure project jobs directory exists
export async function ensureProjectJobsDir(): Promise<void> {
  try {
    await fs.mkdir(PROJECT_JOBS_DIR, { recursive: true });
  } catch {
    // Directory might already exist, ignore
  }
}

export async function ensureJobDir(
  jobId: string,
  isGlobal: boolean = false
): Promise<string> {
  const jobsDir = isGlobal ? GLOBAL_JOBS_DIR : PROJECT_JOBS_DIR;
  if (isGlobal) {
    await ensureGlobalJobsDir();
  } else {
    await ensureProjectJobsDir();
  }
  const jobDir = path.join(jobsDir, jobId);
  try {
    await fs.mkdir(jobDir, { recursive: true });
  } catch {
    // Directory might already exist, ignore
  }
  return jobDir;
}

// Get job location: "local" | "global" | null
export async function getJobLocation(
  jobId: string
): Promise<"local" | "global" | null> {
  const localJobFile = path.join(PROJECT_JOBS_DIR, jobId, "job.json");
  const globalJobFile = path.join(GLOBAL_JOBS_DIR, jobId, "job.json");

  try {
    await fs.access(localJobFile);
    return "local";
  } catch {
    try {
      await fs.access(globalJobFile);
      return "global";
    } catch {
      return null;
    }
  }
}

// Load job file raw (reads and parses JSON, doesn't validate structure)
// Returns { job, jobFile } or throws with descriptive error
export async function loadJobFileRaw(
  jobId: string
): Promise<{ job: any; jobFile: string }> {
  const localJobFile = path.join(PROJECT_JOBS_DIR, jobId, "job.json");
  const globalJobFile = path.join(GLOBAL_JOBS_DIR, jobId, "job.json");

  // Try local first
  try {
    const content = await fs.readFile(localJobFile, "utf-8");
    const job = JSON.parse(content);
    return { job, jobFile: localJobFile };
  } catch (localError) {
    // Try global
    try {
      const content = await fs.readFile(globalJobFile, "utf-8");
      const job = JSON.parse(content);
      return { job, jobFile: globalJobFile };
    } catch (globalError) {
      throw new Error(
        `Failed to load job ${jobId}: Job not found in local (${PROJECT_JOBS_DIR}) or global (${GLOBAL_JOBS_DIR}) locations`
      );
    }
  }
}

// Structure for job validation errors
export interface JobValidationError {
  errors: string[];
  jobId: string;
  jobFile: string;
}

// Validate job structure and return specific error messages
export function validateJobStructure(job: any, jobId: string): string[] {
  const errors: string[] = [];

  if (!job) {
    errors.push("Job is null or undefined");
    return errors;
  }

  if (!job.id) {
    errors.push("Job missing 'id' field");
  } else if (typeof job.id !== "string") {
    errors.push("Job 'id' field must be a string");
  } else if (job.id !== jobId) {
    // This is a warning-level issue, but we'll include it in errors for consistency
    errors.push(
      `Job ID mismatch: job.json has '${job.id}' but expected '${jobId}'`
    );
  }

  if (!job.goal) {
    errors.push("Job missing 'goal' field");
  } else if (typeof job.goal !== "string") {
    errors.push("Job 'goal' field must be a string");
  }

  if (!job.tasks) {
    errors.push("Job missing 'tasks' field");
  } else if (!Array.isArray(job.tasks)) {
    errors.push("Job 'tasks' must be an array");
  } else if (job.tasks.length === 0) {
    errors.push("Job has no tasks");
  }

  return errors;
}

// Load and validate job: combines file loading, structure validation
// Returns validated Job or throws JobValidationError
export async function loadAndValidateJob(jobId: string): Promise<Job> {
  const { job, jobFile } = await loadJobFileRaw(jobId);
  const errors = validateJobStructure(job, jobId);

  if (errors.length > 0) {
    const validationError = new Error(
      `Job validation failed: ${errors.join("; ")}`
    ) as Error & { validationError: JobValidationError };
    validationError.validationError = {
      errors,
      jobId,
      jobFile,
    };
    throw validationError;
  }

  // Type assertion is safe here because validateJobStructure ensures structure
  return job as Job;
}

// Load job: try local first, then global
// Uses validateJobStructure() internally for consistent validation
// Maintains backward compatibility - throws generic error if validation fails
export async function loadJob(jobId: string): Promise<Job> {
  const { job, jobFile } = await loadJobFileRaw(jobId);
  const errors = validateJobStructure(job, jobId);

  if (errors.length > 0) {
    // For backward compatibility, throw generic error
    // Commands that need specific errors should use loadAndValidateJob()
    throw new Error("Invalid job.json structure");
  }

  // Type assertion is safe here because validateJobStructure ensures structure
  return job as Job;
}

// List all global job IDs
export async function listGlobalJobs(): Promise<string[]> {
  await ensureGlobalJobsDir();
  try {
    const entries = await fs.readdir(GLOBAL_JOBS_DIR, { withFileTypes: true });
    const jobIds: string[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const jobFile = path.join(GLOBAL_JOBS_DIR, entry.name, "job.json");
        try {
          await fs.access(jobFile);
          jobIds.push(entry.name);
        } catch {
          // Directory exists but no job.json, skip
        }
      }
    }
    return jobIds.sort();
  } catch {
    return [];
  }
}

// List all project job IDs
export async function listProjectJobs(): Promise<string[]> {
  await ensureProjectJobsDir();
  try {
    const entries = await fs.readdir(PROJECT_JOBS_DIR, { withFileTypes: true });
    const jobIds: string[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const jobFile = path.join(PROJECT_JOBS_DIR, entry.name, "job.json");
        try {
          await fs.access(jobFile);
          jobIds.push(entry.name);
        } catch {
          // Directory exists but no job.json, skip
        }
      }
    }
    return jobIds.sort();
  } catch {
    return [];
  }
}

// List all jobs with their locations
export async function listAllJobs(): Promise<
  Array<{ jobId: string; location: "local" | "global" }>
> {
  const globalJobs = await listGlobalJobs();
  const projectJobs = await listProjectJobs();

  const allJobs: Array<{ jobId: string; location: "local" | "global" }> = [];

  // Add project jobs (these override global)
  for (const jobId of projectJobs) {
    allJobs.push({ jobId, location: "local" });
  }

  // Add global jobs that aren't overridden
  for (const jobId of globalJobs) {
    if (!projectJobs.includes(jobId)) {
      allJobs.push({ jobId, location: "global" });
    }
  }

  return allJobs.sort((a, b) => a.jobId.localeCompare(b.jobId));
}

// Save job to global location
export async function saveGlobalJob(jobId: string, job: Job): Promise<void> {
  await ensureJobDir(jobId, true);
  const jobFile = path.join(GLOBAL_JOBS_DIR, jobId, "job.json");
  const content = JSON.stringify(job, null, 2);
  await fs.writeFile(jobFile, content, "utf-8");
}

// Save job to project location
export async function saveProjectJob(jobId: string, job: Job): Promise<void> {
  await ensureJobDir(jobId, false);
  const jobFile = path.join(PROJECT_JOBS_DIR, jobId, "job.json");
  const content = JSON.stringify(job, null, 2);
  await fs.writeFile(jobFile, content, "utf-8");
}

// Save job (backward compatibility - saves to project by default)
export async function saveJob(jobId: string, job: Job): Promise<void> {
  await saveProjectJob(jobId, job);
}

// Sleep utility that actually waits
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Execute osascript command and wait for it to complete
// Use stdin to pass AppleScript to avoid shell escaping issues
function executeOsascript(applescript: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn("osascript", ["-"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderr = "";
    process.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    // Write AppleScript to stdin
    process.stdin?.write(applescript);
    process.stdin?.end();

    process.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `osascript exited with code ${code}${stderr ? `: ${stderr}` : ""}`
          )
        );
      }
    });

    process.on("error", (error) => {
      reject(error);
    });
  });
}

// Self-Prompt Scheduling - Using stdin to avoid shell escaping issues
// This is more reliable for complex text with quotes and special characters
export async function scheduleSelfPrompt(
  text: string,
  isCommand: boolean = false
): Promise<void> {
  // Escape for AppleScript string (inside double quotes)
  // Only need to escape for AppleScript, not shell (since we use stdin)
  const escapedText = text
    .replace(/\\/g, "\\\\") // Escape backslashes first
    .replace(/"/g, '\\"') // Escape double quotes for AppleScript
    .replace(/\n/g, "\\n") // Handle newlines
    .replace(/\r/g, "\\r") // Handle carriage returns
    .replace(/\t/g, "\\t"); // Handle tabs

  // Use stdin to pass AppleScript directly - avoids all shell escaping issues
  const applescript = `tell application "System Events" to keystroke "${escapedText}"`;

  // Execute synchronously using spawnSync with stdin
  const { spawnSync } = await import("child_process");
  const typeResult = spawnSync("osascript", ["-"], {
    input: applescript,
    stdio: "pipe",
    encoding: "utf8",
  });

  if (typeResult.error) {
    throw new Error(`Failed to type text: ${typeResult.error.message}`);
  }
  if (typeResult.status !== 0) {
    const stderr = typeResult.stderr?.toString() || "";
    throw new Error(
      `osascript failed with code ${typeResult.status}: ${stderr}`
    );
  }

  // Wait after typing to ensure it's registered
  await sleep(500);

  // First Enter (select command or submit prompt)
  const enter1Script = `tell application "System Events" to keystroke return`;
  const enter1Result = spawnSync("osascript", ["-"], {
    input: enter1Script,
    stdio: "pipe",
    encoding: "utf8",
  });

  if (enter1Result.error) {
    throw new Error(`Failed to press Enter: ${enter1Result.error.message}`);
  }
  if (enter1Result.status !== 0) {
    const stderr = enter1Result.stderr?.toString() || "";
    throw new Error(
      `osascript failed with code ${enter1Result.status}: ${stderr}`
    );
  }

  // Wait after first Enter - longer for long texts to ensure everything is processed
  const textLength = text.length;
  const waitTime = textLength > 200 ? 3000 : textLength > 100 ? 2000 : 1000;
  await sleep(waitTime);

  // Second Enter (only for commands, to submit)
  if (isCommand) {
    const enter2Script = `tell application "System Events" to keystroke return`;
    const enter2Result = spawnSync("osascript", ["-"], {
      input: enter2Script,
      stdio: "pipe",
      encoding: "utf8",
    });

    if (enter2Result.error) {
      throw new Error(`Failed to press Enter: ${enter2Result.error.message}`);
    }
    if (enter2Result.status !== 0) {
      const stderr = enter2Result.stderr?.toString() || "";
      throw new Error(
        `osascript failed with code ${enter2Result.status}: ${stderr}`
      );
    }

    // Wait after second Enter
    await sleep(1000);
  }
}

// Spawn Agent with Job - Opens new Cursor window and executes job tasks sequentially
// Uses await/sleep pattern for reliable sequential execution (like scheduleJob)
export async function spawnAgentWithJob(
  jobId: string,
  agentId: string
): Promise<void> {
  // Load the job
  const job = await loadJob(jobId);

  // Use job goal as the initial prompt, with clarification message
  const goalWithClarification = `${job.goal}\n\nThis is just the goal, don't start working yet - this is only for your understanding.`;
  const encodedPrompt = urlEncode(goalWithClarification);
  const url = `https://cursor.com/link/prompt?text=${encodedPrompt}`;

  // Open URL in new Cursor window
  const { spawnSync } = await import("child_process");
  const openResult = spawnSync("open", [url], {
    stdio: "pipe",
  });

  if (openResult.error) {
    throw new Error(`Failed to open URL: ${openResult.error.message}`);
  }

  // Wait for Cursor window to open and be ready
  await sleep(2000);

  // Ensure Cursor is the active application and window is focused
  // This helps ensure keystrokes go to the correct window
  const activateScript = `tell application "Cursor" to activate`;
  const activateResult = spawnSync("osascript", ["-"], {
    input: activateScript,
    stdio: "pipe",
    encoding: "utf8",
  });

  if (activateResult.error) {
    // Non-fatal - continue anyway
    console.warn("Warning: Could not activate Cursor window");
  }

  await sleep(500);

  // Submit the initial prompt (Enter twice - same pattern as spawnAgent)
  const enter1Script = `tell application "System Events" to keystroke return`;
  const enter1Result = spawnSync("osascript", ["-"], {
    input: enter1Script,
    stdio: "pipe",
    encoding: "utf8",
  });

  if (enter1Result.error) {
    throw new Error(`Failed to press Enter: ${enter1Result.error.message}`);
  }
  if (enter1Result.status !== 0) {
    const stderr = enter1Result.stderr?.toString() || "";
    throw new Error(
      `osascript failed with code ${enter1Result.status}: ${stderr}`
    );
  }

  // Wait longer for goal submission (long text)
  await sleep(3000);

  // Second Enter to submit
  const enter2Script = `tell application "System Events" to keystroke return`;
  const enter2Result = spawnSync("osascript", ["-"], {
    input: enter2Script,
    stdio: "pipe",
    encoding: "utf8",
  });

  if (enter2Result.error) {
    throw new Error(`Failed to press Enter: ${enter2Result.error.message}`);
  }
  if (enter2Result.status !== 0) {
    const stderr = enter2Result.stderr?.toString() || "";
    throw new Error(
      `osascript failed with code ${enter2Result.status}: ${stderr}`
    );
  }

  // Wait longer after goal submission (long text)
  await sleep(3000);

  // Send job overview message before starting tasks
  const taskNames = job.tasks.map((t, i) => `${i + 1}. ${t.name}`).join("\n");
  const overviewPrompt = `This job consists of ${job.tasks.length} task(s) that you will tackle step by step:\n\n${taskNames}\n\nPlease acknowledge by saying "okay" or "understood" when you're ready to begin.\n\nThis is your general task. Don't start working yet - wait for me to send you the specific tasks one by one.`;

  await scheduleSelfPrompt(overviewPrompt, false);
  // Wait based on number of tasks to ensure the list is fully processed (1 second per task)
  const taskListDelay = job.tasks.length * 1000;
  await sleep(Math.max(3000, taskListDelay)); // At least 3 seconds, or 1 second per task

  // Validate all tasks upfront before starting execution
  const allTaskTypes = await loadTaskTypes();
  const taskErrors: Array<{
    taskIndex: number;
    taskName: string;
    error: string;
  }> = [];

  for (const [taskIndex, task] of job.tasks.entries()) {
    // Validate task type exists
    if (!(task.type in allTaskTypes)) {
      taskErrors.push({
        taskIndex: taskIndex + 1,
        taskName: task.name,
        error: `Task type "${task.type}" not found`,
      });
      continue;
    }

    // Get commands for this task type
    const commands = await getTaskTypeCommands(task.type);
    if (commands.length === 0) {
      taskErrors.push({
        taskIndex: taskIndex + 1,
        taskName: task.name,
        error: `Task type "${task.type}" has no commands defined`,
      });
      continue;
    }

    // Validate all commands exist
    const missing = await validateCommandsExist(commands);
    if (missing.length > 0) {
      taskErrors.push({
        taskIndex: taskIndex + 1,
        taskName: task.name,
        error: `Missing commands: ${missing.join(", ")}`,
      });
      continue;
    }
  }

  // Report all errors if any
  if (taskErrors.length > 0) {
    console.error(
      `\n❌ Validation failed for agent ${agentId}! Found errors in the following tasks:\n`
    );
    for (const error of taskErrors) {
      console.error(
        `  Task ${error.taskIndex} (${error.taskName}): ${error.error}`
      );
    }
    console.error(
      `\n  Run 'csa validate-job ${jobId}' to validate the job before spawning.\n`
    );
    throw new Error(
      `Job validation failed: ${taskErrors.length} task(s) have errors`
    );
  }

  // Now execute all tasks from the job sequentially (using await/sleep pattern)
  console.log(`\n📋 Executing ${job.tasks.length} task(s) from job...\n`);

  for (const [taskIndex, task] of job.tasks.entries()) {
    console.log(
      `\n📌 Task ${taskIndex + 1}/${job.tasks.length}: ${task.name} (type: ${
        task.type
      })`
    );

    // Get commands for this task type
    const commands = await getTaskTypeCommands(task.type);

    if (commands.length === 0) {
      console.warn(
        `⚠️  Skipping task "${task.name}": Task type "${task.type}" not found or has no commands.`
      );
      console.warn(
        `   Available task types: Run 'csa task-types list' to see all available types.`
      );
      continue; // Skip tasks with no commands
    }

    // Validate all commands exist
    const missing = await validateCommandsExist(commands);
    if (missing.length > 0) {
      console.warn(
        `⚠️  Skipping task "${task.name}": Missing commands: ${missing.join(
          ", "
        )}`
      );
      continue; // Skip tasks with missing commands
    }

    console.log(`   Commands: ${commands.join(" → ")}`);

    // Create kickoff prompt
    const filesList =
      task.files.length === 1
        ? task.files[0]
        : task.files.map((f, i) => `${i + 1}. ${f}`).join("\n");
    const filesInstruction =
      task.files.length === 1
        ? `You are expected to read ${task.files[0]}.`
        : `You are expected to read the following files:\n${filesList}`;
    const kickoffPrompt = `You have the following task: ${task.prompt}. ${filesInstruction} Task type: ${task.type}.\n\nDon't start working yet - wait for me to send you the commands.`;

    // Schedule kickoff prompt (waits for completion)
    await scheduleSelfPrompt(kickoffPrompt, false);

    // Wait between kickoff and first command
    await sleep(1000);

    // Schedule each command sequentially (waits for each to complete)
    for (const [cmdIndex, command] of commands.entries()) {
      const commandText = `/${command}`;
      await scheduleSelfPrompt(commandText, true);

      // Wait between commands (except after the last one)
      if (cmdIndex < commands.length - 1) {
        await sleep(1000);
      }
    }

    // Wait between tasks (except after the last one)
    console.log(`   ✅ Task ${taskIndex + 1} scheduled`);
    if (taskIndex < job.tasks.length - 1) {
      await sleep(1000);
    }
  }

  console.log(`\n✅ All tasks scheduled for agent ${agentId}\n`);

  // Append final prompt to tell agent to complete their work
  const completePrompt = `\n\nExecute this command to hand in your work: csa complete ${agentId}`;
  await scheduleSelfPrompt(completePrompt, false);
  await sleep(1000);

  const summaryPrompt = `\n\nSummarize what you have learned, and what you have done. Short and concise.`;
  await scheduleSelfPrompt(summaryPrompt, false);
  await sleep(1000);
}
