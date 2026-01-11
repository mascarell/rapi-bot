# CLAUDE.md - LLM Context Guide

## Project Overview
Discord bot for gacha games: daily reset notifications, music playback, chat commands, **coupon redemption system**, and **rules management**.

## Tech Stack
- TypeScript, Node.js, Discord.js
- AWS S3 for data persistence (JSON documents)
- Vitest for testing
- Docker for deployment

## Key Directories
```
src/
├── commands/           # Slash commands (/redeem, /spam, /gacha, /rules, etc.)
├── services/           # Business logic (gachaRedemptionService, gachaDataService, rulesManagementService)
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

### Key Files
| File | Purpose |
|------|---------|
| `src/services/rulesManagementService.ts` | Rules message logic (create/update) |
| `src/commands/rules.ts` | `/rules` command handlers |
| `guild-config.json` | S3 config with `rulesConfig.messageId` |

### Commands
| Command | Access | Description |
|---------|--------|-------------|
| `/rules show` | Everyone | Display rules content |
| `/rules update` | Mods only | Update #rules channel message |

### Important Behaviors
1. **Auto-initialization**: On startup, bot processes all `allowedGuildIds` from S3 config
2. **Dynamic channel finding**: Searches for channel named `rules` in each guild
3. **Message persistence**: Finds existing bot message or creates new one
4. **Guild restriction**: Only works on servers in `allowedGuildIds` array
5. **Multi-server support**: Can manage rules in multiple guilds simultaneously

### Configuration (S3)
```typescript
GachaGuildConfig {
  allowedGuildIds: string[]        // Guilds where rules system is enabled
  rulesConfig?: {
    guildId: string                // Primary guild ID (legacy, not used for multi-guild)
    channelId: string              // Channel ID (legacy, uses dynamic search now)
    messageId: string | null       // Stored message ID for updates
  }
  schemaVersion: number            // Current: 3
}
```

### Adding Rules to New Server
1. Add server ID to `allowedGuildIds` in S3 config
2. Create `#rules` channel on server
3. Bot auto-creates message on next startup
4. Capture message ID from logs
5. Update `rulesConfig.messageId` in S3 config (optional, for faster lookups)
