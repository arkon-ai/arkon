# Discord Journal Bot

Slash commands for the Arkon journal tracker. Runs on warden-eu once provisioned.

## Commands

- `/log <text> [category] [project] [owner]` — quick-capture
- `/tasks [owner]` — list open tasks
- `/done <entry_id>` — mark a task done

All commands respond **ephemerally** (only you see the reply).

## Install

On warden-eu:

```bash
cd /opt/discord-journal-bot
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Configure

Create `/opt/discord-journal-bot/.env`:

```
DISCORD_BOT_TOKEN=<bot-token>
DISCORD_GUILD_ID=<your-guild-id>
JOURNAL_API_BASE=https://mc.transformateai.com
JOURNAL_TOKEN_WARDEN=<warden-api-key-for-journal>
ALLOWED_USER_IDS=541599141256495104   # Brynn's Discord user id
```

## Run as systemd service

`/etc/systemd/system/discord-journal-bot.service`:

```ini
[Unit]
Description=Discord Journal Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=warden
WorkingDirectory=/opt/discord-journal-bot
EnvironmentFile=/opt/discord-journal-bot/.env
ExecStart=/opt/discord-journal-bot/.venv/bin/python bot.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then:

```bash
systemctl enable --now discord-journal-bot.service
journalctl -u discord-journal-bot.service -f
```

## Testing locally first

Set env vars and run `python bot.py`. First run will register the commands against `DISCORD_GUILD_ID` — they appear instantly in that guild.

## Security

- `ALLOWED_USER_IDS` gates every command. Only listed Discord user IDs can invoke.
- The bot never reads message content; uses slash commands only (no `message_content` intent).
- The journal API enforces RBAC based on `JOURNAL_TOKEN_WARDEN`'s scope.
