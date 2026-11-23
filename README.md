# Rapi Bot

A feature-rich Discord bot for gacha game communities with automated coupon redemption, daily reset notifications, URL embed fixes, and community moderation tools.

## 🚀 Quick Start

```bash
# Install dependencies
bun install

# Set up environment variables (see .env.example)
cp .env.example .env

# Run in development mode
bun run dev

# Run tests
bun run test:run

# Type check
bunx tsc --noEmit

# Production build and run
bun run build
bun run start
```

## ✨ Core Features

### 1. **Gacha Coupon Redemption System**
- **Auto-redemption**: Automatically redeem codes for Brown Dust 2 and Chaos Zero Nightmare
- **Multi-game support**: BD2, Chaos Zero Nightmare, Lost Sword
- **Smart notifications**: DM alerts for new codes, expiring codes, and weekly digests
- **User preferences**: Customizable notification settings
- **Mod tools**: Code management, subscriber analytics, manual triggers

**Commands**: `/redeem subscribe`, `/redeem edit`, `/redeem codes`, `/redeem status`, `/redeem preferences`, `/redeem switch`

### 2. **URL Embed Fix (Twitter/X + Pixiv)**
- Automatically improves embeds in art channels using proxy services
- Deduplication system prevents reposting the same content
- Supports multiple URL formats and normalizes to best proxies
- Works in `#art` and `#nsfw` channels

### 3. **Daily Reset Notifications**
- Configurable per-game notifications with checklists
- Random media attachments from CDN
- Timezone-aware scheduling
- Warning messages before resets

### 4. **Community Moderation**
- Slur auto-moderation: delete, DM, 30-minute timeout, mod-log embed
- `/mod slur` lets each server's moderators keep their own slur list alongside the built-in one, hidden from regular members
- Chat commands work in any channel; outside `#rapi-bot` they're limited to 3 per hour, and 8 blocked tries in an hour is a 5-minute timeout
- Sensitive terms checking with timeout enforcement
- Spam statistics and violation tracking
- Permission-based command access

### 5. **Chat Commands**
- 35+ fun response commands (media and text), listed by `/help`
- Work in any channel; unlimited in `#rapi-bot`, 3 per hour elsewhere (servers without a `#rapi-bot` channel have no limit)
- Moderators in the home server add gifs to the `booba?` / `booty?` pools with `/mod media add`

### 6. **Server Rules**
- `/rules` shows the home server's rules there; other servers get a pointer to their own `#rules` channel
- On startup the rules message in the home server's `#rules` is posted or updated

## 📁 Project Structure

```
src/
├── commands/          # Slash commands (/redeem, /spam, /gacha, etc.)
│   ├── utils/         # Command utilities (paginationBuilder, modMedia, spamModeration, ...)
│   └── tests/         # Command tests
├── chatCommands/      # Message-based chat commands
│   ├── mediaCommands.ts
│   ├── types.ts
│   └── utils/
├── handlers/          # Event handlers (messages, interactions)
├── services/          # Business logic (gacha, embedFix, rules, etc.)
├── bootstrap/         # Service initialization
├── config/            # Centralized configuration (assets, etc.)
├── utils/             # Shared utilities and helpers
├── discord.ts         # Bot orchestrator
└── index.ts           # Entry point with cron jobs
```

## 🏗️ Architecture

### Design Principles
- **Modular**: Each file has a single, well-defined responsibility
- **Service Layer**: Business logic in services, commands are thin wrappers
- **Utility Extraction**: Common patterns in reusable helpers
- **Type Safety**: Proper TypeScript types, no `as` casts
- **Centralized Config**: Asset URLs and constants in dedicated files

### Key Patterns

**Standard Command:**
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
            await replyEphemeral(interaction, 'Response');
        } catch (error) {
            await handleCommandError(interaction, error, 'command-name');
        }
    },
};
```

**Utility Functions:**
- `replyEphemeral()`, `replyWithEmbed()` - Interaction helpers
- `handleCommandError()` - Centralized error handling
- `checkModPermission()` - Permission checks
- `getAssetUrls()` - CDN asset management
- `createBasicEmbed()` - Embed templates

**Service Pattern:**
```typescript
export class MyService {
    private static instance: MyService;

    private constructor() { /* Initialize */ }

    public static getInstance(): MyService {
        if (!MyService.instance) {
            MyService.instance = new MyService();
        }
        return MyService.instance;
    }
}

export const getMyService = () => MyService.getInstance();
```

## 🧪 Testing

- **Framework**: Vitest
- **Coverage**: 712 tests across all modules
- **Run tests**: `bun run test:run`
- **Watch mode**: `bun run test:watch`

## 🔧 Environment Variables

```plaintext
# Discord
WAIFUTOKEN=your_discord_bot_token
CLIENTID=your_discord_client_id

# AWS (for S3 data storage)
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_REGION=us-east-1
S3_BUCKET=your_bucket_name

# CDN
CDN_DOMAIN_URL=https://your-cdn.com

