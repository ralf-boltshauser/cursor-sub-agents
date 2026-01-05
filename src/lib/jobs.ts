import { promises as fs } from "fs";
import path from "path";
import { Job, isJob } from "../types.js";
import { GLOBAL_JOBS_DIR, PROJECT_JOBS_DIR } from "./constants.js";
import { ensureStateDir } from "./state.js";
import { JobValidationError, validateJobStructure } from "./validation.js";

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
): Promise<{ job: unknown; jobFile: string }> {
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

  // Use type guard to ensure type safety
  if (!isJob(job)) {
    throw new Error(
      `Job validation failed: Structure validation passed but type guard failed`
    );
  }
  return job;
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

  // Use type guard to ensure type safety
  if (!isJob(job)) {
    throw new Error(
      `Job validation failed: Structure validation passed but type guard failed`
    );
  }
  return job;
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
