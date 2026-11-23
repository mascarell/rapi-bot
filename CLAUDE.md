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
│   ├── utils/         # Command utilities (paginationBuilder, modMedia, spamModeration, ...)
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
| `/redeem subscribe` | `handleSubscribe` | Subscribe + immediate auto-redeem. Missing details open a form |
| `/redeem edit` | `handleEdit` | Change account details in place (form, prefilled) |
| `/mod redeem subscribers` | `handleModSubscribers` | Paginated subscriber list (mod) |
| `/mod redeem list` | `handleModList` | Codes with status indicators |
| `/redeem help` | `handleHelp` | FAQs (mod-aware) |

### Subscription Modes
- **auto-redeem**: Immediate redemption on subscribe, then every 6h + on new codes
- **notification-only**: DM alerts only, manual redemption

### Important Behaviors
1. **Auto-redeem on subscribe**: `redeemAllForUser()` called immediately
2. **Expired code grace period**: 24h before `isActive=false`
3. **DM skip logic**: No DM if only expired codes (no meaningful results)
4. **Real-time filtering**: `getActiveCoupons()` filters by expiration date at runtime
5. **Account details come from a form** (`runIdentityFlow` in redeem.ts). If any
   detail a game needs is missing from the slash options, a Discord modal asks
   for all of them, built from the game config: `userIdFieldName` +
   `userIdHint`, then each `extraUserFields` entry (`hint`; `choices` become a
   dropdown). All validation errors are shown at once with a **Fix details**
   button that reopens the form prefilled, up to 3 tries. Typed options still
   work and skip the form.
6. **Details are checked as you subscribe or edit.** The immediate redemption
   doubles as the check: if the game rejects the account
   (`identityRejected`), subscribe removes the record and edit calls
   `revertGameIdentity`, and the user is offered the form again. With no
   active codes there's nothing to check against; never test identity with a
   fake code (STOVE locks an account for ~6h after repeated invalid codes).
   A run stops at the first `IncorrectUser` rather than sending every code.
7. **Accepted accounts are kept.** `identityVerifiedAt` is stamped whenever the
   game redeems a code or says it was already used on the account. An edit
   keeps the old details in `previousIdentity` until the new ones are
   accepted. When the game rejects an account, `resolveIdentityRejection`
   decides on the record as it is *now*: a verified one is kept and DM'd once
   (`identityRejectedAt`); a rejected edit falls back to `previousIdentity`;
   only details never accepted are removed.
   - **Runs take minutes and users edit meanwhile.** Every write from a run
     carries the identity it used (`IdentityRef`) and is skipped if the record
     no longer holds it, so old results never land on new details. Revert
     touches only the account fields, never mode or preferences.
8. **Always pass the full identity** (`{ userId, fields }`) to `redeemCode` /
   `redeemMultipleCodes`. A bare id has no CZN nickname or server, so the
   redemption fails before reaching STOVE.
9. **CZN `5162`/`5164` are `RestrictedCode`**, not `IncorrectUser`: the code is
   for another region or server. Only outer `-90009` means the account is wrong.
10. **New codes are posted in the game's channel** (`couponAnnouncementService`),
    in allowlisted servers, to the first of `announceChannelNames` that exists
    (CZN `chaos-zero-nightmare`/`czn`, BD2 `brown-dust-2`/`bd2`). Buttons:
    **Redeem for me** (opens the subscribe form if not subscribed), **Copy
    code** (ephemeral, just the code), and a link to `manualRedeemUrl`. Custom
    ids are `coupon:<action>:<game>[:<code>]`, routed globally in `discord.ts`,
    so buttons on old posts keep working after a restart. The daily 09:00 UTC
    expiry run posts a warning for codes with a day or less left. Posting never
    throws into the DMs and redemptions that follow it. New-code posts are
    pinned (the "pinned a message" notice is deleted); `unpinFinished`, at :05
    and :35, unpins Rapi's posts whose code is no longer in `getActiveCoupons`.
    It matches posts by title (`newPostTitle`) and reads the code from the
    embed (`codeFromPost`), so nothing is stored. Expiry warnings aren't pinned.
