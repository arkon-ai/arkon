-- Phase 5: Cost Reconciliation & Pricing Audit Trail

CREATE TABLE IF NOT EXISTS cost_reconciliation (
  id serial PRIMARY KEY,
  provider varchar(100) NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  invoice_amount_usd numeric(12,4) NOT NULL,
  tracked_amount_usd numeric(12,4) NOT NULL,
  variance_usd numeric(12,4) GENERATED ALWAYS AS (invoice_amount_usd - tracked_amount_usd) STORED,
  variance_pct numeric(6,2) GENERATED ALWAYS AS (
    CASE WHEN invoice_amount_usd > 0
         THEN ((invoice_amount_usd - tracked_amount_usd) / invoice_amount_usd) * 100
         ELSE 0 END
  ) STORED,
  notes text,
  reconciled_by text DEFAULT 'system',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_provider ON cost_reconciliation(provider);
CREATE INDEX IF NOT EXISTS idx_reconciliation_period ON cost_reconciliation(period_start, period_end);

CREATE TABLE IF NOT EXISTS pricing_audit_log (
  id serial PRIMARY KEY,
  action varchar(50) NOT NULL,
  provider varchar(100),
  model_id varchar(255),
  old_values jsonb,
  new_values jsonb,
  changed_by text DEFAULT 'system',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pricing_audit_created ON pricing_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pricing_audit_provider_model ON pricing_audit_log(provider, model_id);

-- Auto-log pricing changes via trigger
CREATE OR REPLACE FUNCTION log_pricing_change() RETURNS trigger AS $$
BEGIN
  INSERT INTO pricing_audit_log (action, provider, model_id, old_values, new_values)
  VALUES (
    TG_OP,
    COALESCE(NEW.provider, OLD.provider),
    COALESCE(NEW.model_id, OLD.model_id),
    CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pricing_audit_trigger ON model_pricing;
CREATE TRIGGER pricing_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON model_pricing
  FOR EACH ROW EXECUTE FUNCTION log_pricing_change();
