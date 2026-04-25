-- 021_drop_youtube_channels.sql — Remove YouTube KB table
-- YouTube KB feature relocated to ArkonOS; not part of Arkon governance product scope.
-- See WI-043 for context.

DROP TABLE IF EXISTS youtube_channels CASCADE;
