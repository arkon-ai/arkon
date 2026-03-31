/**
 * Alert Correlation Engine
 *
 * Groups related alerts, deduplicates within 5min windows,
 * and suppresses child alerts when parent fires.
 */

export interface RawAlert {
  id: string;
  type: string;         // cpu_high, memory_high, agent_error, service_down, etc.
  severity: "critical" | "high" | "medium" | "low";
  source: string;       // node ID or agent ID
  message: string;
  timestamp: number;    // epoch ms
  metadata?: Record<string, unknown>;
}

export interface CorrelatedGroup {
  id: string;
  primary: RawAlert;
  related: RawAlert[];
  severity: "critical" | "high" | "medium" | "low";
  count: number;
  firstSeen: number;
  lastSeen: number;
  suppressed: boolean;
}

// Parent → child relationships for suppression
const PARENT_CHILD: Record<string, string[]> = {
  service_down: ["agent_error", "api_timeout", "health_check_fail"],
  node_offline: ["service_down", "agent_error", "cpu_high", "memory_high", "disk_high"],
  network_partition: ["node_offline", "service_down", "api_timeout"],
};

const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

const SEVERITY_RANK: Record<string, number> = {
  critical: 4, high: 3, medium: 2, low: 1,
};

function maxSeverity(a: string, b: string): "critical" | "high" | "medium" | "low" {
  return (SEVERITY_RANK[a] ?? 0) >= (SEVERITY_RANK[b] ?? 0) ? a as "critical" | "high" | "medium" | "low" : b as "critical" | "high" | "medium" | "low";
}

/**
 * Correlate raw alerts into grouped, deduplicated, suppressed groups.
 */
export function correlateAlerts(alerts: RawAlert[]): CorrelatedGroup[] {
  if (alerts.length === 0) return [];

  // Sort by timestamp
  const sorted = [...alerts].sort((a, b) => a.timestamp - b.timestamp);

  // Step 1: Dedup — group same type+source within 5min window
  const dedupGroups: Map<string, RawAlert[]> = new Map();
  for (const alert of sorted) {
    const key = `${alert.type}:${alert.source}`;
    const existing = dedupGroups.get(key);
    if (existing) {
      const last = existing[existing.length - 1];
      if (alert.timestamp - last.timestamp <= DEDUP_WINDOW_MS) {
        existing.push(alert);
        continue;
      }
    }
    dedupGroups.set(`${key}:${alert.timestamp}`, [alert]);
  }

  // Step 2: Build correlation groups
  const groups: CorrelatedGroup[] = [];
  const processed = new Set<string>();

  const allDeduped = Array.from(dedupGroups.entries()).map(([key, alerts]) => ({
    key,
    primary: alerts[0],
    all: alerts,
  }));

  for (const entry of allDeduped) {
    if (processed.has(entry.key)) continue;
    processed.add(entry.key);

    const related: RawAlert[] = [];
    let groupSeverity = entry.primary.severity;

    // Find children that this alert suppresses
    const childTypes = PARENT_CHILD[entry.primary.type] || [];
    for (const other of allDeduped) {
      if (processed.has(other.key)) continue;
      if (childTypes.includes(other.primary.type) && other.primary.source === entry.primary.source) {
        related.push(...other.all);
        groupSeverity = maxSeverity(groupSeverity, other.primary.severity);
        processed.add(other.key);
      }
    }

    // Also group same-source alerts within dedup window
    for (const other of allDeduped) {
      if (processed.has(other.key)) continue;
      if (other.primary.source === entry.primary.source &&
          Math.abs(other.primary.timestamp - entry.primary.timestamp) <= DEDUP_WINDOW_MS) {
        related.push(...other.all);
        groupSeverity = maxSeverity(groupSeverity, other.primary.severity);
        processed.add(other.key);
      }
    }

    const allAlerts = [...entry.all, ...related];
    groups.push({
      id: `grp_${entry.primary.id}`,
      primary: entry.primary,
      related,
      severity: groupSeverity,
      count: allAlerts.length,
      firstSeen: Math.min(...allAlerts.map((a) => a.timestamp)),
      lastSeen: Math.max(...allAlerts.map((a) => a.timestamp)),
      suppressed: false,
    });
  }

  // Step 3: Suppress child groups when parent group exists
  const parentTypes = new Set(groups.map((g) => g.primary.type));
  for (const group of groups) {
    for (const [parentType, children] of Object.entries(PARENT_CHILD)) {
      if (parentTypes.has(parentType) && children.includes(group.primary.type)) {
        // Check if parent group shares the same source
        const parentGroup = groups.find(
          (g) => g.primary.type === parentType && g.primary.source === group.primary.source
        );
        if (parentGroup) {
          group.suppressed = true;
          break;
        }
      }
    }
  }

  // Sort by severity (critical first), then by lastSeen (newest first)
  groups.sort((a, b) => {
    const sevDiff = (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0);
    if (sevDiff !== 0) return sevDiff;
    return b.lastSeen - a.lastSeen;
  });

  return groups;
}