11. **One member, one code, one send at a time** (`pendingRedemptions`): the
    new-code fan-out claims its subscribers before posting, and the six-hourly
    run claims each code until its batch write; a button press for a claimed
    pair is told it's in progress. A failed press isn't sent again for 6 h
    (10 min for network errors), and nothing is sent for details the game has
    flagged (`identityRejectedAt`).
12. **A form opened from a public message must be answered ephemerally.**
    `acknowledge()` only uses `deferUpdate` when the source message is
    ephemeral; otherwise the reply would overwrite the public post with one
    member's account details.
13. **Defer before storage.** `/redeem unsubscribe | status | codes |
    preferences | switch` and `/mod redeem add | remove | unsub | update |
    lookup | reset | stats` are deferred by the dispatcher (`MEMBER_DEFERRED`,
    `MOD_DEFERRED`), so their handlers answer with `editReply`. `subscribe` and
    `edit` can't be deferred because they may open a form; they rely on the
    allowlist check being instant, which `gachaGuildConfigService` guarantees by
    answering from an expired cache while it refreshes in the background.

The schema stays at version 1: every field added since (`gameUserFields`,
`identityVerifiedAt`, `identityRejectedAt`, `previousIdentity`) is optional, so stored records
need no migration.

### Status Indicators (in /mod redeem list)
- ✅ Active (not expiring soon)
- ⏰ Expiring within 24h
- ❌ Expired (in 24h grace period)

## Permission System
- One moderator rule, `isModerator(interaction)` in `utils/permissionHelpers.ts`: server owner, Administrator, Timeout Members, or a role named `mods`
- `checkModPermission(interaction)` (used by redeem.ts help) returns the same rule; no member fetch
- Mod-only tools live under `/mod`, which checks `isModerator()` once before dispatching; `/redeem` has no mod gate left

## Moderator Commands (`/mod`)

`src/commands/mod.ts`. Discord can hide a whole top-level command from members
without a permission (`setDefaultMemberPermissions`), but **not a subcommand**,
so moderator tools belong under `/mod` rather than as subcommands of
member-facing commands like `/redeem` or `/spam`. Mod-only tools are being
migrated here one command set at a time.

- Hidden from members without **Timeout Members**; server-only (`setContexts(Guild)`, like every slash command).
- **Registered per server** (`utils/commandRegistration.ts`): every other command is
  global, `/mod` is put in each guild on ready and on `GuildCreate`. The home
  server gets the whole command; elsewhere `modCommandFor` drops `media` and
  every `redeem` subcommand not in `OPEN_EVERYWHERE`. The refusals in the
  handlers stay as the real check.
- Picker visibility is a convenience, not the check: admins can override it in
  Server Settings > Integrations. Every subcommand and the autocomplete re-check
  the caller with `isModerator()` (owner, Administrator, Timeout Members, or a
  role named `mods`).
