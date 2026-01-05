# Type Safety Fix Plan

## Issues Found

### 1. `loadJobFileRaw()` returns `any`
**Location:** `src/utils.ts:851`
**Current:** `Promise<{ job: any; jobFile: string }>`
**Problem:** Using `any` bypasses type checking

**Fix:**
- Change return type to `Promise<{ job: unknown; jobFile: string }>`
- `unknown` is safer than `any` - requires type checking before use
- JSON.parse already returns `unknown`, so this is more accurate

### 2. `validateJobStructure()` accepts `any`
**Location:** `src/utils.ts:882`
**Current:** `validateJobStructure(job: any, jobId: string)`
**Problem:** Should accept `unknown` and use type guards

**Fix:**
- Change parameter to `job: unknown`
- The function already does runtime validation, so `unknown` is appropriate
- Add type guard function `isJob(job: unknown): job is Job` that uses the same validation logic
- Use the type guard in `loadAndValidateJob()` and `loadJob()` instead of `as Job` assertions

### 3. Local `job: any` variables
**Locations:**
- `src/commands/spawn-jobs.ts:41`
- `src/commands/execute.ts:25`
- `src/commands/validate-job.ts:15`

**Problem:** Using `any` before validation

**Fix:**
- Use the return type from `loadJobFileRaw()`: `{ job: unknown; jobFile: string }`
- Type will be `unknown` which is safer
- After validation, use type guard to narrow to `Job`

### 4. `displaySessionStatus()` accepts `any`
**Location:** `src/commands/wait.ts:238`
**Current:** `displaySessionStatus(sessionId: string, session: any)`

**Fix:**
- Extract session type from `AgentsRegistry`:
  ```typescript
  type Session = AgentsRegistry['sessions'][string];
  ```
- Or create explicit type:
  ```typescript
  type Session = {
    agents: AgentState[];
    createdAt: string;
    completedAt?: string;
  };
  ```
- Use this type instead of `any`

### 5. Type assertions with `as Job`
**Locations:**
- `src/utils.ts:937` - `return job as Job;`
- `src/utils.ts:954` - `return job as Job;`

**Problem:** Type assertions bypass type checking

**Fix:**
- Create type guard function: `isJob(job: unknown): job is Job`
- Use it instead of assertions:
  ```typescript
  if (!isJob(job)) {
    throw new Error("Invalid job structure");
  }
  return job; // TypeScript now knows job is Job
  ```

### 6. JSON.parse type safety
**Locations:** Multiple places use `JSON.parse(content) as SomeType`

**Fix:**
- Always parse to `unknown` first
- Use type guards to validate before narrowing
- Only cast after validation

## Implementation Strategy

### Step 1: Create Type Guards
- Add `isJob(job: unknown): job is Job` function
- Add `isTask(task: unknown): task is Task` function
- These should use the same validation logic as `validateJobStructure()`

### Step 2: Fix `loadJobFileRaw()`
- Change return type from `any` to `unknown`
- This is safe because JSON.parse returns `unknown`

### Step 3: Fix `validateJobStructure()`
- Change parameter from `any` to `unknown`
- No other changes needed - already does runtime validation

### Step 4: Create Session Type
- Extract or define proper Session type
- Use in `displaySessionStatus()`

### Step 5: Replace Type Assertions
- Replace `as Job` with type guard checks
- This makes type narrowing explicit and safe

### Step 6: Update Callers
- Update all places that use `let job: any` to use `unknown`
- Use type guards after validation

## Benefits

1. **Type Safety:** `unknown` forces explicit type checking
2. **Maintainability:** Type guards centralize validation logic
3. **No Breaking Changes:** Runtime behavior stays the same
4. **Better IntelliSense:** TypeScript knows types after guards
5. **Future-Proof:** If Job interface changes, type guards catch it

## Files to Modify

1. `src/types.ts` - Add Session type and type guard functions
2. `src/utils.ts` - Fix loadJobFileRaw, validateJobStructure, type guards
3. `src/commands/spawn-jobs.ts` - Remove `job: any`
4. `src/commands/execute.ts` - Remove `job: any`
5. `src/commands/validate-job.ts` - Remove `job: any`
6. `src/commands/wait.ts` - Fix session parameter type
