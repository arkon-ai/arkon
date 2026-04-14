-- 016_youtube_channels.sql — YouTube KB channel registry
-- Driven by ArkonOS /settings/youtube-kb UI; consumed by Dell G5 pull_transcripts.py

CREATE TABLE IF NOT EXISTS youtube_channels (
    id               SERIAL PRIMARY KEY,
    name             VARCHAR(255) NOT NULL,
    url              VARCHAR(500) NOT NULL,
    collection_name  VARCHAR(255) NOT NULL UNIQUE,
    dir_name         VARCHAR(255) NOT NULL UNIQUE,
    max_videos       INT          NOT NULL DEFAULT 80,
    enabled          BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_pull_at     TIMESTAMPTZ,
    last_pull_status VARCHAR(32),
    video_count      INT DEFAULT 0,
    transcript_count INT DEFAULT 0,
    chunk_count      INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_youtube_channels_enabled ON youtube_channels (enabled);

INSERT INTO youtube_channels (name, url, collection_name, dir_name, max_videos) VALUES
    ('Cole Medin',      'https://www.youtube.com/@ColeMedin/videos',       'cole_medin_channel',      'cole-medin-index',      80),
    ('Nick Saraev',     'https://www.youtube.com/@nicksaraev/videos',      'nick_saraev_channel',     'nick-saraev-index',     80),
    ('Liam Ottley',     'https://www.youtube.com/@LiamOttley/videos',      'liam_ottley_channel',     'liam-ottley-index',     80),
    ('Nate Herk',       'https://www.youtube.com/@nateherk/videos',        'nate_herk_channel',       'nate-herk-index',       80),
    ('Kevin Stratvert', 'https://www.youtube.com/@KevinStratvert/videos',  'kevin_stratvert_channel', 'kevin-stratvert-index', 80),
    ('n8n Official',    'https://www.youtube.com/@n8n-io/videos',          'n8n_official_channel',    'n8n-official-index',    80),
    ('Mansel Scheffel', 'https://www.youtube.com/@ManselScheffel/videos',  'mansel_scheffel_channel', 'mansel-scheffel-index', 80),
    ('Matt Wolfe',      'https://www.youtube.com/@maboroshi/videos',       'matt_wolfe_channel',      'matt-wolfe-index',      60),
    ('Jack Roberts',    'https://www.youtube.com/@JackRobertsAI/videos',   'jack_roberts_channel',    'jack-roberts-index',    80),
    ('Alex Finn',       'https://www.youtube.com/@alexfinn/videos',        'alex_finn_channel',       'alex-finn-index',       80),
    ('David Shapiro',   'https://www.youtube.com/@DaveShap/videos',        'david_shapiro_channel',   'david-shapiro-index',   50),
    ('Zapier',          'https://www.youtube.com/@zapier/videos',          'zapier_channel',          'zapier-index',          60),
    ('Alex Hormozi',    'https://www.youtube.com/@AlexHormozi/videos',     'alex_hormozi_channel',    'alex-hormozi-index',    20),
    ('Praison AI',      'https://www.youtube.com/@PraisonAI/videos',       'praison_ai_channel',      'praison-ai-index',      50),
    ('Greg Isenberg',   'https://www.youtube.com/@GregIsenberg/videos',    'greg_isenberg_channel',   'greg-isenberg-index',   50)
ON CONFLICT (collection_name) DO NOTHING;
