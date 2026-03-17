-- Migration: 002_event_threat_actions
-- Add columns for threat event dismissal and content redaction tracking

-- Dismissed flag for false positive marking
ALTER TABLE events ADD COLUMN IF NOT EXISTS dismissed BOOLEAN DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS dismissed_by TEXT;

-- Content redaction flag (content_redacted may already exist as TEXT, ensure boolean)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'content_redacted'
  ) THEN
    ALTER TABLE events ADD COLUMN content_redacted BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Index for filtering dismissed events
CREATE INDEX IF NOT EXISTS idx_events_dismissed ON events (dismissed) WHERE dismissed = true;

-- Index for threat-level queries (used by ThreatGuard)
CREATE INDEX IF NOT EXISTS idx_events_threat_level ON events (threat_level) WHERE threat_level IS NOT NULL AND threat_level != 'none';
