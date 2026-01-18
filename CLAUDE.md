# CLAUDE.md - LLM Context Guide

## Project Overview
Discord bot for gacha games: daily reset notifications, music playback, chat commands, **coupon redemption system**, **rules management**, and **Twitter/X URL embed fix**.

## Tech Stack
- TypeScript, Node.js, Discord.js
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
npm run test:run        # Run all tests
npx tsc --noEmit        # Type check
```

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

## Twitter/X URL Embed Fix System

### Architecture
- `urlFixService.ts` - Simplified URL replacement service (~200 lines vs 2000+ in old implementation)
- Runs automatically on all messages in `#art` and `#nsfw` channels
- No API calls, no complex logic - just status ID extraction and URL replacement

### How It Works
1. **Detects Twitter/X URLs** in messages from all domains:
   - Standard: `twitter.com`, `x.com`
   - Proxy services: `vxtwitter.com`, `fxtwitter.com`, `fixupx.com`, `fixvx.com`, `twittpr.com`, and others
2. **Extracts status IDs** from any URL format (e.g., `/user/status/123` or `/i/status/123`)
3. **Converts to fixupx.com format**: `https://fixupx.com/i/status/{statusId}`
4. **Replies with fixed URL** and suppresses original message embeds
5. **Tracks by status ID** to prevent duplicate processing

### Deduplication System
- Tracks `status ID → {messageId, channelId, guildId}` mapping
- If same tweet posted again (any URL format), bot replies with:
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

### Technical Details
- **Bot message filtering**: First check to prevent infinite loops
- **Two-phase embed suppression**: Immediate + 1500ms delayed (catches Discord's async embed generation)
- **Memory management**: Clears tracked status IDs when > 1000 entries (every 5 minutes)
- **Status ID deduplication**: Multiple URLs with same status ID = one reply
- **Channel filtering**: Only processes `#art` and `#nsfw` channels (case-insensitive)

### Supported URL Formats
All formats are normalized to `fixupx.com/i/status/{statusId}`:
- `https://x.com/user/status/123`
- `https://twitter.com/user/status/123`
- `https://mobile.twitter.com/user/status/123`
- `https://www.x.com/user/status/123`
- `https://vxtwitter.com/user/status/123`
- `https://fxtwitter.com/user/status/123`
- `https://fixupx.com/i/status/123`
- And other proxy service variants

### Testing
Tests located in: `src/services/embedFix/tests/urlFixService.test.ts`

Run tests:
```bash
npm run test:run -- urlFixService
```

### Important Notes
- **No API calls**: Leverages fixupx.com's embed service instead of generating embeds
- **Fast response**: < 1 second (instant URL replacement)
- **No infinite loops**: Bot check is FIRST, message ID tracking prevents reprocessing
- **Graceful error handling**: Failed embed suppression doesn't stop reply
- **Non-blocking**: Uses setTimeout for delayed suppression (doesn't block bot)