- `/mod spam stats | reset` (logic in `commands/utils/spamModeration.ts`). The limit and the timeout trigger (`timeoutViolations`, 8 blocked attempts in an hour) both live in `CHAT_COMMAND_RATE_LIMIT` (`utils/chatCommandRateLimiter.ts`); the message handler and the stats embed read it from there. `/spam check` shows the reset time (`<t:unix:R>`) only at 0 uses left, ranks within the current hour, and says "no limit" in a server without a `#rapi-bot` channel. Moderator tools live only under `/mod`; `/spam` keeps just `check` for members.
- `/mod redeem add | remove | list | trigger | unsub | update | lookup | reset | scrape | stats | subscribers` (`update` takes `userid`, `nickname`, `server`, all optional; omitted ones keep their stored value, and it saves through `updateGameIdentity` like `/redeem edit`) (option builder `addModRedeemSubcommands`, dispatch `executeModRedeem`, code autocomplete `autocompleteRedeemCode`, all in `commands/redeem.ts`; same gacha server allowlist as `/redeem`, and everything except `list` is home-server only via `OPEN_EVERYWHERE`). These live only under `/mod`; `/redeem` has the member subcommands only.
- `/mod media add` (home server only, `MEDIA_HOME_GUILD_ID`; elsewhere an ephemeral refusal and empty autocomplete): adds a `.gif` (max 25 MB, checked by content type, extension and `GIF8` header) to the `booba?` / `booty?` S3 pools. Name is `<characterSlug>[_<variant>]_<oppai|booty>.gif`, lowercase `[a-z0-9_]`, and `_2_`, `_3_` before the suffix on a collision so nothing is overwritten. Shows an Add/Cancel preview first, then uploads, invalidates the media list cache and posts to the mod-log channel. Logic in `services/mediaPoolService.ts`, command glue in `commands/utils/modMedia.ts`, config in `utils/data/mediaPoolConfig.ts`. Characters come from the NIKKE asset manifest.
- `/mod media list | remove` (same home-only and moderator gates): `list` shows one gif per page with an Open / download link to the original (`listPoolFiles`, `buildListPages`; optional character filter by `<slug>_` prefix, which also matches longer slugs that start the same way, e.g. `rapi` includes `rapi_red_hood`); `remove` autocompletes file names, accepts only a bare name that exists under the pool prefix (`findPoolFile`), shows a Remove/Cancel preview, then deletes, invalidates the list cache and posts to the mod-log.
- A slash command definition is capped at 8000 characters; `commands/tests/modCommandSize.test.ts` checks `/mod` against it.
- **Everything acts on the calling server only**, except `/mod redeem`: coupons and subscriptions are shared by every server, so its write subcommands (`add, remove, trigger, unsub, update, reset, scrape`), `subscribers` and `lookup` are home-server only (`HOME_GUILD_ID` in `utils/data/homeGuild.ts`; the code autocomplete is empty elsewhere). only `list` works in every allowlisted server (an allow-list, `OPEN_EVERYWHERE`, so new subcommands are home-only by default). The bot is open source and
  runs in other communities' servers.

### `/mod slur`: per-server slur lists

| Subcommand | What it does |
|---|---|
| `list` | This server's terms (spoilered, paginated) and a *count* of built-in terms |
| `add terms:` | Up to 10 comma-separated terms; validates, then asks to confirm with buttons |
| `remove term:` | Removes one of this server's terms (autocomplete, moderators only) |
| `test text: [term:]` | Dry run through the live matcher; names server matches, counts built-in ones; `term` tries a candidate without saving |
| `history user:` | A member's auto-moderation record in this server |

- **Built-in list:** `data/slur-moderation/slur-list.json`. Applies everywhere,
  maintainer-only, edited in S3, never written by a command.
- **Server list:** `data/slur-moderation/guild-lists/<guildId>.json`
  (`{ schemaVersion, guildId, lastUpdated, updatedBy, terms[] }`). Applies only
  in that server.
- Edits re-read from S3 under a lock and are refused if the read fails, so a
  list is never rewritten from cache. A change is live immediately.
- Terms must be 3 to 50 characters with a letter or digit, and must not contain
  `\ [ ] ? |` (obscenity pattern syntax).
- **Every term must match its own spelling** (`matcherReading()`). obscenity
  transforms messages but not terms: it collapses most doubled letters, reads
  digits and some symbols as letters, and drops accents. A doubled-letter term
  is compiled in its collapsed form, so `kitty` works. A term nothing can match
  (accented or non-Latin letters, digits) is refused at `add`, and skipped with
  a logged count if it's on the built-in list. Known limit: numeric codes and
  CJK terms can't be listed.
- **The built-in list is never shown to servers.** Only a count appears in
  `list` and `test`, because anyone can create a server and moderate it.
- Changes are noted in `#moderator-only` when the server has it.

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
- Sensitive terms checking
- Chat commands run in any channel. Outside `#rapi-bot` they're limited to 3 per hour (`ChatCommandRateLimiter`; 8 blocked tries in an hour is a 5-minute timeout); `#rapi-bot` is unlimited. A guild with no `#rapi-bot` channel has no limit. Chat command names are matched by `name` (e.g. `booba?`), not registry key
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
1. Create file in `src/commands/command-name.ts`; `discord.ts` loads every file there
2. Use standard command structure with proper imports, including `.setContexts(InteractionContextType.Guild)` (`commandContexts.test.ts` checks every command)
3. Add tests in `src/commands/tests/`
4. If user-facing, add it to `SLASH_COMMANDS` in `src/commands/help.ts` (chat commands are listed automatically)
5. If mod-only, make it a subcommand of `/mod` instead