# Optional
CATAPI=your_catapi_token
WAIFUPORT=8080
```

## 🤝 Contributing

### Adding a New Command

1. Create `src/commands/command-name.ts` using standard command structure, server-only (`.setContexts(InteractionContextType.Guild)`); every file there is loaded automatically
2. Add tests in `src/commands/tests/`
3. If user-facing, add it to `SLASH_COMMANDS` in `src/commands/help.ts`
4. If mod-only, add it under `/mod` instead

### Adding a New Service

1. Create service in `src/services/serviceName.ts`
2. Use singleton pattern with `getInstance()`
3. Export getter function: `export const getServiceName = () => ...`
4. Add initialization in `src/bootstrap/serviceInitializer.ts` if needed
5. Add tests in `src/services/tests/`

### Code Style

- **TypeScript**: Strict mode enabled
- **Imports**: Use `.js` extensions for local imports
- **Logging**: Use LogTape with appropriate levels (`warning`, `error`, `debug`)
- **Error Handling**: Always use `handleCommandError()` in commands
- **Type Safety**: Use `ChatInputCommandInteraction` (not `CommandInteraction`)

### Pull Request Guidelines

- Keep PRs focused on a single feature or fix
- Include test coverage for new functionality
- Run `bunx tsc --noEmit` and `bun run test:run` before submitting
- Follow commit message format: `type: description`
  - Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`
- Include testing checklist in PR description
- End PR description with: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`

## 📚 Additional Documentation

- **[CLAUDE.md](CLAUDE.md)**: Comprehensive codebase guide (LLM-optimized)
- **Gacha System**: See README section "Gacha Coupon Redemption System"
- **URL Embed Fix**: See README section "URL Embed Fix (Twitter/X + Pixiv)"
- **Daily Resets**: See README section "Managing Daily Reset Messages"

## 🐳 Docker Deployment

```bash
# Build and run
docker-compose up --build

# Stop
docker-compose down
```

## ☁️ Cloud Development (Claude Code on the web)

The gates pass on a clean clone with no `.env`, so this repo can be developed
from a cloud sandbox with no local machine.

```bash
# On a bare Ubuntu box: build tools, bun, dependencies. Idempotent.
bash scripts/cloud-setup.sh
```

Paste that script's contents into the **Setup script** box of a cloud environment
at claude.ai/code, and set these environment variables there:

```
PUPPETEER_SKIP_DOWNLOAD=true    # required: Chromium is 1.3 GB and not allowlisted
NODE_ENV=development
LOG_LEVEL=debug
```

Nothing else is needed for `bunx tsc --noEmit` or `bun run test:run`. Secrets are
only needed to actually run the bot, which a cloud VM cannot do — it pauses when
idle. Fixes ship by merging to `master`, which triggers CI -> Release -> Deploy.

See the "Cloud Sessions" section of `CLAUDE.md` for the sandbox's sharp edges
(`gh pr` does not work there; use `gh api`).

## 🔗 Links

- [Discord.js Documentation](https://discord.js.org/)
- [Bun Documentation](https://bun.sh/docs)
- [LogTape Documentation](https://logtape.org/)
- [Vitest Documentation](https://vitest.dev/)

## 📝 License

This project is open source. See the repository for license information.

---

## Detailed Feature Documentation

### Gacha Coupon Redemption System

#### Supported Games
| Game | Auto-Redeem | Manual Redeem |
|------|-------------|---------------|
| Brown Dust 2 (BD2) | ✅ | ✅ |
| Chaos Zero Nightmare (CZN) | ✅ | ✅ |
| Lost Sword | ❌ | ✅ (in game) |

#### User Commands
- `/redeem subscribe <game>` - Subscribe. A form asks for any account details the game needs, with where to find them; mode defaults to auto-redeem
- `/redeem edit <game>` - Change your account details without losing your subscription
- `/redeem unsubscribe <game>` - Unsubscribe
- `/redeem status [game]` - View subscription status
- `/redeem codes <game>` - View active codes
- `/redeem preferences <game>` - Configure notifications
- `/redeem switch <game> <mode>` - Switch between auto-redeem and notification-only (auto-redeem only for games that support it)
- `/redeem help` - View help and FAQs

New codes for Brown Dust 2 and Chaos Zero Nightmare are also posted in `#brown-dust-2` / `#chaos-zero-nightmare` (or `#bd2` / `#czn`), with **Redeem for me**, **Copy code** and a link to the official coupon page, plus a reminder when a code has a day or less left. Rapi pins each new-code post (she needs Pin Messages in that channel) and unpins it once the code expires or is removed. Add `announceChannelNames` to a game in `src/utils/data/gachaGamesConfig.ts` to post another game's codes.

