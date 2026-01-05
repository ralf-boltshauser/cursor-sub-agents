import os from "os";
import path from "path";

// State directory and file paths
export const STATE_DIR = path.join(os.homedir(), ".csa");
export const STATE_FILE = path.join(STATE_DIR, "state.json");

// Lock options for file locking
export const LOCK_OPTIONS = {
  retries: {
    retries: 10,
    minTimeout: 100,
    maxTimeout: 1000,
  },
};

// Config file paths
export const GLOBAL_CONFIG_FILE = path.join(STATE_DIR, "config.json");
export const LOCAL_CONFIG_FILE = path.join(
  process.cwd(),
  ".csa",
  "config.json"
);

// Default follow-up prompts
export const DEFAULT_FOLLOW_UP_PROMPTS = [
  "Verify if the changes you have implemented are actually working and align with the instructions provided!",
  "to hand off your work run the following command: csa complete {agentId}",
];

// Task types file paths
export const GLOBAL_TASK_TYPES_FILE = path.join(STATE_DIR, "task-types.json");
export const PROJECT_TASK_TYPES_FILE = path.join(
  process.cwd(),
  ".csa",
  "task-types.json"
);

// Commands directory paths
export const GLOBAL_COMMANDS_DIR = path.join(
  os.homedir(),
  ".cursor",
  "commands"
);
export const PROJECT_COMMANDS_DIR = path.join(
  process.cwd(),
  ".cursor",
  "commands"
);

// Jobs directory paths
export const GLOBAL_JOBS_DIR = path.join(STATE_DIR, "jobs");
export const PROJECT_JOBS_DIR = path.join(process.cwd(), ".csa", "jobs");

// Time constants (in milliseconds)
export const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

// Delay constants (in milliseconds)
export const ACTIVATION_DELAY_MS = 200;
export const TYPING_DELAY_MS = 500;
export const ENTER_DELAY_MS = 1000;
export const LONG_TEXT_THRESHOLD = 200;
export const MEDIUM_TEXT_THRESHOLD = 100;
export const LONG_TEXT_WAIT_MS = 3000;
export const MEDIUM_TEXT_WAIT_MS = 2000;
export const SHORT_TEXT_WAIT_MS = 1000;
export const GOAL_SUBMISSION_WAIT_MS = 3000;
export const TASK_LIST_DELAY_PER_TASK_MS = 1000;
export const MIN_TASK_LIST_DELAY_MS = 3000;

// Spawn agent delay constants (in seconds)
export const ENTER1_DELAY_OFFSET = 2;
export const ENTER2_DELAY_OFFSET = 4;
export const FOLLOW_UP_START_DELAY_OFFSET = 6;
export const FOLLOW_UP_INTERVAL_SECONDS = 4;
export const TYPING_TIME_PER_CHAR_MS = 0.01;
export const MIN_TYPING_TIME_MS = 500;

// ID generation defaults
export const DEFAULT_ID_LENGTH = 6;
export const SESSION_ID_LENGTH = 8;
export const AGENT_ID_LENGTH = 6;
