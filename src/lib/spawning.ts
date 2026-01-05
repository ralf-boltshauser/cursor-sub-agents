import { spawn } from "child_process";
import { getPlatformAdapter } from "../platform-adapter.js";
import { sleep, urlEncode } from "../utils.js";
import { validateCommandsExist } from "./commands.js";
import { getFollowUpPromptsAsync } from "./config.js";
import {
  ACTIVATION_DELAY_MS,
  ENTER1_DELAY_OFFSET,
  ENTER2_DELAY_OFFSET,
  ENTER_DELAY_MS,
  FOLLOW_UP_INTERVAL_SECONDS,
  FOLLOW_UP_START_DELAY_OFFSET,
  GOAL_SUBMISSION_WAIT_MS,
  LONG_TEXT_THRESHOLD,
  LONG_TEXT_WAIT_MS,
  MEDIUM_TEXT_THRESHOLD,
  MEDIUM_TEXT_WAIT_MS,
  MIN_TASK_LIST_DELAY_MS,
  MIN_TYPING_TIME_MS,
  SHORT_TEXT_WAIT_MS,
  TASK_LIST_DELAY_PER_TASK_MS,
  TYPING_DELAY_MS,
  TYPING_TIME_PER_CHAR_MS,
} from "./constants.js";
import { loadJob } from "./jobs.js";
import { getTaskTypeCommands, loadTaskTypes } from "./tasks.js";
import { validateAllTasks } from "./validation.js";

export async function spawnAgent(
  prompt: string,
  agentId: string,
  delaySeconds: number = 0,
  followUpPrompts?: string[]
): Promise<void> {
  const adapter = getPlatformAdapter();

  // Use only the original prompt in the URL (no appended completion instructions)
  const encodedPrompt = urlEncode(prompt);
  const url = `https://cursor.com/link/prompt?text=${encodedPrompt}`;

  // Get follow-up prompts (from parameter, config files, env var, or defaults)
  const followUps = followUpPrompts || (await getFollowUpPromptsAsync(agentId));

  // Sequential pattern: open link -> wait 2s -> Enter -> wait 2s -> Enter -> wait 2s -> follow-up prompts
  // Each agent gets: open at delaySeconds, Enter1 at delaySeconds+2, Enter2 at delaySeconds+4, then follow-ups
  // Each follow-up takes 4 seconds: 1s to type + 1s delay + 2s before next
  const openDelay = delaySeconds;
  const enter1Delay = delaySeconds + ENTER1_DELAY_OFFSET;
  const enter2Delay = delaySeconds + ENTER2_DELAY_OFFSET;
  let currentDelay = delaySeconds + FOLLOW_UP_START_DELAY_OFFSET; // Start follow-ups after the two Enters

  // Open URL at scheduled time
  if (openDelay > 0) {
    const { shell, args } = adapter.buildDelayedOpenUrlCommand(url, openDelay);
    spawn(shell, args, {
      detached: true,
      stdio: "ignore",
    }).unref();
  } else {
    // Open immediately
    adapter.openUrl(url).catch((err) => {
      console.error(`Failed to open URL: ${err.message}`);
    });
  }

  // First Enter press
  const enter1Cmd = adapter.buildDelayedEnterCommand(enter1Delay);
  spawn(enter1Cmd.shell, enter1Cmd.args, {
    detached: true,
    stdio: "ignore",
  }).unref();

  // Second Enter press
  const enter2Cmd = adapter.buildDelayedEnterCommand(enter2Delay);
  spawn(enter2Cmd.shell, enter2Cmd.args, {
    detached: true,
    stdio: "ignore",
  }).unref();

  // Send follow-up prompts via platform-specific keystrokes
  // Each prompt: type text -> wait -> press Enter -> wait before next
  followUps.forEach((followUp, index) => {
    const typeDelay = currentDelay + index * FOLLOW_UP_INTERVAL_SECONDS; // Start typing at this time
    // Estimate typing time: ~0.1s per 10 characters, minimum 0.5s
    const typingTime = Math.max(
      MIN_TYPING_TIME_MS / 1000,
      followUp.length * TYPING_TIME_PER_CHAR_MS
    );
    const enterDelay = typeDelay + typingTime; // Press Enter after typing completes

    // Type the prompt text
    const typeCmd = adapter.buildDelayedTypeTextCommand(followUp, typeDelay);
    spawn(typeCmd.shell, typeCmd.args, {
      detached: true,
      stdio: "ignore",
    }).unref();

    // Press Enter after typing completes
    const enterCmd = adapter.buildDelayedEnterCommand(enterDelay);
    spawn(enterCmd.shell, enterCmd.args, {
      detached: true,
      stdio: "ignore",
    }).unref();
  });
}

