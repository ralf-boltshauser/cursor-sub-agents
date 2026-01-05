export interface AgentState {
  id: string;
  prompt: string;
  status:
    | "running"
    | "pending_verification"
    | "feedback_requested"
    | "approved"
    | "completed"
    | "failed"
    | "timeout";
  startedAt: string;
  completedAt?: string;
  returnMessage?: string;
  error?: string;
  repository?: string; // Working directory where agent was started
  // Feedback loop fields
  submittedAt?: string; // When agent called complete
  verifiedAt?: string; // When orchestrator last reviewed
  feedback?: string; // Latest feedback message from orchestrator
  feedbackCount?: number; // How many feedback rounds (0 = first submission)
}

export interface AgentsRegistry {
  sessions: {
    [sessionId: string]: {
      agents: AgentState[];
      createdAt: string;
      completedAt?: string;
    };
  };
}

export interface Task {
  name: string;
  type: string;
  files: string[];
  prompt: string;
}

export interface Job {
  id: string;
  goal: string;
  tasks: Task[];
}

/**
 * Session type extracted from AgentsRegistry
 */
export type Session = AgentsRegistry["sessions"][string];

/**
 * Type guard to check if a value is a valid Task
 */
export function isTask(value: unknown): value is Task {
  if (!value || typeof value !== "object") {
    return false;
  }
  const task = value as Record<string, unknown>;
  return (
    typeof task.name === "string" &&
    typeof task.type === "string" &&
    Array.isArray(task.files) &&
    task.files.every((f: unknown) => typeof f === "string") &&
    typeof task.prompt === "string"
  );
}

/**
 * Type guard to check if a value is a valid Job
 */
export function isJob(value: unknown): value is Job {
  if (!value || typeof value !== "object") {
    return false;
  }
  const job = value as Record<string, unknown>;
  return (
    typeof job.id === "string" &&
    typeof job.goal === "string" &&
    Array.isArray(job.tasks) &&
    job.tasks.every((t: unknown) => isTask(t))
  );
}
