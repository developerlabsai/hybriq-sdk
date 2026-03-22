/**
 * Local agent/skill config loader.
 *
 * Reads YAML definitions from `.hybriq/agents/*.yaml` and `.hybriq/skills/*.yaml`
 * to configure local-mode agents and skills without cloud dependencies.
 *
 * Limits are enforced by the license tier:
 * - Community: 5 agents, 10 skills
 * - Pro: unlimited (-1)
 */

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { join, basename } from "path";
import type { ValidatedLicense } from "../license/validator.js";
import { checkFeatureAccess } from "../license/validator.js";

/** Agent definition loaded from YAML. */
export interface LocalAgentConfig {
  /** Agent unique ID (derived from filename). */
  id: string;
  /** Display name. */
  name: string;
  /** Description of what this agent does. */
  description?: string;
  /** Model to use (e.g., "claude-sonnet-4-5-20250929", "gpt-4o"). */
  model: string;
  /** System prompt. */
  systemPrompt?: string;
  /** Max tokens for generation. */
  maxTokens?: number;
  /** Temperature for sampling. */
  temperature?: number;
  /** Skill IDs this agent can use. */
  skills?: string[];
  /** Tags for categorization. */
  tags?: string[];
}

/** Skill definition loaded from YAML. */
export interface LocalSkillConfig {
  /** Skill unique ID (derived from filename). */
  id: string;
  /** Display name. */
  name: string;
  /** Description of what this skill does. */
  description?: string;
  /** Skill type. */
  type: "prompt" | "tool" | "mcp";
  /** Prompt template (for prompt-type skills). */
  promptTemplate?: string;
  /** Tool configuration (for tool-type skills). */
  tool?: {
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
  };
  /** MCP server configuration (for mcp-type skills). */
  mcp?: {
    serverUrl: string;
    toolName: string;
  };
  /** Tags for categorization. */
  tags?: string[];
}

/** Loaded local configuration. */
export interface LocalConfig {
  agents: LocalAgentConfig[];
  skills: LocalSkillConfig[];
}

/** Base directory for HybrIQ local config. */
const CONFIG_DIR = ".hybriq";

/**
 * Load local agent and skill configurations from YAML files.
 *
 * @param baseDir - Base directory to look for .hybriq/ folder. Default: cwd.
 * @param license - Validated license for limit enforcement.
 * @returns Loaded agents and skills.
 */
export function loadLocalConfig(
  license: ValidatedLicense,
  baseDir: string = process.cwd()
): LocalConfig {
  const agentsDir = join(baseDir, CONFIG_DIR, "agents");
  const skillsDir = join(baseDir, CONFIG_DIR, "skills");

  const agents = loadYamlDir<LocalAgentConfig>(agentsDir, "agent");
  const skills = loadYamlDir<LocalSkillConfig>(skillsDir, "skill");

  // Enforce license limits
  const maxAgents = license.payload.entitlements.maxAgents;
  if (maxAgents !== -1 && agents.length > maxAgents) {
    throw new Error(
      `License tier '${license.payload.tier}' allows max ${maxAgents} agents, but ${agents.length} found in ${agentsDir}. Upgrade to Pro for unlimited.`
    );
  }

  const maxSkills = license.payload.entitlements.maxSkills;
  if (maxSkills !== -1 && skills.length > maxSkills) {
    throw new Error(
      `License tier '${license.payload.tier}' allows max ${maxSkills} skills, but ${skills.length} found in ${skillsDir}. Upgrade to Pro for unlimited.`
    );
  }

  return { agents, skills };
}

/**
 * Get a specific agent config by ID.
 */
export function getAgent(config: LocalConfig, agentId: string): LocalAgentConfig | undefined {
  return config.agents.find((a) => a.id === agentId);
}

/**
 * Get a specific skill config by ID.
 */
export function getSkill(config: LocalConfig, skillId: string): LocalSkillConfig | undefined {
  return config.skills.find((s) => s.id === skillId);
}

/**
 * Scaffold the .hybriq/ config directory with example files.
 *
 * @param baseDir - Base directory. Default: cwd.
 */