// Self-Prompt Scheduling - Using platform adapter for cross-platform support
// This is more reliable for complex text with quotes and special characters
export async function scheduleSelfPrompt(
  text: string,
  isCommand: boolean = false
): Promise<void> {
  const adapter = getPlatformAdapter();

  try {
    // Ensure Cursor is the active application and window is focused
    // This helps ensure keystrokes go to the correct window
    try {
      await adapter.activateCursor();
      await sleep(ACTIVATION_DELAY_MS); // Small delay to ensure window is focused
    } catch (error) {
      // Non-fatal - continue anyway, keystrokes might still work
      console.warn(
        `Warning: Could not activate Cursor window before typing: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    // Type the text using platform adapter (handles escaping automatically)
    await adapter.typeText(text);

    // Wait after typing to ensure it's registered
    await sleep(TYPING_DELAY_MS);

    // First Enter (select command or submit prompt)
    await adapter.pressEnter();

    // Wait after first Enter - longer for long texts to ensure everything is processed
    const textLength = text.length;
    const waitTime =
      textLength > LONG_TEXT_THRESHOLD
        ? LONG_TEXT_WAIT_MS
        : textLength > MEDIUM_TEXT_THRESHOLD
        ? MEDIUM_TEXT_WAIT_MS
        : SHORT_TEXT_WAIT_MS;
    await sleep(waitTime);

    // Second Enter (only for commands, to submit)
    if (isCommand) {
      await adapter.pressEnter();

      // Wait after second Enter
      await sleep(ENTER_DELAY_MS);
    }
  } catch (error) {
    console.error(
      `Failed to schedule self-prompt: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throw error; // Re-throw to allow caller to handle
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

  // Open URL in new Cursor window using platform adapter
  const adapter = getPlatformAdapter();
  try {
    await adapter.openUrl(url);
  } catch (error) {
    console.error(
      `Failed to open URL for job: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throw error;
  }

  // Wait for Cursor window to open and be ready
  await sleep(2000);

  // Ensure Cursor is the active application and window is focused
  // This helps ensure keystrokes go to the correct window
  try {
    await adapter.activateCursor();
  } catch (error) {
    console.warn(
      `Warning: Could not activate Cursor window: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    // Continue anyway - keystrokes might still work
  }

  await sleep(500);

  // Submit the initial prompt (Enter twice - same pattern as spawnAgent)
  try {
    await adapter.pressEnter();

    // Wait longer for goal submission (long text)
    await sleep(GOAL_SUBMISSION_WAIT_MS);

    // Second Enter to submit
    await adapter.pressEnter();
  } catch (error) {
    console.error(
      `Failed to submit initial prompt: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throw error;
  }

  // Wait longer after goal submission (long text)
  await sleep(GOAL_SUBMISSION_WAIT_MS);

  // Send job overview message before starting tasks
  const taskNames = job.tasks.map((t, i) => `${i + 1}. ${t.name}`).join("\n");
  const overviewPrompt = `This job consists of ${job.tasks.length} task(s) that you will tackle step by step:\n\n${taskNames}\n\nPlease acknowledge by saying "okay" or "understood" when you're ready to begin.\n\nThis is your general task. Don't start working yet - wait for me to send you the specific tasks one by one.`;

  await scheduleSelfPrompt(overviewPrompt, false);
  // Wait based on number of tasks to ensure the list is fully processed (1 second per task)
  const taskListDelay = job.tasks.length * TASK_LIST_DELAY_PER_TASK_MS;
  await sleep(Math.max(MIN_TASK_LIST_DELAY_MS, taskListDelay)); // At least 3 seconds, or 1 second per task

  // Validate all tasks upfront before starting execution
  const allTaskTypes = await loadTaskTypes();
  const taskErrors = await validateAllTasks(job.tasks, allTaskTypes);

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
    await sleep(ENTER_DELAY_MS);

    // Schedule each command sequentially (waits for each to complete)
    for (const [cmdIndex, command] of commands.entries()) {
      const commandText = `/${command}`;
      await scheduleSelfPrompt(commandText, true);

      // Wait between commands (except after the last one)
      if (cmdIndex < commands.length - 1) {
        await sleep(ENTER_DELAY_MS);
      }
    }

    // Wait between tasks (except after the last one)
    console.log(`   ✅ Task ${taskIndex + 1} scheduled`);
    if (taskIndex < job.tasks.length - 1) {
      await sleep(ENTER_DELAY_MS);
    }
  }

  console.log(`\n✅ All tasks scheduled for agent ${agentId}\n`);

  // Append final prompt to tell agent to complete their work
  const completePrompt = `\n\nExecute this command to hand in your work: csa complete ${agentId}`;
  await scheduleSelfPrompt(completePrompt, false);
  await sleep(ENTER_DELAY_MS);

  const summaryPrompt = `\n\nSummarize what you have learned, and what you have done. Short and concise.`;
  await scheduleSelfPrompt(summaryPrompt, false);
  await sleep(ENTER_DELAY_MS);
}
