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
│   ├── utils/         # Command utilities (commandBase, paginationBuilder)
│   └── tests/         # Command tests
├── services/           # Business logic services
│   ├── embedFix/      # Twitter/X + Pixiv URL fix system
│   └── ...            # gachaRedemptionService, gachaDataService, rulesManagementService, etc.
├── chatCommands/       # Message-based chat commands
│   ├── mediaCommands.ts
│   ├── types.ts
│   ├── index.ts
│   └── utils/
├── handlers/           # Event handlers
│   ├── messageHandler.ts
│   ├── slashCommandHandler.ts
├── bootstrap/          # Initialization logic
│   └── serviceInitializer.ts
├── config/             # Configuration
│   └── assets.ts      # Centralized CDN asset URLs
├── utils/              # Shared utilities
│   ├── interactionHelpers.ts      # replyEphemeral, replyWithEmbed, etc.
│   ├── commandErrorHandler.ts     # handleCommandError
│   ├── permissionHelpers.ts       # checkModPermission
│   ├── embedTemplates.ts          # createBasicEmbed, createErrorEmbed, etc.
│   ├── sensitiveTermsChecker.ts   # Content moderation
│   ├── data/          # Config files (gachaGamesConfig, gachaConfig)
│   └── interfaces/    # TypeScript interfaces
├── discord.ts          # Bot orchestrator (reduced from 1,885 → 513 lines)
└── index.ts            # Entry point, cron jobs
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

### Available Logger (from `src/utils/logger.ts`)
- **`logger`** - Universal bot logger with category `["bot"]`
- All subsystems use the same logger instance
- For clarity, log messages can include semantic prefixes: `logger.error\`[subsystem] ${message}\``

### Guidelines
- **Prefer `warning`/`error`** — even in dev, only log things that need attention
- **Use `debug`** sparingly — only for complex/newer features (gacha API, BD2 scraper, circuit breaker)
- **Delete** rather than downlevel — if a log doesn't help diagnose a failure, remove it
- LogTape uses tagged template syntax: `logger.error\`message ${variable}\``

## Codebase Standards & Patterns

### Architecture Principles
- **Modular design**: Each file has a single, well-defined responsibility
- **Service layer separation**: Business logic in services, commands are thin wrappers
- **Utility extraction**: Common patterns extracted into reusable helpers
- **Type safety**: Prefer proper TypeScript types over `as` casts
- **Centralized configuration**: Asset URLs, game configs, and constants in dedicated files

### Command Patterns

**Standard Command Structure:**
```typescript
import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { replyEphemeral } from '../utils/interactionHelpers.js';
import { handleCommandError } from '../utils/commandErrorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('command-name')
        .setDescription('Command description'),
    async execute(interaction: ChatInputCommandInteraction) {
        try {
            // Command logic here
            await replyEphemeral(interaction, 'Response message');
        } catch (error) {
            await handleCommandError(interaction, error, 'command-name');
        }
    },
};
```

**Key Guidelines:**
- Use `ChatInputCommandInteraction` (not `CommandInteraction`)
- Use `interaction.options.getString('name', true)` instead of type casts
- Wrap command logic in try-catch with `handleCommandError`
- Use utility helpers for common patterns

### Utility Functions

**Interaction Helpers** (`src/utils/interactionHelpers.ts`):
```typescript
// Ephemeral replies (only visible to user)
await replyEphemeral(interaction, 'Message');

// Public replies with embeds
await replyWithEmbed(interaction, embed, isEphemeral);

// Deferred replies (for long operations)
await deferReply(interaction, isEphemeral);
await editReply(interaction, content);
```

**Error Handling** (`src/utils/commandErrorHandler.ts`):
```typescript
// Standardized error handling for commands
await handleCommandError(interaction, error, 'command-name');
```

**Permission Checks** (`src/utils/permissionHelpers.ts`):
```typescript
// Check for mod permissions (role or administrator)
const isMod = await checkModPermission(interaction);
if (!isMod) {
    await replyEphemeral(interaction, 'You do not have permission to use this command.');
    return;
}
```

**Embed Templates** (`src/utils/embedTemplates.ts`):
```typescript
// Pre-configured embed templates
const embed = createBasicEmbed(title, description, color);
const errorEmbed = createErrorEmbed(message);
const successEmbed = createSuccessEmbed(message);
```

