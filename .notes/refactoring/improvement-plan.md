# Codebase Improvement Plan

## Review Findings

### 1. File Organization Issues

**Problem:** `src/utils.ts` is too large (1386 lines, 57 exports)
- Contains: state management, job management, task types, commands, validation, spawning logic
- Hard to navigate and maintain
- Violates single responsibility principle

**Solution:** Split into logical modules:
- `src/lib/state.ts` - State management (loadState, saveState, cleanupOldSessions)
- `src/lib/jobs.ts` - Job file operations (loadJob, saveJob, listJobs, etc.)
- `src/lib/tasks.ts` - Task type management (loadTaskTypes, saveTaskTypes, etc.)
- `src/lib/commands.ts` - Command file operations (getAllAvailableCommands, validateCommandsExist)
- `src/lib/validation.ts` - All validation logic (validateJobStructure, validateTaskStructure, etc.)
- `src/lib/spawning.ts` - Agent spawning logic (spawnAgent, spawnAgentWithJob, scheduleSelfPrompt)
- `src/lib/config.ts` - Configuration management (loadConfig, saveConfig, getFollowUpPrompts)
- `src/lib/constants.ts` - All constants (paths, defaults, magic numbers)
- `src/lib/utils.ts` - Small utility functions (generateId, sleep, urlEncode, etc.)

### 2. Code Duplication - Task Validation

**Problem:** Task validation logic is duplicated in 3 places:
- `src/commands/validate-job.ts` (lines 72-111)
- `src/commands/execute.ts` (lines 79-146)
- `src/utils.ts` spawnAgentWithJob (lines 1248-1285)

**Solution:** Create `validateTaskStructure()` function in validation module:
```typescript
export interface TaskValidationError {
  taskIndex: number;
  taskName: string;
  error: string;
}

export function validateTaskStructure(
  task: Task,
  taskIndex: number,
  allTaskTypes: TaskTypeMapping
): TaskValidationError | null;

export async function validateAllTasks(
  tasks: Task[],
  allTaskTypes: TaskTypeMapping
): Promise<TaskValidationError[]>;
```

### 3. Error Handling Inconsistency

**Problem:** Error handling patterns vary:
- Some use `console.error + process.exit(1)`
- Some use `throw new Error`
- Error messages formatted differently
- No consistent error types

**Solution:** Create error handling utilities:
- `src/lib/errors.ts` - Custom error classes and error formatting
- Standardize error messages
- Create error handler wrapper for commands

### 4. Constants Scattered

**Problem:** Constants defined inline throughout codebase:
- Path constants in utils.ts
- Magic numbers (sleep delays, timeouts)
- Default values scattered

**Solution:** Create `src/lib/constants.ts`:
- All path constants
- Timeout/delay constants
- Default values
- Configuration defaults

### 5. Validation Logic Scattered

**Problem:** Validation logic spread across multiple files:
- Job validation in utils.ts
- Task validation duplicated in 3 places
- Command validation in utils.ts
- No centralized validation module

**Solution:** Create `src/lib/validation.ts`:
- `validateJobStructure()` - already exists, move here
- `validateTaskStructure()` - new, consolidate duplicated logic
- `validateCommandsExist()` - move from utils
- `validateTaskType()` - validate task type exists and has commands
- Type guards (isJob, isTask) - already in types.ts, keep there

### 6. Import Organization

**Problem:** Imports not consistently organized
- Some files have long import lists
- No clear import grouping

**Solution:** Standardize import order:
1. External packages
2. Internal types
3. Internal utilities
4. Internal commands/adapters

## Implementation Plan

### Phase 1: Extract Constants
1. Create `src/lib/constants.ts`
2. Move all constants from utils.ts
3. Update all imports

### Phase 2: Create Validation Module
1. Create `src/lib/validation.ts`
2. Move `validateJobStructure()` from utils.ts
3. Create `validateTaskStructure()` to consolidate duplicated logic
4. Move `validateCommandsExist()` from utils.ts
5. Update all callers to use new module

### Phase 3: Split utils.ts
1. Create new module files (state, jobs, tasks, commands, spawning, config)
2. Move functions to appropriate modules
3. Update all imports across codebase
4. Keep small utilities in utils.ts

### Phase 4: Standardize Error Handling
1. Create error handling utilities
2. Create custom error classes
3. Update commands to use standardized error handling

### Phase 5: Clean Up
1. Remove unused imports
2. Organize imports consistently
3. Update documentation

## Benefits

1. **Maintainability:** Smaller, focused files are easier to understand and modify
2. **Reusability:** Consolidated validation logic reduces duplication
3. **Testability:** Smaller modules are easier to test
4. **Discoverability:** Clear module structure makes it easier to find code
5. **Consistency:** Standardized error handling and validation patterns

## Files to Create

- `src/lib/constants.ts`
- `src/lib/validation.ts`
- `src/lib/state.ts`
- `src/lib/jobs.ts`
- `src/lib/tasks.ts`
- `src/lib/commands.ts`
- `src/lib/spawning.ts`
- `src/lib/config.ts`
- `src/lib/errors.ts` (optional, for error handling)

## Files to Modify

- `src/utils.ts` - Split into modules, keep only small utilities
- All command files - Update imports
- All adapter files - Update imports if needed
