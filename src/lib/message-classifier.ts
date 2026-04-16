/**
 * message-classifier.ts
 *
 * Cheap, pure-function heuristic classifier that routes warden-chat user
 * messages to either Haiku (simple) or Opus (complex). No LLM call.
 */

export type Complexity = "simple" | "complex";

export interface ClassifyResult {
  complexity: Complexity;
  recommendedModel: string;
  signals: string[];
  confidence: number;
}

export interface ClassifyOptions {
  /** Override the threshold for Opus routing (default 0.35). Lower = more Opus. */
  opusThreshold?: number;
  /** Caller hint — e.g. "voice-input" can skip some heuristics. */
  source?: "text" | "voice" | "api";
  /** If true, skip classifier and always return Opus (for code/tool-use routes). */
  forceComplex?: boolean;
}

const HAIKU_MODEL = "claude-haiku-4-5";
const OPUS_MODEL = "claude-opus-4-6";
const DEFAULT_THRESHOLD = 0.35;

// Pre-compiled regex patterns.
const RE_CODE_BLOCK = /```/;
const RE_FILE_PATH = /[\w\-/\.]+\.[a-z]{2,6}\b/i;
const RE_SENTENCE_SPLIT = /[.!?]+\s+/;

const TECH_KEYWORDS = [
  "git",
  "npm",
  "docker",
  "ssh",
  "database",
  "migration",
  "deploy",
  "debug",
  "stack trace",
  "error",
  "traceback",
];
const RE_TECH = new RegExp(
  `\\b(${TECH_KEYWORDS.map((k) => k.replace(/\s+/g, "\\s+")).join("|")})\\b`,
  "gi"
);

const REASONING_PHRASES = [
  "why",
  "how should",
  "what's the best way",
  "what is the best way",
  "trade-off",
  "tradeoff",
  "design",
];
const RE_REASONING = new RegExp(
  `\\b(${REASONING_PHRASES.map((p) => p.replace(/\s+/g, "\\s+").replace(/'/g, "'?")).join("|")})\\b`,
  "i"
);

const IMPERATIVE_VERBS = [
  "build",
  "write",
  "refactor",
  "fix",
  "analyze",
  "compare",
];
const RE_IMPERATIVE = new RegExp(`\\b(${IMPERATIVE_VERBS.join("|")})\\b`, "i");

const GREETINGS = ["hi", "hello", "hey", "thanks", "thank you", "ok", "okay", "sure", "yes", "no", "cool", "nice"];
const RE_GREETING_ONLY = new RegExp(
  `^\\s*(${GREETINGS.join("|")})[\\s!.?]*$`,
  "i"
);

const RE_SINGLE_QUESTION_WORD = /^\s*(why|what|who|when|where|how)[\s?!.]*$/i;

const LOOKUP_PHRASES = [
  "what time",
  "what's the weather",
  "what is the weather",
  "when did",
  "when is",
  "who is",
  "where is",
];
const RE_LOOKUP = new RegExp(
  `\\b(${LOOKUP_PHRASES.map((p) => p.replace(/\s+/g, "\\s+").replace(/'/g, "'?")).join("|")})\\b`,
  "i"
);

function clamp(n: number, lo = 0, hi = 1): number {
  return Math.max(lo, Math.min(hi, n));
}

export function classify(
  message: string,
  opts: ClassifyOptions = {}
): ClassifyResult {
  const threshold = opts.opusThreshold ?? DEFAULT_THRESHOLD;

  if (opts.forceComplex) {
    return {
      complexity: "complex",
      recommendedModel: OPUS_MODEL,
      signals: ["forced"],
      confidence: 1.0,
    };
  }

  const msg = message ?? "";
  const trimmed = msg.trim();
  const lower = trimmed.toLowerCase();
  const signals: string[] = [];
  let weight = 0;

  // --- Complex signals ---
  if (msg.length > 500) {
    weight += 0.2;
    signals.push("length:long");
  }
  if (RE_CODE_BLOCK.test(msg)) {
    weight += 0.35;
    signals.push("code-block");
  }
  if (RE_FILE_PATH.test(msg)) {
    weight += 0.15;
    signals.push("file-path");
  }

  // Tech keywords — +0.2 each, capped at +0.4 total.
  const techMatches = msg.match(RE_TECH);
  if (techMatches && techMatches.length > 0) {
    const unique = new Set(techMatches.map((m) => m.toLowerCase()));
    const techWeight = Math.min(0.4, 0.2 * unique.size);
    weight += techWeight;
    signals.push(`tech:${Array.from(unique).slice(0, 3).join(",")}`);
  }

  if (RE_REASONING.test(lower)) {
    // Tuned up from 0.25 → 0.4: "why ...?" questions without other signals
    // otherwise fell below threshold despite being clearly reasoning-heavy.
    weight += 0.4;
    signals.push("reasoning-phrase");
  }

  const sentenceCount = trimmed ? trimmed.split(RE_SENTENCE_SPLIT).filter(Boolean).length : 0;
  if (sentenceCount > 2) {
    weight += 0.1;
    signals.push("multi-sentence");
  }

  if (RE_IMPERATIVE.test(lower)) {
    // Tuned up from 0.2 → 0.25: "fix X in path.ts" cases otherwise land
    // exactly on the 0.35 threshold with confidence 0.
    weight += 0.25;
    signals.push("imperative-verb");
  }

  // --- Simple signals ---
  if (trimmed.length > 0 && trimmed.length < 60) {
    weight -= 0.2;
    signals.push("length:short");
  }
  if (RE_GREETING_ONLY.test(trimmed)) {
    weight -= 0.3;
    signals.push("greeting-only");
  }
  if (RE_SINGLE_QUESTION_WORD.test(trimmed)) {
    weight -= 0.15;
    signals.push("single-question-word");
  }
  if (RE_LOOKUP.test(lower)) {
    weight -= 0.2;
    signals.push("lookup-intent");
  }

  // Voice input skips length-based short penalty noise — voice is often terse
  // but may still be complex. (Currently only records source as a signal.)
  if (opts.source === "voice") {
    signals.push("source:voice");
  }

  weight = clamp(weight, 0, 1);

  const isComplex = weight >= threshold;
  const denom = Math.max(threshold, 1 - threshold) || 1;
  const confidence = clamp(Math.abs(weight - threshold) / denom, 0, 1);

  return {
    complexity: isComplex ? "complex" : "simple",
    recommendedModel: isComplex ? OPUS_MODEL : HAIKU_MODEL,
    signals,
    confidence: Number(confidence.toFixed(3)),
  };
}

/**
 * Debug-only self-test. Not wired to any test framework.
 * Returns classifications for the six canonical examples.
 */
export function _selfTestClassifier(): Array<{
  input: string;
  result: ClassifyResult;
}> {
  const cases = [
    "hi",
    "what's the weather?",
    "thanks!",
    "fix the bug in src/app/api/journal/entries/route.ts where POST returns 500 when owner_agent is missing",
    "why do you recommend hnsw over ivfflat for our memory_facts index?",
    "```\npython foo()\n```\nwhy does this crash?",
  ];
  return cases.map((input) => ({ input, result: classify(input) }));
}
