# CLAUDE.md - LLM Context Guide

## Project Overview
Discord bot for gacha games: daily reset notifications, music playback, chat commands, **coupon redemption system**, **rules management**, and **URL embed fix (Twitter/X + Pixiv)**.

## Tech Stack
- TypeScript, Node.js, Discord.js
- **bun** - Fast package manager and runtime
- **LogTape** - Zero-dependency structured logging (Bun-native)
- AWS S3 for data persistence (JSON documents)
- Vitest for testing
- Docker for deployment

## Key Directories
```
src/
├── commands/           # Slash commands (/redeem, /spam, /gacha, /rules, etc.)
├── services/
│   ├── embedFix/      # Twitter/X URL fix service (urlFixService.ts)
│   └── ...            # Other services (gachaRedemptionService, gachaDataService, rulesManagementService)
├── utils/
│   ├── data/          # Config files (gachaGamesConfig, gachaConfig)
│   └── interfaces/    # TypeScript interfaces
└── index.ts           # Entry point, cron jobs
```

## Gacha Coupon System (Primary Feature)

### Architecture
- `gachaDataService.ts` - S3 data operations (CRUD for coupons, subscriptions)
- `gachaRedemptionService.ts` - Redemption logic, DM notifications, API calls
- `gachaGamesConfig.ts` - Game configurations (BD2, NIKKE, Blue Archive)
- `gachaConfig.ts` - Tunable parameters (timeouts, rate limits, retries)

### Data Model (S3 JSON)
```typescript
GachaCouponData {
  coupons: GachaCoupon[]           // gameId, code, rewards, expirationDate, isActive
  subscriptions: UserSubscription[] // discordId, gameSubscriptions[]
  redemptionHistory: RedemptionHistoryEntry[]
}
```

### Key Commands
| Command | Handler | Description |
|---------|---------|-------------|
| `/redeem subscribe` | `handleSubscribe` | Subscribe + immediate auto-redeem |
| `/redeem subscribers` | `handleModSubscribers` | Paginated subscriber list (mod) |
| `/redeem list` | `handleModList` | Codes with status indicators |
| `/redeem help` | `handleHelp` | FAQs (mod-aware) |

### Subscription Modes
- **auto-redeem**: Immediate redemption on subscribe, then every 6h + on new codes
- **notification-only**: DM alerts only, manual redemption

### Important Behaviors
1. **Auto-redeem on subscribe**: `redeemAllForUser()` called immediately
2. **Expired code grace period**: 24h before `isActive=false`
3. **DM skip logic**: No DM if only expired codes (no meaningful results)
4. **Real-time filtering**: `getActiveCoupons()` filters by expiration date at runtime

### Status Indicators (in /redeem list)
- ✅ Active (not expiring soon)
- ⏰ Expiring within 24h
- ❌ Expired (in 24h grace period)

## Permission System
- Mod commands require `mods` role OR Administrator permission
- Check: `checkModPermission(interaction)` in redeem.ts
- modCommands array: `['add', 'remove', 'list', 'trigger', 'unsub', 'update', 'lookup', 'reset', 'scrape', 'stats', 'subscribers']`

## Testing
```bash
bun run test:run        # Run all tests
bunx tsc --noEmit       # Type check
```

## Logging

Uses **LogTape** (`@logtape/logtape`) — zero-dependency, Bun-native structured logging.

### Configuration
- **Production** (`NODE_ENV != 'development'`): Only `warning` and `error` are printed
- **Development** (`NODE_ENV=development`): `debug` and above
- **Override**: `LOG_LEVEL=debug bun run start` to force debug logging in any environment

### Available Loggers (from `src/utils/logger.ts`)
| Logger | Category | Used In |
|--------|----------|---------|
| `logger` | `["bot"]` | General / commands / utilities |
| `discordLogger` | `["bot", "discord"]` | discord.ts, welcome, voice, reactions |
| `gachaLogger` | `["bot", "gacha"]` | Redemption, data service, scraper, channel monitor |
| `embedFixLogger` | `["bot", "embed-fix"]` | URL fix, embed fix, Twitter/Pixiv handlers, votes |
| `schedulerLogger` | `["bot", "scheduler"]` | Cron jobs, daily reset, coupon scheduler |
| `mediaLogger` | `["bot", "media"]` | CDN media manager |
| `rulesLogger` | `["bot", "rules"]` | Rules management service |

