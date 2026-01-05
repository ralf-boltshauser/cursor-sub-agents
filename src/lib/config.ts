import { promises as fs } from "fs";
import path from "path";
import {
  DEFAULT_FOLLOW_UP_PROMPTS,
  GLOBAL_CONFIG_FILE,
  LOCAL_CONFIG_FILE,
} from "./constants.js";

// Config file management
export interface ConfigFile {
  followUpPrompts: string[];
}

export function getDefaultPromptsArray(): string[] {
  return [...DEFAULT_FOLLOW_UP_PROMPTS];
}

function getDefaultPrompts(agentId: string): string[] {
  return DEFAULT_FOLLOW_UP_PROMPTS.map((prompt) =>
    prompt.replace(/{agentId}/g, agentId)
  );
}

export async function getLocalConfigPath(): Promise<string> {
  return LOCAL_CONFIG_FILE;
}

export async function getGlobalConfigPath(): Promise<string> {
  return GLOBAL_CONFIG_FILE;
}

export async function ensureConfigDir(configPath: string): Promise<void> {
  const dir = path.dirname(configPath);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {
    // Directory might already exist, ignore
  }
}

export async function loadConfig(
  configPath: string
): Promise<ConfigFile | null> {
  try {
    await ensureConfigDir(configPath);
    const content = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(content) as ConfigFile;
    if (config && Array.isArray(config.followUpPrompts)) {
      return config;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveConfig(
  configPath: string,
  config: ConfigFile
): Promise<void> {
  await ensureConfigDir(configPath);
  const content = JSON.stringify(config, null, 2);
  await fs.writeFile(configPath, content, "utf-8");
}

export async function getActiveConfig(): Promise<{
  config: ConfigFile | null;
  source: "local" | "global" | "default";
  path: string;
}> {
  // Try local config first
  try {
    const localConfig = await loadConfig(LOCAL_CONFIG_FILE);
    if (localConfig) {
      return { config: localConfig, source: "local", path: LOCAL_CONFIG_FILE };
    }
  } catch {
    // Local config doesn't exist or is invalid, continue
  }

  // Try global config
  try {
    const globalConfig = await loadConfig(GLOBAL_CONFIG_FILE);
    if (globalConfig) {
      return {
        config: globalConfig,
        source: "global",
        path: GLOBAL_CONFIG_FILE,
      };
    }
  } catch {
    // Global config doesn't exist or is invalid, continue
  }

  // Return defaults
  return {
    config: {
      followUpPrompts: DEFAULT_FOLLOW_UP_PROMPTS,
    },
    source: "default",
    path: "",
  };
}

export async function deleteConfig(configPath: string): Promise<void> {
  try {
    await fs.unlink(configPath);
  } catch {
    // File doesn't exist, ignore
  }
}

/**
 * Get follow-up prompts from config files, environment variable, or return defaults
 * Priority: local config > global config > env var > defaults
 * The string "{agentId}" will be replaced with the actual agent ID
 */
export async function getFollowUpPrompts(agentId: string): Promise<string[]>;
export function getFollowUpPrompts(agentId: string): string[];
export function getFollowUpPrompts(
  agentId: string
): string[] | Promise<string[]> {
  // Check environment variable first (highest priority for backward compatibility)
  const envPrompts = process.env.CSA_FOLLOWUP_PROMPTS;

  if (envPrompts) {
    try {
      // Try parsing as JSON first
      const parsed = JSON.parse(envPrompts);
      if (Array.isArray(parsed)) {
        return parsed.map((prompt: string) =>
          typeof prompt === "string"
            ? prompt.replace(/{agentId}/g, agentId)
            : String(prompt)
        );
      }
    } catch {
      // Not JSON, try pipe-separated format
    }

    // Try pipe-separated format
    if (envPrompts.includes("|")) {
      return envPrompts
        .split("|")
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
        .map((p) => p.replace(/{agentId}/g, agentId));
    }

    // Single prompt
    return [envPrompts.replace(/{agentId}/g, agentId)];
  }

  // If called synchronously (for backward compatibility), return defaults
  // Otherwise, this will be handled by the async version
  return getDefaultPrompts(agentId);
}

export async function getFollowUpPromptsAsync(
  agentId: string
): Promise<string[]> {
  // Check environment variable first (highest priority for backward compatibility)
  const envPrompts = process.env.CSA_FOLLOWUP_PROMPTS;

  if (envPrompts) {
    try {
      // Try parsing as JSON first
      const parsed = JSON.parse(envPrompts);
      if (Array.isArray(parsed)) {
        return parsed.map((prompt: string) =>
          typeof prompt === "string"
            ? prompt.replace(/{agentId}/g, agentId)
            : String(prompt)
        );
      }
    } catch {
      // Not JSON, try pipe-separated format
    }

    // Try pipe-separated format
    if (envPrompts.includes("|")) {
      return envPrompts
        .split("|")
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
        .map((p) => p.replace(/{agentId}/g, agentId));
    }

    // Single prompt
    return [envPrompts.replace(/{agentId}/g, agentId)];
  }

  // Try config files
  const activeConfig = await getActiveConfig();
  if (activeConfig.config) {
    return activeConfig.config.followUpPrompts.map((p) =>
      p.replace(/{agentId}/g, agentId)
    );
  }

  // Return defaults
  return getDefaultPrompts(agentId);
}