#### Moderator Commands
- `/mod media add` - Add a `.gif` to the `booba?` or `booty?` pool (Rapi home server only; gif only, 25 MB max; named `<character>[_<variant>]_<oppai|booty>.gif`; asks you to confirm before uploading)
- `/mod media list` - Browse a pool's gifs one per page, with a link to open or download each, optionally one character's (home server only)
- `/mod media remove` - Remove a gif from a pool, with a preview and confirm first (home server only)
- `/mod redeem add` - Add new coupon code
- `/mod redeem remove` - Deactivate code
- `/mod redeem list` - View all codes with status indicators
- `/mod redeem stats` - View analytics
- `/mod redeem subscribers` - View subscriber list
- `/mod redeem trigger` - Manual auto-redemption
- `/mod redeem scrape` - Fetch codes from Gachafeed and BD2 Pulse now
- `/mod redeem lookup | unsub | reset` - Look up, unsubscribe or reset a member's subscription
- `/mod redeem update` - Change a member's account details (`userid`, `nickname`, `server`); anything left out stays as it is

Every `/mod redeem` tool except `list` works in the Rapi home server only, because codes and subscriptions are shared by every server. In other servers `/mod` doesn't show them at all.

Moderator tools live only under `/mod`; `/redeem` has the member subcommands only.

#### Scheduled Tasks
| Task | Production | Development |
|------|-----------|-------------|
| Auto-Redemption | Every 6h at :15 UTC | Every 3min |
| Code Scraping | Every 30min | Every 2min |
| Expiration Warnings | Daily 09:00 | Every 5min |
| Weekly Digest | Sundays 12:00 | Every 10min |
| Expired Cleanup | Daily 00:00 | Every 15min |
| Unpin finished code posts | :05 and :35 | Every 2min |

#### Adding a New Game

1. Update `GachaGameId` in `src/utils/interfaces/GachaCoupon.interface.ts`
2. Add config in `src/utils/data/gachaGamesConfig.ts`
3. If auto-redeem: Implement handler in `src/services/gachaRedemptionService.ts`
4. Restart bot

### URL Embed Fix

#### How It Works
1. Monitors `#art` and `#nsfw` channels for Twitter/X and Pixiv URLs
2. Extracts content IDs from any URL format
3. Converts to proxy services (fixupx.com, phixiv.net)
4. Suppresses original embeds
5. Prevents duplicates by tracking content IDs

#### Supported Formats

**Twitter/X** → `https://fixupx.com/i/status/{id}`
- `twitter.com/*/status/*`, `x.com/*/status/*`
- `mobile.twitter.com`, `vxtwitter.com`, `fxtwitter.com`, etc.

**Pixiv** → `https://phixiv.net/artworks/{id}`
- `pixiv.net/artworks/*`, `pixiv.net/en/artworks/*`
- `pixiv.net/member_illust.php?illust_id=*`

### Daily Reset System

#### Configuration
Edit `src/utils/data/gamesResetConfig.ts` to add/remove games.

**Structure:**
```typescript
const gameResetConfig: DailyResetConfig = {
  game: 'Game Name',
  channelName: 'discord-channel',
  roleName: 'RoleName', // Optional
  resetTime: { hour: 19, minute: 0 }, // UTC
  embedConfig: { /* ... */ },
  checklist: [ /* ... */ ],
  mediaConfig: { /* ... */ }
};
```

**Dev Mode**: Set `NODE_ENV=development` for 5-minute intervals instead of scheduled times.

### Logging

Uses [LogTape](https://logtape.org/) for structured logging.

**Levels:**
- Production: `warning` and `error` only
- Development: `debug` and above
- Override: `LOG_LEVEL=debug bun run start`

**Categories:**
- `bot` - General / commands
- `bot.discord` - Discord events
- `bot.gacha` - Coupon system
- `bot.embed-fix` - URL fixes
- `bot.scheduler` - Cron jobs
- `bot.media` - CDN media
- `bot.rules` - Rules management

### Permissions

**Moderator Commands:**
- Server owner, Administrator or Timeout Members permission, or a role named `mods`
- Check: `isModerator(interaction)` (or `await checkModPermission(interaction)`)
- `/mod` is hidden from members without the Timeout Members permission. To show it to a `mods` role without that permission, add the role to `/mod` under Server Settings > Integrations > Rapi
- `/mod` is registered per server: the home server gets every tool, other servers get it without `media` and with only `redeem list`. Everything else is registered globally
- Every slash command is server-only (none work in DMs)
- `/mod slur list | add | remove | test | history` manages this server's own slur list (see CLAUDE.md)
- `/mod spam stats | reset` shows spam protection statistics and resets a member's chat command limit
- `/mod redeem ...` holds the coupon moderator tools (add, remove, list, trigger, scrape, stats, subscribers, lookup, unsub, update, reset); home server only except `list`
- `/mod media add | list | remove` adds, lists or removes gifs in a chat command pool; home server only

**Rate Limiting:**
- Outside `#rapi-bot`, 3 chat commands per hour per user; `#rapi-bot` is unlimited
- Resets at top of every hour (UTC); `/spam check` shows the reset time only once you are out of uses, and says so when the server has no `#rapi-bot` channel (no limit there); 8 blocked attempts in an hour is a 5-minute timeout
- View status: `/spam check`
- Mod stats: `/mod spam stats` (moderators)

---

For complete codebase patterns and LLM-optimized context, see [CLAUDE.md](CLAUDE.md).
