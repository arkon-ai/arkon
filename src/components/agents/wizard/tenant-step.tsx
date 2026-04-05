"use client";

import { useEffect, useState } from "react";
import { Building2, Loader2 } from "lucide-react";

interface Tenant {
  id: string;
  name: string;
}

interface TenantStepProps {
  selectedId: string;
  onSelect: (tenantId: string) => void;
}

export function TenantStep({ selectedId, onSelect }: TenantStepProps) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTenants = async () => {
      try {
        const res = await fetch("/api/tenants");
        if (!res.ok) throw new Error("Failed to fetch tenants");
        const data = await res.json();
        const list: Tenant[] = data.tenants ?? data ?? [];
        setTenants(list);

        // Auto-select if only one tenant
        if (list.length === 1 && !selectedId) {
          onSelect(list[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load organizations");
      } finally {
        setLoading(false);
      }
    };
    fetchTenants();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin" style={{ color: "var(--accent)" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        Which organization does this agent belong to?
        Every agent in Arkon must be assigned to a tenant.
      </p>

      <div className="grid grid-cols-1 gap-2">
        {tenants.map((tenant) => (
          <button
            key={tenant.id}
            onClick={() => onSelect(tenant.id)}
            className="flex items-center gap-3 p-4 rounded-xl text-left transition-all"
            style={{
              backgroundColor: selectedId === tenant.id ? "var(--accent-subtle)" : "var(--bg-surface-2)",
              border: `1px solid ${selectedId === tenant.id ? "var(--accent)" : "var(--border)"}`,
            }}
          >
            <div
              className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
              style={{
                backgroundColor: selectedId === tenant.id ? "var(--accent-muted)" : "rgba(255,255,255,0.04)",
                color: selectedId === tenant.id ? "var(--accent)" : "var(--text-secondary)",
              }}
            >
              <Building2 size={20} />
            </div>
            <div className="flex-1">
              <span
                className="font-semibold text-sm"
                style={{ color: selectedId === tenant.id ? "var(--accent)" : "var(--text-primary)" }}
              >
                {tenant.name}
              </span>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                {tenant.id}
              </p>
            </div>
            <div
              className="flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center"
              style={{
                borderColor: selectedId === tenant.id ? "var(--accent)" : "var(--border-strong)",
                backgroundColor: selectedId === tenant.id ? "var(--accent)" : "transparent",
              }}
            >
              {selectedId === tenant.id && (
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--bg-primary)" }} />
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