**Asset URLs** (`src/config/assets.ts`):
```typescript
// Centralized CDN asset management
import { getAssetUrls } from '../config/assets.js';

const ASSET_URLS = getAssetUrls();
const thumbnailUrl = ASSET_URLS.rapiBot.thumbnail;
const logoUrl = ASSET_URLS.nikke.logo;
```

### Handler Patterns

**Message Handler** (`src/handlers/messageHandler.ts`):
- Processes `messageCreate` and `messageUpdate` events
- Rate limiting, sensitive terms checking
- Chat command execution
- URL embed fix integration

**Slash Command Handler** (`src/handlers/slashCommandHandler.ts`):
- Processes interaction events
- Command routing and execution
- Autocomplete handling
- Consistent error handling

### Service Patterns

**Service Structure:**
```typescript
export class MyService {
    private static instance: MyService;

    private constructor() {
        // Initialize service
    }

    public static getInstance(): MyService {
        if (!MyService.instance) {
            MyService.instance = new MyService();
        }
        return MyService.instance;
    }

    // Public methods
}

export const getMyService = (): MyService => MyService.getInstance();
```

### Common Patterns

**Adding a new slash command:**
1. Create file in `src/commands/command-name.ts`
2. Use standard command structure with proper imports
3. Import in `src/discord.ts` and add to command collection
4. Add tests in `src/commands/tests/`
5. Update help command if user-facing

**Adding a new /redeem subcommand:**
1. Add to SlashCommandBuilder (around line 1170-1220)
2. Create `handleXxx` function
3. Add to switch statement in `execute()`
4. If mod-only, add to `modCommands` array
5. Update `handleHelp` if user-facing

**Pagination Pattern** (`src/commands/utils/paginationBuilder.ts`):
```typescript
import { PaginationBuilder } from '../commands/utils/paginationBuilder.js';

const pagination = new PaginationBuilder()
    .setEmbeds(embedArray)
    .setTimeout(5 * 60 * 1000);  // 5 minutes

await pagination.send(interaction);
```

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

## Token Usage Management

### Monitoring Guidelines

**Track token usage proactively:**
- Monitor the token counter throughout the session
- Keep a 20% ceiling buffer (e.g., for 200K limit, plan to stop at ~160K)
- Consider task complexity when estimating remaining capacity

**When to suggest a new chat session:**
1. **Current usage + estimated task tokens > 80% of limit**
   - Example: At 140K/200K tokens, avoid starting a 50K+ token task
2. **Complex multi-phase work with >3 phases remaining**
   - Each phase typically uses 20-40K tokens (reads, writes, tests, commits)
3. **Large file refactoring (>500 lines)**
   - Reading + editing + testing can consume 30-50K tokens
4. **Multiple service/command files to modify**
   - Each file refactor: ~10-20K tokens

**Recommendation format:**
```
"We're currently at [X]K/[Y]K tokens ([Z]% used). Given the [task description]
ahead, which may require [estimate]K tokens, I recommend continuing this work
in a new chat session to ensure we have sufficient context for testing and
debugging. I can document the remaining tasks in [file/todo list] before we
transition."
```

**Best practices:**
- **Document before transitioning**: Write remaining tasks to a file or todo list
- **Commit completed work**: Always commit before suggesting a new session
- **Provide clear handoff**: Include file paths, line numbers, and next steps
- **Update session summary**: If available, update project memory/notes

### Task Size Estimation

| Task Type | Estimated Tokens | Notes |
|-----------|-----------------|-------|
| Read single file (<500 lines) | 2-5K | Includes file content in context |
| Edit single file | 3-8K | Read + edit + verification |
| Write new file | 5-10K | Content generation + imports |
| Run tests | 5-15K | Output can be verbose |
| Refactor command file | 10-20K | Read + multiple edits + testing |
| Refactor service file | 15-30K | Larger files, more complexity |
| Multi-file phase | 30-60K | Several files + coordination |
| Create PR | 5-10K | Commit + PR description + push |

**Example calculation:**
```
Task: Refactor 5 command files + run tests + commit
Estimate: (5 files × 15K) + 10K (tests) + 5K (commit) = 90K tokens
Current usage: 120K/200K
Risk assessment: 120K + 90K = 210K > 200K limit ❌
Recommendation: Complete 2-3 files now, new session for remainder ✅
```