### Guidelines
- **Prefer `warning`/`error`** — even in dev, only log things that need attention
- **Use `debug`** sparingly — only for complex/newer features (gacha API, BD2 scraper, circuit breaker)
- **Delete** rather than downlevel — if a log doesn't help diagnose a failure, remove it
- LogTape uses tagged template syntax: `logger.error\`message ${variable}\``

## Common Patterns

### Adding a new /redeem subcommand
1. Add to SlashCommandBuilder (around line 1170-1220)
2. Create `handleXxx` function
3. Add to switch statement in `execute()`
4. If mod-only, add to `modCommands` array
5. Update `handleHelp` if user-facing

### Pagination (subscribers command)
Uses inline ActionRowBuilder with Previous/Next buttons, 5-min timeout.

## Environment Variables
```
WAIFUTOKEN, CLIENTID, CDN_DOMAIN_URL
AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET
```

## Cron Jobs (index.ts)
- Auto-redemption: every 6h (prod) / 3min (dev)
- Code scraping: every 30min (prod) / 2min (dev)
- Expired cleanup: daily midnight (prod) / 15min (dev)

## Rules Management System

### Architecture
- `rulesManagementService.ts` - Manages rules messages in #rules channels
- Uses same S3 guild config as gacha coupon system (`allowedGuildIds`)
- Auto-initializes on bot startup for all allowed guilds

### Commands
| Command | Access | Description |
|---------|--------|-------------|
| `/rules` | Everyone | Display rules content (ephemeral) |

### Important Behaviors
1. **Auto-initialization**: On startup, bot processes all `allowedGuildIds` from S3 config
2. **Dynamic channel finding**: Searches for channel named `rules` in each guild
3. **Message persistence**: Finds existing bot message or creates new one
4. **Ephemeral display**: `/rules` command shows content only to the user who invoked it

## URL Embed Fix System (Twitter/X + Pixiv)

### Architecture
- `urlFixService.ts` - Simplified URL replacement service (~300 lines vs 2000+ in old implementation)
- Runs automatically on all messages in `#art` and `#nsfw` channels
- No API calls, no complex logic - just content ID extraction and URL replacement
- Supports both Twitter/X and Pixiv platforms

### How It Works
1. **Detects URLs** in messages from all supported domains:
   - **Twitter/X**: `twitter.com`, `x.com`, and proxy services (`vxtwitter.com`, `fxtwitter.com`, `fixupx.com`, etc.)
   - **Pixiv**: `pixiv.net`, `phixiv.net` (proxy)
2. **Extracts content IDs**:
   - Twitter: Status IDs from any URL format (e.g., `/user/status/123` or `/i/status/123`)
   - Pixiv: Artwork IDs from any URL format (e.g., `/artworks/456` or `?illust_id=456`)
3. **Converts to proxy formats**:
   - Twitter: `https://fixupx.com/i/status/{statusId}`
   - Pixiv: `https://phixiv.net/artworks/{artworkId}`
4. **Replies with fixed URL(s)** and suppresses original message embeds
5. **Tracks by content ID** to prevent duplicate processing (format: `twitter:{id}` or `pixiv:{id}`)

### Deduplication System
- Tracks `content ID → {messageId, channelId, guildId}` mapping
- Separate tracking for Twitter and Pixiv (same number = different content)
- If same content posted again (any URL format), bot replies with:
  - `🔄 This was already shared → [Original](discord link)`
  - Suppresses embeds on duplicate message
  - Links back to original post

### Example Flow
**First post (new tweet):**
```
User: https://x.com/artist/status/123456789
Bot: https://fixupx.com/i/status/123456789
```

**Second post (duplicate tweet):**
```
User: https://twitter.com/artist/status/123456789
Bot: 🔄 This was already shared → [Original](https://discord.com/channels/...)
```

**Pixiv post:**
```
User: https://www.pixiv.net/artworks/987654321
Bot: https://phixiv.net/artworks/987654321
```

