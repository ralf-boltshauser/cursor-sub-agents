import { Task } from "../types.js";
import { validateCommandsExist } from "./commands.js";
import { TaskTypeMapping } from "./tasks.js";

/**
 * Structure for job validation errors
 */
export interface JobValidationError {
  errors: string[];
  jobId: string;
  jobFile: string;
}

/**
 * Structure for task validation errors
 */
export interface TaskValidationError {
  taskIndex: number;
  taskName: string;
  error: string;
}

/**
 * Validate job structure and return specific error messages
 */
export function validateJobStructure(job: unknown, jobId: string): string[] {
  const errors: string[] = [];

  if (!job) {
    errors.push("Job is null or undefined");
    return errors;
  }

  if (typeof job !== "object") {
    errors.push("Job must be an object");
    return errors;
  }

  const jobObj = job as Record<string, unknown>;

  if (!jobObj.id) {
    errors.push("Job missing 'id' field");
  } else if (typeof jobObj.id !== "string") {
    errors.push("Job 'id' field must be a string");
  } else if (jobObj.id !== jobId) {
    // This is a warning-level issue, but we'll include it in errors for consistency
    errors.push(
      `Job ID mismatch: job.json has '${jobObj.id}' but expected '${jobId}'`
    );
  }

  if (!jobObj.goal) {
    errors.push("Job missing 'goal' field");
  } else if (typeof jobObj.goal !== "string") {
    errors.push("Job 'goal' field must be a string");
  }

  if (!jobObj.tasks) {
    errors.push("Job missing 'tasks' field");
  } else if (!Array.isArray(jobObj.tasks)) {
    errors.push("Job 'tasks' must be an array");
  } else if (jobObj.tasks.length === 0) {
    errors.push("Job has no tasks");
  }

  return errors;
}

/**
 * Validate task structure and return error if invalid
 * Returns null if task is valid, or a TaskValidationError if invalid
 */
export function validateTaskStructure(
  task: Task,
  taskIndex: number,
  allTaskTypes: TaskTypeMapping
): TaskValidationError | null {
  // Validate task structure
  if (!task.name) {
    return {
      taskIndex: taskIndex + 1,
      taskName: "unnamed",
      error: "Task missing 'name' field",
    };
  }

  if (!task.type) {
    return {
      taskIndex: taskIndex + 1,
      taskName: task.name,
      error: "Task missing 'type' field",
    };
  }

  if (!Array.isArray(task.files)) {
    return {
      taskIndex: taskIndex + 1,
      taskName: task.name,
      error: "Task 'files' must be an array",
    };
  }

  if (!task.prompt) {
    return {
      taskIndex: taskIndex + 1,
      taskName: task.name,
      error: "Task missing 'prompt' field",
    };
  }

  // Validate task type exists
  if (!(task.type in allTaskTypes)) {
    return {
      taskIndex: taskIndex + 1,
      taskName: task.name,
      error: `Task type "${
        task.type
      }" not found. Available types: ${Object.keys(allTaskTypes).join(", ")}`,
    };
  }

  return null;
}

/**
 * Validate all tasks in a job
 * Returns array of validation errors (empty if all valid)
 */
export async function validateAllTasks(
  tasks: Task[],
  allTaskTypes: TaskTypeMapping
): Promise<TaskValidationError[]> {
  const errors: TaskValidationError[] = [];

  for (const [taskIndex, task] of tasks.entries()) {
    // Validate task structure
    const structureError = validateTaskStructure(task, taskIndex, allTaskTypes);
    if (structureError) {
      errors.push(structureError);
      continue;
    }

    // Get commands for this task type
    const commands = allTaskTypes[task.type] || [];
    if (commands.length === 0) {
      errors.push({
        taskIndex: taskIndex + 1,
        taskName: task.name,
        error: `Task type "${task.type}" has no commands defined`,
      });
      continue;
    }

    // Validate all commands exist
    const missing = await validateCommandsExist(commands);
    if (missing.length > 0) {
      errors.push({
        taskIndex: taskIndex + 1,
        taskName: task.name,
        error: `Missing commands: ${missing.join(", ")}`,
      });
    }
  }

  return errors;
}
