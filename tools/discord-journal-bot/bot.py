"""Discord Journal Bot — slash commands for the work tracker.

Registers three slash commands:
  /log <category> <text>  — quick-capture a journal entry
  /tasks [owner]          — list open tasks (optionally filtered by agent)
  /done <id>              — mark a task done

Runs on warden-eu (once provisioned). Token + journal API key come from env.

ENV:
  DISCORD_BOT_TOKEN      — Discord bot token
  DISCORD_GUILD_ID       — your private guild (makes commands register instantly)
  JOURNAL_API_BASE       — e.g. https://mc.transformateai.com
  JOURNAL_TOKEN_WARDEN   — Warden's API key for the journal API
  ALLOWED_USER_IDS       — comma-separated Discord user IDs allowed to use commands (Brynn-only by default)

Install:
  pip install discord.py httpx

Run:
  python bot.py
"""
from __future__ import annotations

import asyncio
import os
import sys
from typing import Any

import discord
from discord import app_commands
import httpx


def env(name: str, default: str | None = None) -> str:
    v = os.environ.get(name, default)
    if v is None:
        print(f"[fatal] missing env var {name}", file=sys.stderr)
        sys.exit(2)
    return v


DISCORD_BOT_TOKEN = env("DISCORD_BOT_TOKEN")
DISCORD_GUILD_ID = int(env("DISCORD_GUILD_ID"))
JOURNAL_API_BASE = env("JOURNAL_API_BASE").rstrip("/")
JOURNAL_TOKEN = env("JOURNAL_TOKEN_WARDEN")
ALLOWED = {int(x.strip()) for x in env("ALLOWED_USER_IDS", "").split(",") if x.strip()}

CATEGORIES = ["task", "log", "decision", "insight", "question", "blocker", "ship", "note"]
STATUS_ICONS = {"todo": "⬜", "in_progress": "🟡", "done": "✅", "blocked": "🔴", "cancelled": "⬛", "log": "·"}


class JournalClient:
    def __init__(self, base: str, token: str):
        self.base = base
        self.headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    async def create(self, **entry: Any) -> dict:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(f"{self.base}/api/journal/entries", json=entry, headers=self.headers)
            r.raise_for_status()
            return r.json()["entry"]

    async def list_entries(self, **filters: Any) -> list[dict]:
        params = {k: v for k, v in filters.items() if v is not None}
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(f"{self.base}/api/journal/entries", params=params, headers=self.headers)
            r.raise_for_status()
            return r.json()["entries"]

    async def update(self, id: int, **patch: Any) -> dict:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.patch(f"{self.base}/api/journal/entries/{id}", json=patch, headers=self.headers)
            r.raise_for_status()
            return r.json()["entry"]


intents = discord.Intents.default()
bot = discord.Client(intents=intents)
tree = app_commands.CommandTree(bot)
journal = JournalClient(JOURNAL_API_BASE, JOURNAL_TOKEN)


def is_allowed(interaction: discord.Interaction) -> bool:
    if not ALLOWED:
        return True  # open mode (dev only)
    return interaction.user.id in ALLOWED


@tree.command(name="log", description="Capture a journal entry", guild=discord.Object(id=DISCORD_GUILD_ID))
@app_commands.describe(
    text="Title or short description",
    category="Entry category (default: log)",
    project="Related project slug (optional)",
    owner="Agent slug (default: warden — use 'brynn' for personal capture)",
)
@app_commands.choices(category=[app_commands.Choice(name=c, value=c) for c in CATEGORIES])
async def log_cmd(
    interaction: discord.Interaction,
    text: str,
    category: app_commands.Choice[str] | None = None,
    project: str | None = None,
    owner: str | None = None,
):
    if not is_allowed(interaction):
        await interaction.response.send_message("not authorised", ephemeral=True)
        return
    await interaction.response.defer(ephemeral=True, thinking=True)
    cat = category.value if category else "log"
    try:
        entry = await journal.create(
            title=text[:200],
            body_md=None if len(text) <= 200 else text,
            category=cat,
            owner_agent=owner or "warden",
            related_project=project,
            status="todo" if cat == "task" else "log",
        )
        await interaction.followup.send(
            f"✓ logged #{entry['id']} — `{entry['category']}` · {entry['title'][:80]}",
            ephemeral=True,
        )
    except httpx.HTTPStatusError as e:
        await interaction.followup.send(f"error: HTTP {e.response.status_code} — {e.response.text[:200]}", ephemeral=True)
    except Exception as e:
        await interaction.followup.send(f"error: {e}", ephemeral=True)


@tree.command(name="tasks", description="List open tasks", guild=discord.Object(id=DISCORD_GUILD_ID))
@app_commands.describe(owner="Filter by agent slug (optional)")
async def tasks_cmd(interaction: discord.Interaction, owner: str | None = None):
    if not is_allowed(interaction):
        await interaction.response.send_message("not authorised", ephemeral=True)
        return
    await interaction.response.defer(ephemeral=True, thinking=True)
    try:
        entries = await journal.list_entries(category="task", status="todo", owner=owner, limit="20")
        entries += await journal.list_entries(category="task", status="in_progress", owner=owner, limit="20")
        entries += await journal.list_entries(category="task", status="blocked", owner=owner, limit="20")
        if not entries:
            await interaction.followup.send("no open tasks", ephemeral=True)
            return
        lines = [
            f"{STATUS_ICONS.get(e['status'], '·')} `#{e['id']}` {e.get('owner_emoji','')} {e.get('owner_display_name', e['owner_agent'])} — {e['title'][:100]}"
            for e in entries[:25]
        ]
        await interaction.followup.send("\n".join(lines), ephemeral=True)
    except Exception as e:
        await interaction.followup.send(f"error: {e}", ephemeral=True)


@tree.command(name="done", description="Mark a task as done", guild=discord.Object(id=DISCORD_GUILD_ID))
@app_commands.describe(entry_id="Journal entry id")
async def done_cmd(interaction: discord.Interaction, entry_id: int):
    if not is_allowed(interaction):
        await interaction.response.send_message("not authorised", ephemeral=True)
        return
    await interaction.response.defer(ephemeral=True, thinking=True)
    try:
        entry = await journal.update(entry_id, status="done")
        await interaction.followup.send(f"✓ #{entry['id']} marked done — {entry['title'][:80]}", ephemeral=True)
    except httpx.HTTPStatusError as e:
        await interaction.followup.send(f"error: HTTP {e.response.status_code} — {e.response.text[:200]}", ephemeral=True)
    except Exception as e:
        await interaction.followup.send(f"error: {e}", ephemeral=True)


@bot.event
async def on_ready():
    print(f"[ready] logged in as {bot.user} (id={bot.user.id})")
    await tree.sync(guild=discord.Object(id=DISCORD_GUILD_ID))
    print(f"[ready] slash commands synced to guild {DISCORD_GUILD_ID}")


if __name__ == "__main__":
    bot.run(DISCORD_BOT_TOKEN)
