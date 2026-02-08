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
- **Auto-redemption**: Automatically redeem codes for BD2 (API-integrated)
- **Multi-game support**: BD2, NIKKE, Blue Archive
- **Smart notifications**: DM alerts for new codes, expiring codes, and weekly digests
- **User preferences**: Customizable notification settings
- **Mod tools**: Code management, subscriber analytics, manual triggers

**Commands**: `/redeem subscribe`, `/redeem codes`, `/redeem status`, `/redeem preferences`

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
- Rate limiting for chat commands (3 per hour)
- Sensitive terms checking with timeout enforcement
- Spam statistics and violation tracking
- Permission-based command access

### 5. **Chat Commands**
- 35+ fun response commands (media and text)
- Dynamic rate limiting
- Usage analytics and leaderboards

## 📁 Project Structure

```
src/
├── commands/          # Slash commands (/redeem, /spam, /gacha, etc.)
│   ├── utils/         # Command utilities (commandBase, paginationBuilder)
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

1. Create `src/commands/command-name.ts` using standard command structure
2. Import in `src/discord.ts` and add to command collection
3. Add tests in `src/commands/tests/`
4. Update `/help` command if user-facing

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
| NIKKE | ❌ | ✅ |
| Blue Archive | ❌ | ✅ |

#### User Commands
- `/redeem subscribe <game> <userid> <mode>` - Subscribe (auto-redeem or notification-only)
- `/redeem unsubscribe <game>` - Unsubscribe
- `/redeem status [game]` - View subscription status
- `/redeem codes <game>` - View active codes
- `/redeem preferences <game>` - Configure notifications
- `/redeem help` - View help and FAQs

#### Moderator Commands
- `/redeem add` - Add new coupon code
- `/redeem remove` - Deactivate code
- `/redeem list` - View all codes with status indicators
- `/redeem stats` - View analytics
- `/redeem subscribers` - View subscriber list
- `/redeem trigger` - Manual auto-redemption
- `/redeem scrape` - Fetch codes from BD2 Pulse

#### Scheduled Tasks
| Task | Production | Development |
|------|-----------|-------------|
| Auto-Redemption | Every 6h | Every 3min |
| Code Scraping | Every 30min | Every 2min |
| Expiration Warnings | Daily 09:00 | Every 5min |
| Weekly Digest | Sundays 12:00 | Every 10min |
| Expired Cleanup | Daily 00:00 | Every 15min |

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
- Require `mods` role OR Discord administrator permission
- Check: `await checkModPermission(interaction)`

**Rate Limiting:**
- 3 chat commands per hour per user
- Resets at top of every hour (UTC)
- View status: `/spam check`
- Mod stats: `/spam stats`

---

For complete codebase patterns and LLM-optimized context, see [CLAUDE.md](CLAUDE.md).
