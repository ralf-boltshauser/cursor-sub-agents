import { promises as fs } from "fs";
import path from "path";
import {
  GLOBAL_TASK_TYPES_FILE,
  PROJECT_TASK_TYPES_FILE,
} from "./constants.js";

// Task Types Configuration
export interface TaskTypeMapping {
  [taskType: string]: string[];
}

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
    const { ensureStateDir } = await import("./state.js");
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
  const { ensureStateDir } = await import("./state.js");
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