**Mixed platforms in one message:**
```
User: Check out https://x.com/user/status/111 and https://pixiv.net/artworks/222
Bot: https://fixupx.com/i/status/111
     https://phixiv.net/artworks/222
```

### Technical Details
- **Bot message filtering**: First check to prevent infinite loops
- **Two-phase embed suppression**: Immediate + 1500ms delayed (catches Discord's async embed generation)
- **Memory management**: Clears tracked content IDs when > 1000 entries (every 5 minutes)
- **Content ID deduplication**: Multiple URLs with same content ID = one reply
- **Channel filtering**: Only processes `#art` and `#nsfw` channels (case-insensitive)
- **Multi-platform support**: Handles Twitter and Pixiv URLs in the same message

### Supported URL Formats

**Twitter/X** (normalized to `fixupx.com/i/status/{statusId}`):
- `https://x.com/user/status/123`
- `https://twitter.com/user/status/123`
- `https://mobile.twitter.com/user/status/123`
- `https://www.x.com/user/status/123`
- `https://vxtwitter.com/user/status/123`
- `https://fxtwitter.com/user/status/123`
- `https://fixupx.com/i/status/123`
- And other proxy service variants

**Pixiv** (normalized to `phixiv.net/artworks/{artworkId}`):
- `https://www.pixiv.net/artworks/123456`
- `https://pixiv.net/en/artworks/123456` (with language prefix)
- `https://www.pixiv.net/member_illust.php?illust_id=123456` (legacy format)
- `https://phixiv.net/artworks/123456` (proxy)

### Testing
Tests located in: `src/services/embedFix/tests/urlFixService.test.ts` (36 tests covering both platforms)

Run tests:
```bash
bun run test:run -- urlFixService
```

Test coverage includes:
- Bot message filtering
- Channel filtering
- Twitter URL extraction (all formats)
- Pixiv URL extraction (all formats)
- Mixed platform URLs
- Deduplication for both platforms
- Duplicate notifications
- Embed suppression
- Error handling
- Edge cases

### Important Notes
- **No API calls**: Leverages fixupx.com and phixiv.net embed services
- **Fast response**: < 1 second (instant URL replacement)
- **No infinite loops**: Bot check is FIRST, content ID tracking prevents reprocessing
- **Graceful error handling**: Failed embed suppression doesn't stop reply
- **Non-blocking**: Uses setTimeout for delayed suppression (doesn't block bot)
- **Platform-agnostic**: Twitter ID 123 and Pixiv ID 123 are tracked separately

## Pull Request Guidelines

### PR Description Format

**For Short PRs** (small changes, quick fixes):
```markdown
## Summary
Brief 1-2 sentence description of the change.

## Changes
- Bullet list of key modifications
- What was added/removed/fixed

## Testing
- [ ] Type check passes
- [ ] Tests pass
- [ ] Manual testing done (if applicable)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

**For Detailed PRs** (features, refactors, bug fixes):
```markdown
## Summary
Brief 1-2 sentence overview.

## Problem / Motivation (for bugs/refactors)
What issue this PR solves or why the change is needed.

## Solution / Changes Made
Detailed breakdown of what changed:
- Component/file changes
- Before/after code snippets (if helpful)
- Architecture decisions

## Technical Details
- Patterns used
- Integration points
- Dependencies

## Testing
- Automated test coverage
- Manual testing checklist
- Edge cases considered

## Impact / Benefits
What improves from this change:
- User experience
- Developer experience
- Performance
- Maintainability

## Files Changed
Summary of modified files with brief descriptions.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

### PR Title Format
- **Feature**: `feat: Add Pixiv URL support to embed fix system`
- **Bug Fix**: `fix: Fix command registration race condition`
- **Refactor**: `refactor: Migrate from CommonJS to ESM modules`
- **Documentation**: `docs: Update README with bun commands`
- **Chore**: `chore: Update dependencies`

### Guidelines
- **Be concise** - Short PRs for small changes, detailed for complex ones
- **Include testing** - Always mention test coverage
- **Link issues** - Reference related issues/PRs when applicable
- **Show impact** - Explain what improves
- **End with signature** - Always include Claude Code attribution
