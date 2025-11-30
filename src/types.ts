export interface AgentState {
  id: string;
  prompt: string;
  status: 'running' | 'pending_verification' | 'feedback_requested' | 'approved' | 'completed' | 'failed' | 'timeout';
  startedAt: string;
  completedAt?: string;
  returnMessage?: string;
  error?: string;
  repository?: string; // Working directory where agent was started
  // Feedback loop fields
  submittedAt?: string;        // When agent called complete
  verifiedAt?: string;         // When orchestrator last reviewed
  feedback?: string;           // Latest feedback message from orchestrator
  feedbackCount?: number;      // How many feedback rounds (0 = first submission)
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