**Adding a new /redeem subcommand:**
1. Add to SlashCommandBuilder (around line 1170-1220)
2. Create `handleXxx` function
3. Add to switch statement in `execute()`
4. If mod-only, add it to `addModRedeemSubcommands` and `executeModRedeem` (it runs as `/mod redeem <name>`) instead
5. Update `handleHelp` if user-facing

**Pagination Pattern** (`src/commands/utils/paginationBuilder.ts`):
```typescript
import { createPaginatedMessage } from "../commands/utils/paginationBuilder.js";

await createPaginatedMessage(interaction, embedArray, {
    customIdPrefix: "my-command",
    timeoutMs: 5 * 60 * 1000,  // 5 minutes
});
```

## Environment Variables

Every name below is read somewhere in `src/` or `scripts/`; there are no others.
`S3_BUCKET` is a TypeScript constant in `src/utils/cdn/config.ts`, not an env var.

```
WAIFUTOKEN, CLIENTID, WAIFUPORT        # Discord + express
S3BUCKET, S3ACCESSKEYID, S3SECRETKEY   # DigitalOcean Spaces (the only datastore)
CDN_DOMAIN_URL                         # asset URLs; unset breaks embed thumbnails
TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET
YOUTUBE_API_KEY
NODE_ENV, LOG_LEVEL
```

None of these are needed to run the gates — see "Cloud Sessions" below.

## Cron Jobs (index.ts)
- Auto-redemption: every 6h at :15, i.e. 00:15/06:15/12:15/18:15 UTC (prod), off the :00/:30 code sync / 3min (dev)
- Code scraping: every 30min (prod) / 2min (dev)
- Expired cleanup: daily midnight (prod) / 15min (dev)
- Unpin finished code posts: :05 and :35 (prod) / code-scraping interval (dev)
- Expiration warnings: daily 09:00 UTC; weekly digest: Sundays 12:00 UTC

## Rules Management System

### Architecture
- `rulesManagementService.ts` - Manages rules messages in #rules channels
- Uses same S3 guild config as gacha coupon system (`allowedGuildIds`)
- Posts or updates the rules message on startup in the **home server only**: the text names that server's emoji, channel and owner

### Commands
| Command | Access | Description |
|---------|--------|-------------|
| `/rules` | Everyone | Home server: the rules (ephemeral). Other allowlisted servers: a pointer to their own `#rules` |

### Important Behaviors
1. **Auto-initialization**: On startup, the home server's `#rules` gets the message (other allowlisted guilds are skipped)
2. **Dynamic channel finding**: Searches for a channel named `rules`
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

## Cloud Sessions (Claude Code on the web)

This repo is set up so it can be developed entirely from a cloud sandbox with no
local machine. `scripts/cloud-setup.sh` provisions the box; the SessionStart hook
in `.claude/settings.json` runs it, and exits immediately on local machines.

What differs from a local session:

- **`gh pr` and `gh issue` do not work.** The sandbox's GitHub proxy rejects
  GraphQL, which those subcommands use. Use REST:
  `gh api repos/mascarell/rapi-bot/pulls -f title=... -f head=... -f base=master`
  to open one, `gh api repos/mascarell/rapi-bot/pulls --jq '.[].title'` to read.
  The **Create PR** button in the web UI also works.
- **Tests need no secrets.** `bunx tsc --noEmit` and `bun run test:run` both pass
  on a clean clone with no `.env` at all. A test that needs a credential is a bug
  in the test.
- **`PUPPETEER_SKIP_DOWNLOAD=true` is required.** Chromium is ~1.3 GB and its CDN
  is not on the default egress allowlist, so leaving it unset is the most likely
  reason `bun install` fails. `src/services/bd2PulseScraperService.ts` is the only
  consumer and cannot run in a sandbox without a Custom allowlist.
- **Install bun from npm, not bun.sh.** `bun.sh` is not allowlisted; the Dockerfile's
  `curl -fsSL https://bun.sh/install` hangs there. `npm install -g bun` works.
- **No bot runtime.** Cloud VMs pause when idle, so never try to hold a Discord
  gateway connection from one. Shipping is: merge to `master` -> CI -> Release ->
  Deploy to the droplet, entirely on GitHub Actions.
- **Push often.** Whether uncommitted work survives VM reclamation is not
  documented anywhere.

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
