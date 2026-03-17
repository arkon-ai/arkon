/**
 * ThreatGuard — Arkon Threat Scanner
 * Scans event content for prompt injection, dangerous shell commands,
 * and credential exfiltration patterns.
 *
 * Inspired by Runlayer's ToolGuard — built for SMB DFY deployments.
 */

export type ThreatLevel = "none" | "low" | "medium" | "high" | "critical";
export type ThreatClass = "prompt_injection" | "shell_command" | "credential_leak";

export interface ThreatMatch {
  class: ThreatClass;
  pattern: string;
  excerpt: string;
}

export interface ThreatResult {
  level: ThreatLevel;
  classes: ThreatClass[];
  matches: ThreatMatch[];
}

/* ─── Pattern Definitions ─────────────────────────────────── */

const PROMPT_INJECTION_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "ignore previous instructions", re: /ignore\s+(all\s+)?previous\s+instructions/i },
  { label: "disregard your instructions", re: /disregard\s+(your|all)/i },
  { label: "new task directive", re: /new\s+task\s*:/i },
  { label: "your new instructions", re: /your\s+new\s+instructions\s+are/i },
  { label: "forget everything", re: /forget\s+everything/i },
  { label: "act as if", re: /act\s+as\s+if\s+you\s+(are|were)/i },
  { label: "you are now", re: /you\s+are\s+now\s+(a|an|the)\s+\w+/i },
  { label: "override your", re: /override\s+your\s+(system|instructions|rules)/i },
  { label: "system prompt injection", re: /\[SYSTEM\]|\<\|system\|\>/i },
  { label: "jailbreak separator", re: /<\/s><s>|<\|endoftext\|>/i },
  { label: "DAN prompt", re: /do\s+anything\s+now|DAN\s+mode/i },
  { label: "simulate mode", re: /enter\s+(simulation|developer|god)\s+mode/i },
];

const SHELL_COMMAND_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "curl pipe bash", re: /curl[^|]*\|\s*(ba)?sh/i },
  { label: "wget pipe sh", re: /wget[^|]*\|\s*sh/i },
  { label: "base64 pipe bash", re: /base64\s+-d\s*\|\s*(ba)?sh/i },
  { label: "rm -rf root", re: /rm\s+-rf\s+[\/~]/i },
  { label: "rm -rf chained", re: /[;&]\s*rm\s+-rf/i },
  { label: "fork bomb", re: /:\(\)\s*\{/i },
  { label: "dd wipe device", re: /dd\s+if=.*of=\/dev\/(sd|hd|nvme)/i },
  { label: "overwrite device", re: />\s*\/dev\/(sd|hd|nvme)/i },
  { label: "mkfs format", re: /mkfs\./i },
  { label: "chmod 777 recursive", re: /chmod\s+(777|a\+rwx)\s+-R/i },
  { label: "python exec injection", re: /python[23]?\s+-c\s+['"]import\s+(os|subprocess)/i },
  { label: "netcat reverse shell", re: /nc\s+-[el].*-p\s+\d+/i },
  { label: "ngrok tunnel", re: /ngrok\s+(http|tcp)/i },
];

const CREDENTIAL_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "AWS access key", re: /AKIA[0-9A-Z]{16}/i },
  { label: "AWS secret key", re: /aws_secret_access_key\s*[=:]\s*\S{20,}/i },
  { label: "OpenAI key", re: /sk-[a-zA-Z0-9]{32,}/i },
  { label: "GitHub PAT", re: /ghp_[a-zA-Z0-9]{36}/i },
  { label: "GitHub OAuth token", re: /gho_[a-zA-Z0-9]{36}/i },
  { label: "Slack bot token", re: /xoxb-[0-9]+-[a-zA-Z0-9-]+/i },
  { label: "Slack user token", re: /xoxp-[0-9]+-[a-zA-Z0-9-]+/i },
  { label: "Telegram bot token", re: /\d{8,10}:[A-Za-z0-9_-]{35}/i },
  { label: "private key block", re: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/i },
  { label: "password in plaintext", re: /\bpassword\s*[:=]\s*['"]?\S{6,}/i },
  { label: "api key in plaintext", re: /\bapi[_-]?key\s*[:=]\s*['"]?\S{8,}/i },
  { label: "MC admin token reference", re: /MC_ADMIN_TOKEN|mc_auth/i },
  { label: "OpenClaw gateway token", re: /GATEWAY_TOKEN|gateway.*token/i },
  { label: "bearer token exposed", re: /Bearer\s+[a-zA-Z0-9_\-\.]{20,}/i },
];

/* ─── Scanner ─────────────────────────────────────────────── */

function excerpt(content: string, match: RegExpExecArray): string {
  const start = Math.max(0, match.index - 30);
  const end = Math.min(content.length, match.index + match[0].length + 30);
  return `…${content.slice(start, end)}…`;
}

function scan(
  content: string,
  patterns: Array<{ label: string; re: RegExp }>,
  threatClass: ThreatClass,
): ThreatMatch[] {
  const matches: ThreatMatch[] = [];
  for (const { label, re } of patterns) {
    const m = re.exec(content);
    if (m) {
      matches.push({ class: threatClass, pattern: label, excerpt: excerpt(content, m) });
    }
  }
  return matches;
}

function computeLevel(matches: ThreatMatch[]): ThreatLevel {
  if (matches.length === 0) return "none";

  const classes = new Set(matches.map((m) => m.class));
  const hasInjection = classes.has("prompt_injection");
  const hasShell = classes.has("shell_command");
  const hasCred = classes.has("credential_leak");

  // Critical: multiple classes, or injection + shell
  if ((hasInjection && hasShell) || (hasInjection && hasCred) || (hasShell && hasCred)) {
    return "critical";
  }

  // High: single dangerous class with high confidence
  if (hasInjection || hasShell) return "high";

  // Medium/Low based on credential match count
  if (hasCred) {
    return matches.filter((m) => m.class === "credential_leak").length >= 2 ? "high" : "medium";
  }

  return "low";
}

/**
 * Scan event content for threats.
 * Pass both content and event_type so scanner can weight by context.
 */
export function scanEvent(
  content: string,
  eventType: string,
): ThreatResult {
  if (!content || content.trim().length < 10) {
    return { level: "none", classes: [], matches: [] };
  }

  const allMatches: ThreatMatch[] = [];

  // Prompt injection: check on inbound events
  if (["message_received", "system", "note", "tool_call"].includes(eventType)) {
    allMatches.push(...scan(content, PROMPT_INJECTION_PATTERNS, "prompt_injection"));
  }

  // Shell commands: check on tool calls and system events
  if (["tool_call", "system", "message_sent"].includes(eventType)) {
    allMatches.push(...scan(content, SHELL_COMMAND_PATTERNS, "shell_command"));
  }

  // Credentials: check everything outbound
  allMatches.push(...scan(content, CREDENTIAL_PATTERNS, "credential_leak"));

  const level = computeLevel(allMatches);
  const classes = [...new Set(allMatches.map((m) => m.class))];

  return { level, classes, matches: allMatches };
}

export function isThreatActionable(level: ThreatLevel): boolean {
  return level === "high" || level === "critical";
}