export function scaffoldConfig(baseDir: string = process.cwd()): void {
  const dirs = [
    join(baseDir, CONFIG_DIR),
    join(baseDir, CONFIG_DIR, "agents"),
    join(baseDir, CONFIG_DIR, "skills"),
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  // Example agent
  const exampleAgent = join(baseDir, CONFIG_DIR, "agents", "assistant.yaml");
  if (!existsSync(exampleAgent)) {
    writeFileSync(
      exampleAgent,
      `# HybrIQ Agent Definition
name: Assistant
description: General-purpose assistant agent
model: claude-sonnet-4-5-20250929
systemPrompt: You are a helpful assistant.
maxTokens: 4096
temperature: 0.7
skills:
  - summarize
tags:
  - general
`
    );
  }

  // Example skill
  const exampleSkill = join(baseDir, CONFIG_DIR, "skills", "summarize.yaml");
  if (!existsSync(exampleSkill)) {
    writeFileSync(
      exampleSkill,
      `# HybrIQ Skill Definition
name: Summarize
description: Summarize text into concise bullet points
type: prompt
promptTemplate: |
  Summarize the following text into concise bullet points:

  {{input}}
tags:
  - text
  - utility
`
    );
  }
}

/**
 * Parse a simple YAML file into a key-value object.
 *
 * Supports: scalars, simple arrays (- item), and multiline strings (|).
 * Does NOT support nested objects beyond one level or complex YAML features.
 * This keeps the SDK dependency-free from full YAML parsers.
 */
function parseSimpleYaml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = content.split("\n");
  let currentKey: string | null = null;
  let multilineValue: string[] | null = null;
  let arrayValue: string[] | null = null;
  let nestedObject: Record<string, unknown> | null = null;
  let nestedKey: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip comments and empty lines (but not in multiline mode)
    if (!multilineValue && (line.trim().startsWith("#") || line.trim() === "")) {
      // Flush array if we were building one
      if (arrayValue && currentKey) {
        result[currentKey] = arrayValue;
        arrayValue = null;
        currentKey = null;
      }
      if (nestedObject && nestedKey) {
        result[nestedKey] = nestedObject;
        nestedObject = null;
        nestedKey = null;
      }
      continue;
    }

    // Multiline string continuation
    if (multilineValue !== null) {
      if (line.startsWith("  ") || line.trim() === "") {
        multilineValue.push(line.startsWith("  ") ? line.slice(2) : "");
        continue;
      } else {
        // End of multiline
        if (currentKey) {
          result[currentKey] = multilineValue.join("\n").trimEnd();
        }
        multilineValue = null;
        currentKey = null;
      }
    }

    // Array item (  - value)
    if (arrayValue && line.match(/^\s+-\s+/)) {
      const value = line.replace(/^\s+-\s+/, "").trim();
      arrayValue.push(value);
      continue;
    } else if (arrayValue && currentKey) {
      // End of array
      result[currentKey] = arrayValue;
      arrayValue = null;
      currentKey = null;
    }

    // Nested object (  key: value)
    if (nestedObject && line.match(/^\s{2,}\w/)) {
      const match = line.trim().match(/^(\w+):\s*(.*)$/);
      if (match) {
        nestedObject[match[1]] = parseScalar(match[2]);
        continue;
      }
    } else if (nestedObject && nestedKey) {
      result[nestedKey] = nestedObject;
      nestedObject = null;
      nestedKey = null;
    }

    // Top-level key: value
    const kvMatch = line.match(/^(\w+):\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1];
      const value = kvMatch[2].trim();

      if (value === "|") {
        // Multiline string
        currentKey = key;
        multilineValue = [];
      } else if (value === "") {
        // Could be an array or nested object — peek at next line
        const nextLine = lines[i + 1] ?? "";
        if (nextLine.match(/^\s+-\s+/)) {
          currentKey = key;
          arrayValue = [];
        } else if (nextLine.match(/^\s{2,}\w+:/)) {
          nestedKey = key;
          nestedObject = {};
        }
      } else {
        result[key] = parseScalar(value);
      }
    }
  }

  // Flush remaining
  if (multilineValue && currentKey) {
    result[currentKey] = multilineValue.join("\n").trimEnd();
  }
  if (arrayValue && currentKey) {
    result[currentKey] = arrayValue;
  }
  if (nestedObject && nestedKey) {
    result[nestedKey] = nestedObject;
  }

  return result;
}

/**
 * Parse a YAML scalar value.
 */
function parseScalar(value: string): string | number | boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return "";
  const num = Number(value);
  if (!isNaN(num) && value !== "") return num;
  // Strip quotes
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Load all YAML files from a directory.
 */
function loadYamlDir<T extends { id: string }>(
  dirPath: string,
  type: "agent" | "skill"
): T[] {
  if (!existsSync(dirPath)) return [];

  const files = readdirSync(dirPath).filter(
    (f) => f.endsWith(".yaml") || f.endsWith(".yml")
  );

  return files.map((file) => {
    const content = readFileSync(join(dirPath, file), "utf-8");
    const parsed = parseSimpleYaml(content);
    const id = basename(file, file.endsWith(".yaml") ? ".yaml" : ".yml");
    return { id, ...parsed } as T;
  });
}
