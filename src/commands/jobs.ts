import chalk from "chalk";
import { promises as fs } from "fs";
import inquirer from "inquirer";
import os from "os";
import path from "path";
import readline from "readline";
import {
  ensureGlobalJobsDir,
  ensureProjectJobsDir,
  getJobLocation,
  listAllJobs,
  listGlobalJobs,
  listProjectJobs,
  loadJob,
  loadTaskTypes,
  saveGlobalJob,
  saveProjectJob,
} from "../utils.js";
import { type Job, type Task } from "../types.js";

function question(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// List all jobs (global + local) with source indicators
export async function listJobs(): Promise<void> {
  await ensureGlobalJobsDir();
  await ensureProjectJobsDir();

  const allJobs = await listAllJobs();
  const globalJobs = await listGlobalJobs();
  const projectJobs = await listProjectJobs();

  console.log(chalk.blue("\n📋 Jobs\n"));

  if (allJobs.length === 0) {
    console.log(chalk.gray("  No jobs defined."));
    console.log(chalk.gray("  Use 'csa jobs add <name>' to create one.\n"));
    return;
  }

  // Show all jobs with their locations
  console.log(chalk.green("Available Jobs (local overrides global):\n"));

  for (const { jobId, location } of allJobs) {
    const locationColor = location === "local" ? chalk.cyan : chalk.yellow;
    const locationText = locationColor(`[${location}]`);

    try {
      const job = await loadJob(jobId);
      const tasksCount = job.tasks.length;
      const goalPreview =
        job.goal.length > 60 ? `${job.goal.substring(0, 60)}...` : job.goal;
      console.log(chalk.bold(`  ${jobId}`));
      console.log(chalk.gray(`    Source: ${locationText}`));
      console.log(chalk.gray(`    Goal: ${goalPreview}`));
      console.log(chalk.gray(`    Tasks: ${tasksCount}`));
      console.log();
    } catch (error) {
      console.log(chalk.bold(`  ${jobId}`));
      console.log(chalk.red(`    ⚠️  Error loading job: ${error instanceof Error ? error.message : String(error)}`));
      console.log();
    }
  }

  // Show summary
  const globalJobCount = globalJobs.length;
  const projectJobCount = projectJobs.length;
  const overriddenCount = projectJobs.filter((id) =>
    globalJobs.includes(id)
  ).length;

  console.log(chalk.gray("Summary:"));
  console.log(
    chalk.gray(
      `  • Global jobs: ${chalk.yellow(globalJobCount.toString())}`
    )
  );
  console.log(
    chalk.gray(
      `  • Project jobs: ${chalk.cyan(projectJobCount.toString())}`
    )
  );
  if (overriddenCount > 0) {
    console.log(
      chalk.gray(
        `  • Overridden by project: ${chalk.cyan(overriddenCount.toString())}`
      )
    );
  }
  console.log();
}

// Show details of a specific job
export async function showJob(jobId: string): Promise<void> {
  const location = await getJobLocation(jobId);

  if (!location) {
    console.error(chalk.red(`\n❌ Job "${jobId}" not found\n`));
    process.exit(1);
  }

  try {
    const job = await loadJob(jobId);
    const locationColor = location === "local" ? chalk.cyan : chalk.yellow;
    const locationText = locationColor(location);

    console.log(chalk.blue(`\n📋 Job: ${chalk.bold(jobId)}\n`));
    console.log(chalk.gray(`  Source: ${locationText}`));
    console.log(chalk.gray(`  Goal: ${job.goal}`));
    console.log(chalk.gray(`  Tasks: ${job.tasks.length}\n`));

    if (job.tasks.length > 0) {
      console.log(chalk.blue("  Tasks:\n"));
      job.tasks.forEach((task, index) => {
        console.log(
          chalk.gray(`    ${index + 1}. ${chalk.bold(task.name)}`)
        );
        console.log(chalk.gray(`       Type: ${task.type}`));
        console.log(
          chalk.gray(
            `       Files: ${task.files.length > 0 ? task.files.join(", ") : "none"}`
          )
        );
        const promptPreview =
          task.prompt.length > 80
            ? `${task.prompt.substring(0, 80)}...`
            : task.prompt;
        console.log(chalk.gray(`       Prompt: ${promptPreview}`));
        console.log();
      });
    }
  } catch (error) {
    console.error(
      chalk.red(
        `\n❌ Failed to load job: ${
          error instanceof Error ? error.message : String(error)
        }\n`
      )
    );
    process.exit(1);
  }
}

// Add a new job interactively
export async function addJob(
  jobId: string,
  isGlobal: boolean = false
): Promise<void> {
  const location = isGlobal ? "global" : "project";
  const locationText = isGlobal ? chalk.yellow("global") : chalk.cyan("project");

  // Check if job already exists
  const existingLocation = await getJobLocation(jobId);
  if (existingLocation) {
    const overwrite = await question(
      chalk.yellow(
        `Job "${jobId}" already exists (${existingLocation}). Overwrite? (y/N): `
      )
    );
    if (overwrite.toLowerCase().trim() !== "y") {
      console.log(chalk.gray("Cancelled."));
      return;
    }
  }

  console.log(chalk.blue(`\n📝 Adding job: ${chalk.bold(jobId)} (${locationText})\n`));

  // Get goal
  const goal = await question(chalk.yellow("Enter job goal: "));
  if (!goal.trim()) {
    console.error(chalk.red("Error: Goal cannot be empty"));
    return;
  }

  // Get task types for reference
  const taskTypes = await loadTaskTypes();
  const taskTypeNames = Object.keys(taskTypes);

  if (taskTypeNames.length === 0) {
    console.error(
      chalk.red(
        "\n❌ No task types found. Create task types first with 'csa task-types add'\n"
      )
    );
    return;
  }

  console.log(chalk.gray("\nAvailable task types:"));
  taskTypeNames.forEach((name) => {
    console.log(chalk.gray(`  • ${name}`));
  });
  console.log();

  // Get tasks
  const tasks: Task[] = [];
  let taskIndex = 1;

  while (true) {
    const addMore = await question(
      chalk.yellow(`Add task ${taskIndex}? (y/N): `)
    );
    if (addMore.toLowerCase().trim() !== "y") {
      break;
    }

    const taskName = await question(chalk.yellow("  Task name: "));
    if (!taskName.trim()) {
      console.log(chalk.red("  Error: Task name cannot be empty"));
      continue;
    }

    // Select task type
    const { taskType } = await inquirer.prompt([
      {
        type: "list",
        name: "taskType",
        message: "  Task type:",
        choices: taskTypeNames,
      },
    ]);

    // Get files
    const filesInput = await question(
      chalk.yellow("  Files (comma-separated, or empty): ")
    );
    const files =
      filesInput.trim() === ""
        ? []
        : filesInput.split(",").map((f) => f.trim()).filter((f) => f.length > 0);

    // Get prompt
    const taskPrompt = await question(chalk.yellow("  Task prompt: "));
    if (!taskPrompt.trim()) {
      console.log(chalk.red("  Error: Task prompt cannot be empty"));
      continue;
    }

    tasks.push({
      name: taskName.trim(),
      type: taskType,
      files,
      prompt: taskPrompt.trim(),
    });

    console.log(chalk.green(`  ✓ Added task: ${taskName.trim()}`));
    taskIndex++;
  }

  if (tasks.length === 0) {
    console.error(chalk.red("\n❌ No tasks provided. Cancelled.\n"));
    return;
  }

  // Create job object
  const job: Job = {
    id: jobId,
    goal: goal.trim(),
    tasks,
  };

  // Save job
  if (isGlobal) {
    await saveGlobalJob(jobId, job);
  } else {
    await saveProjectJob(jobId, job);
  }

  console.log(
    chalk.green(
      `\n✅ Job "${jobId}" added to ${location} configuration (${tasks.length} task(s))\n`
    )
  );
}

// Remove a job
export async function removeJob(
  jobId: string,
  isGlobal: boolean = false
): Promise<void> {
  const location = isGlobal ? "global" : "project";
  const locationText = isGlobal ? chalk.yellow("global") : chalk.cyan("project");

  const existingLocation = await getJobLocation(jobId);
  if (!existingLocation) {
    console.error(chalk.red(`\n❌ Job "${jobId}" not found\n`));
    process.exit(1);
  }

  if (existingLocation !== location) {
    console.error(
      chalk.red(
        `\n❌ Job "${jobId}" exists in ${existingLocation} location, not ${location}\n`
      )
    );
    process.exit(1);
  }

  const confirm = await question(
    chalk.yellow(
      `Remove job "${jobId}" from ${locationText}? This cannot be undone. (y/N): `
    )
  );
  if (confirm.toLowerCase().trim() !== "y") {
    console.log(chalk.gray("Cancelled."));
    return;
  }

  // Delete job directory
  const STATE_DIR = path.join(os.homedir(), ".csa");
  const GLOBAL_JOBS_DIR = path.join(STATE_DIR, "jobs");
  const PROJECT_JOBS_DIR = path.join(process.cwd(), ".csa", "jobs");

  const jobDir = isGlobal
    ? path.join(GLOBAL_JOBS_DIR, jobId)
    : path.join(PROJECT_JOBS_DIR, jobId);

  try {
    await fs.rm(jobDir, { recursive: true, force: true });
    console.log(
      chalk.green(
        `\n✅ Job "${jobId}" removed from ${locationText} configuration\n`
      )
    );
  } catch (error) {
    console.error(
      chalk.red(
        `\n❌ Failed to remove job: ${
          error instanceof Error ? error.message : String(error)
        }\n`
      )
    );
    process.exit(1);
  }
}

// Copy job between local/global
export async function copyJob(
  jobId: string,
  targetIsGlobal: boolean
): Promise<void> {
  const existingLocation = await getJobLocation(jobId);
  if (!existingLocation) {
    console.error(chalk.red(`\n❌ Job "${jobId}" not found\n`));
    process.exit(1);
  }

  const targetLocation = targetIsGlobal ? "global" : "project";
  const targetLocationText = targetIsGlobal
    ? chalk.yellow("global")
    : chalk.cyan("project");

  if (existingLocation === targetLocation) {
    console.error(
      chalk.red(
        `\n❌ Job "${jobId}" already exists in ${targetLocation} location\n`
      )
    );
    process.exit(1);
  }

  try {
    const job = await loadJob(jobId);

    if (targetIsGlobal) {
      await saveGlobalJob(jobId, job);
    } else {
      await saveProjectJob(jobId, job);
    }

    console.log(
      chalk.green(
        `\n✅ Job "${jobId}" copied to ${targetLocationText} configuration\n`
      )
    );
  } catch (error) {
    console.error(
      chalk.red(
        `\n❌ Failed to copy job: ${
          error instanceof Error ? error.message : String(error)
        }\n`
      )
    );
    process.exit(1);
  }
}

// Interactive mode
export async function interactiveJobs(): Promise<void> {
  await ensureGlobalJobsDir();
  await ensureProjectJobsDir();

  while (true) {
    console.log(chalk.blue("\n📋 Jobs Manager\n"));
    console.log(chalk.gray(" 1. List all jobs"));
    console.log(chalk.gray(" 2. Show job details"));
    console.log(chalk.gray(" 3. Add job"));
    console.log(chalk.gray(" 4. Remove job"));
    console.log(chalk.gray(" 5. Copy job"));
    console.log(chalk.gray(" 6. Exit\n"));

    const choice = await question(chalk.yellow("Select option (1-6): "));
    const choiceNum = parseInt(choice.trim(), 10);

    if (choiceNum === 1) {
      await listJobs();
    } else if (choiceNum === 2) {
      const jobId = await question(chalk.yellow("Job ID: "));
      await showJob(jobId.trim());
    } else if (choiceNum === 3) {
      const jobId = await question(chalk.yellow("Job ID: "));
      const location = await question(
        chalk.yellow("Location (g)lobal or (p)roject? [p]: ")
      );
      const isGlobal = location.toLowerCase().trim() === "g";
      await addJob(jobId.trim(), isGlobal);
    } else if (choiceNum === 4) {
      const jobId = await question(chalk.yellow("Job ID: "));
      const location = await question(
        chalk.yellow("Location (g)lobal or (p)roject? [p]: ")
      );
      const isGlobal = location.toLowerCase().trim() === "g";
      await removeJob(jobId.trim(), isGlobal);
    } else if (choiceNum === 5) {
      const jobId = await question(chalk.yellow("Job ID: "));
      const location = await question(
        chalk.yellow("Copy to (g)lobal or (p)roject? [p]: ")
      );
      const targetIsGlobal = location.toLowerCase().trim() === "g";
      await copyJob(jobId.trim(), targetIsGlobal);
    } else if (choiceNum === 6) {
      console.log(chalk.gray("\nGoodbye!\n"));
      break;
    } else {
      console.error(chalk.red("\n❌ Invalid option\n"));
    }
  }
}

