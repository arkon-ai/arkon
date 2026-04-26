# memory-decay systemd unit

Daily cron for the memory_facts decay sweep (WI-076).

## Files

- `memory-decay.service` — oneshot runner for `scripts/memory-decay.mjs`.
- `memory-decay.timer` — daily 03:30 SAST (01:30 UTC) trigger, persistent.

## Prereq — DATABASE_URL env file

systemd cannot parse `/home/warden/bridge/.env.local` because that file
contains a bare `postgres://` line. Drop a KEY=VALUE-only sidecar:

```bash
install -m 600 -o warden -g warden /dev/null /home/warden/.config/memory-decay.env
echo "DATABASE_URL=$(grep '^postgres://' /home/warden/bridge/.env.local)" \
  > /home/warden/.config/memory-decay.env
```

## Install (user-mode on hofmi-team-1)

```bash
mkdir -p ~/.config/systemd/user
cp ops/systemd/memory-decay.service ~/.config/systemd/user/
cp ops/systemd/memory-decay.timer   ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now memory-decay.timer
loginctl enable-linger warden   # one-time, so the timer survives logout
```

System-mode is also supported — drop the files in `/etc/systemd/system/` and
use `sudo systemctl enable --now memory-decay.timer`.

## Mode

The service runs in **dry-run** mode by default (decay-score UPDATE only — no
DELETE). To enable destructive prune after the v1 dry-run shakedown:

```
# /etc/default/memory-decay (or drop-in)
MEMORY_DECAY_MODE=apply
```

…and edit the service unit so `ExecStart` ends with `--apply`:

```
systemctl --user edit memory-decay.service
# [Service]
# ExecStart=
# ExecStart=/usr/bin/node scripts/memory-decay.mjs --apply
```

Both guards (env var **and** CLI flag) must be flipped before any DELETE runs.

## Verification

```bash
systemctl --user list-timers memory-decay.timer
journalctl --user -u memory-decay.service -n 200 --no-pager
tail -50 /home/warden/logs/memory-decay.log
```

## Audit trail

Each run INSERTs one row into `audit_log` with `actor='cron:memory-decay'` and
either `action='memory_facts.decay.dry_run'` or `'memory_facts.decay.apply'`.
The detail JSONB carries the half-life, threshold, before/after row counts,
score distribution, and a 5-row before/after sample.
