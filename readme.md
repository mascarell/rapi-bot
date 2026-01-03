# Loot and Waifus Bot

## Overview

The Loot and Waifus Bot is a Discord bot designed to manage daily resets and provide various utilities for gacha games. It includes features such as sending daily reset messages, playing music in voice channels, and responding to specific commands with images or text.

### Key Features

- **Daily Reset Notifications**: Sends messages to a designated channel about daily resets, special interception bosses, and tribe tower alerts.
- **24/7 Music Playback**: Connects to a voice channel to play music continuously from a specified folder.
- **Command Responses**: Responds to specific text commands with images, videos, or text messages.
- **Role and Channel Management**: Interacts with specific roles and channels to provide tailored experiences.
- **Hourly Rate Limiting**: Users are limited to 3 chat commands per hour, resetting at the top of every hour (UTC).
- **/age Command**: Shows how long the bot has been running (system uptime).
- **/spam Command**:
  - `/spam check` shows your current spam status, including:
    - Commands remaining
    - Time until reset (top of the hour)
    - Most used chat command
    - Your usage rank
    - Server average
  - `/spam stats` (Moderator Only: requires 'mods' role or admin permission) shows:
    - User activity
    - Violation tracking
    - System health
    - Top violators
    - Most spammed chat commands
    - Recommendations
  - `/spam reset` (Moderator Only) resets a user's rate limit in the current server.

## Permissions

- **Moderator commands** require the 'mods' role or Discord administrator permission.
- The 'king' role is no longer required or checked.

## Notes

- All chat commands are dynamically rate-limited; no static list is maintained.
- Rate limits reset for everyone at the top of each hour (UTC), not on a rolling window.
- Stats and limits are tracked per server (guild) unless otherwise noted.

## Prerequisites

- A Discord bot account with the necessary permissions.
- Node.js and npm installed on your machine.
- Docker and Docker Compose installed if you plan to run the bot in a container.

## Environment Variables

Create a `.env` file in the root of your project directory with the following variables:

```plaintext
WAIFUPORT=8080
WAIFUTOKEN=your_discord_bot_token
CATAPI=your_catapi_token
CLIENTID=your_discord_client_id
```

## Running the Bot Locally

### Development Mode

1. **Install npm packages**:
   ```bash
   npm install
   ```

2. **Run the bot in development mode**:
   ```bash
   npm run dev
   ```

### Production Mode

1. **Build the TypeScript project**:
   ```bash
   npm run build
   ```

2. **Run the bot**:
   ```bash
   npm run start
   ```

## Running the Bot with Docker

1. **Build and run the Docker container**:
   ```bash
   docker-compose up --build
   ```

2. **Stop the Docker container**:
   ```bash
   docker-compose down
   ```

## Setting Up Discord Channels and Roles

- **#nikke Channel**: Used for daily reset messages. Ensure the "Nikke" role is set up for notifications.
- **#rapi-radio Voice Channel**: The bot connects here to play music.
- **"Grounded" Role**: Users with this role will be ignored by the bot.

## Additional Information

- **Music Source**: Customize the music played by the bot by adding files to the `radio` folder.
- **Command Customization**: Add or modify commands by editing the files in the `src/commands` directory.

For more detailed setup and configuration, refer to the official Discord documentation for bot setup and permissions.

## Managing Daily Reset Messages

The bot uses a modular daily reset service to send automated messages for multiple games. To add or remove games:

### Adding a New Game

1. **Edit `src/utils/data/gamesResetConfig.ts`**:
   - Add a logo URL constant at the top (e.g., `const GAME_LOGO_URL = ...`)
   - Create a new config object following the `DailyResetConfig` interface:
     ```typescript
     const newGameResetConfig: DailyResetConfig = {
       game: 'Game Name',
       channelName: 'discord-channel-name',
       roleName: 'RoleName', // Optional - omit if no role ping needed
       resetTime: { hour: 19, minute: 0 }, // UTC time
       timezone: 'UTC',
       embedConfig: {
         title: 'ATTENTION PLAYERS!',
         description: 'Your message here',
         color: 0x00FF00, // Hex color code
         footer: { text: 'Footer text', iconURL: RAPI_BOT_THUMBNAIL_URL },
         thumbnail: GAME_LOGO_URL,
         author: { name: 'Rapi BOT', iconURL: RAPI_BOT_THUMBNAIL_URL }
       },
       checklist: [
         { name: '**Task Name**', value: 'Task description' }
       ],
       mediaConfig: {
         cdnPath: 'dailies/game-name/', // Path to images on CDN
         extensions: [...DEFAULT_IMAGE_EXTENSIONS],
         trackLast: 10
       }
     };
     ```
   - Add your config to the `dailyResetServiceConfig.games` array

2. **Upload media assets**:
   - Add images/GIFs to your CDN at the path specified in `mediaConfig.cdnPath`
   - Add a game logo to `assets/logos/` on your CDN

3. **Restart the bot** for changes to take effect

### Removing a Game

1. **Edit `src/utils/data/gamesResetConfig.ts`**:
   - Remove the game's config object
   - Remove its logo URL constant
   - Remove it from the `dailyResetServiceConfig.games` array

2. **Restart the bot** for changes to take effect

### Dev Mode Testing

When `NODE_ENV=development`, daily reset messages trigger every 5 minutes instead of at their scheduled times, making it easy to test changes without waiting.

---

For more details, see the code or use `/help` in Discord.

---

## Gacha Coupon Redemption System

The bot includes a multi-game coupon redemption system that automatically redeems coupon codes or notifies users about new codes for supported gacha games.

### Supported Games

| Game | Auto-Redeem | Manual Redeem |
|------|-------------|---------------|
| Brown Dust 2 (BD2) | ✅ Yes | ✅ Yes |
| NIKKE | ❌ No | ✅ Yes |
| Blue Archive | ❌ No | ✅ Yes |

### User Commands (`/redeem`)

| Command | Description |
|---------|-------------|
| `/redeem subscribe <game> <userid> <mode>` | Subscribe to coupon notifications |
| `/redeem unsubscribe <game>` | Unsubscribe from a game |
| `/redeem status [game]` | View your subscription status |
| `/redeem codes <game>` | View all active coupon codes |
| `/redeem preferences <game> [options]` | Configure notification preferences |
| `/redeem switch <game> <mode>` | Switch subscription mode without re-subscribing |
| `/redeem help` | View help and FAQs about the redemption system |

**Subscription Modes:**
- **Auto-Redeem** (🤖): Bot redeems all active codes immediately on subscribe, then every 6 hours + when new codes are added (BD2 only)
- **Notification Only** (📬): Receive DM notifications about new and expiring codes

**Notification Preferences:**
Users can customize which notifications they receive:
- **Expiration Warnings** - Alerts when codes are about to expire
- **Weekly Digest** - Weekly summary of code status
- **New Code Alerts** - Notifications when new codes are added

### Moderator Commands

| Command | Description |
|---------|-------------|
| `/redeem add <game> <code> <rewards> [expiration] [source]` | Add a new coupon code |
| `/redeem remove <game> <code>` | Deactivate a coupon code |
| `/redeem list <game>` | View all codes with expiration status indicators |
| `/redeem trigger <game>` | Manually trigger auto-redemption |
| `/redeem scrape` | Fetch new codes from BD2 Pulse |
| `/redeem stats [game]` | View redemption analytics |
| `/redeem subscribers <game> [mode]` | View paginated list of subscribers |
| `/redeem lookup <user>` | View a user's subscriptions |
| `/redeem unsub <user> <game>` | Force unsubscribe a user |
| `/redeem update <user> <game> <userid>` | Update a user's game ID |
| `/redeem reset <user> <game>` | Reset a user's redeemed codes |

### Scheduled Tasks

The system runs five automated tasks:

| Task | Production Schedule | Dev Schedule |
|------|---------------------|--------------|
| Weekly Digest | Sundays 12:00 UTC | Every 10 min |
| Expiration Warnings | Daily 09:00 UTC | Every 5 min |
| Auto-Redemption | Every 6 hours | Every 3 min |
| Code Scraping | Every 30 min | Every 2 min |
| Expired Code Cleanup | Daily 00:00 UTC | Every 15 min |

**Note:** Expired codes have a 24-hour grace period before being marked inactive to account for timezone differences. Codes show status indicators in `/redeem list`: ✅ active, ⏰ expiring within 24h, ❌ expired (grace period).

### Adding a New Game

1. **Update `GachaGameId` type** in `src/utils/interfaces/GachaCoupon.interface.ts`:
   ```typescript
   export type GachaGameId = 'bd2' | 'nikke' | 'blue-archive' | 'new-game';
   ```

2. **Add game config** in `src/utils/data/gachaGamesConfig.ts`:
   ```typescript
   'new-game': {
       id: 'new-game',
       name: 'New Game Name',
       shortName: 'NG',
       apiEndpoint: 'https://api.example.com/redeem', // Optional
       apiConfig: { appId: 'ng-live', method: 'POST' }, // Optional
       manualRedeemUrl: 'https://game.com/redeem', // For notification-only
       supportsAutoRedeem: true, // Set based on API availability
       logoPath: CDN_DOMAIN_URL + '/assets/logos/new-game.png',
       embedColor: 0xFF0000,
       maxNicknameLength: 20,
       maxCodeLength: 20,
       userIdFieldName: 'Player ID',
   }
   ```

3. **Implement redemption handler** (if auto-redeem supported) in `src/services/gachaRedemptionService.ts`:
   ```typescript
   class NewGameRedemptionHandler implements GameRedemptionHandler {
       // Implement redeem() method
   }

   // Register in constructor:
   this.handlers.set('new-game', new NewGameRedemptionHandler());
   ```

4. **Restart the bot** and deploy slash commands

### Data Model (NoSQL Ready)

The system uses a JSON document stored in S3 with a schema designed for easy migration to DynamoDB:

```
┌─────────────────────────────────────────────────────────────────┐
│ GachaCouponData (S3 JSON)                                       │
├─────────────────────────────────────────────────────────────────┤
│ coupons[]          → Future: Coupons table (PK: gameId, SK: code)
│ subscriptions[]    → Future: Subscriptions table (PK: discordId, SK: gameId)
│ redemptionHistory[]→ Future: History table (PK: discordId#gameId, SK: timestamp)
│ lastUpdated        → Metadata                                   │
│ schemaVersion      → For migrations                             │
└─────────────────────────────────────────────────────────────────┘
```

**Planned DynamoDB Structure:**

| Table | Partition Key | Sort Key | GSIs |
|-------|---------------|----------|------|
| Coupons | gameId | code | isActive+expirationDate |
| Subscriptions | discordId | gameId | gameId+mode |
| RedemptionHistory | discordId#gameId | timestamp | - |

**Redemption History:** All redemption attempts are logged with timestamps, success/failure status, and error codes for debugging and analytics.

### Performance Optimizations

The system includes several optimizations for 100+ subscribers:

- **Parallel Processing**: Uses `p-limit` for concurrent subscriber processing (5 concurrent)
- **DM Rate Limiting**: 100ms delay between Discord DMs to avoid rate limits
- **DM Failure Tracking**: Automatically tracks users who can't receive DMs and skips them in future batches
- **Batch Preferences Loading**: Loads all user preferences in a single call instead of per-subscriber
- **Request Timeout**: 10-second timeout with AbortController for API requests
- **Cache Indexing**: Pre-computed active coupons index for O(1) lookups
- **Batch Data Loading**: `getSubscriberContext()` reduces S3 reads
- **Duplicate Prevention**: Running tasks tracked to prevent overlapping executions
- **Exponential Backoff**: Configurable retry logic with jitter for API failures
- **Circuit Breaker**: Prevents cascading failures when game APIs are unavailable
- **Batch History Logging**: Redemption history entries are collected and written in a single batch

### Configurable Settings

All tunable parameters are centralized in `src/utils/data/gachaConfig.ts`:

| Setting | Default | Description |
|---------|---------|-------------|
| `API_TIMEOUT_MS` | 10000 | API request timeout |
| `MAX_RETRIES` | 3 | Maximum retry attempts |
| `RATE_LIMIT_DELAY` | 2000 | Delay between API calls |
| `DM_RATE_LIMIT_DELAY` | 100 | Delay between Discord DMs |
| `CONCURRENT_SUBSCRIBER_LIMIT` | 5 | Parallel subscriber processing |
| `CACHE_TTL` | 300000 | Data cache duration (5 min) |
| `CIRCUIT_BREAKER_THRESHOLD` | 5 | Failures before circuit opens |
| `CIRCUIT_BREAKER_COOLDOWN` | 60000 | Circuit recovery time |
| `FORCE_RERUN_COOLDOWN` | 7 days | Cooldown for re-run requests |
| `INITIAL_BACKOFF_MS` | 1000 | Starting backoff delay |
| `MAX_BACKOFF_MS` | 30000 | Maximum backoff delay |
| `BACKOFF_MULTIPLIER` | 2 | Exponential backoff factor |

### Guild Restrictions

The gacha coupon system is restricted to specific Discord servers. Guild IDs are stored in S3 at `data/gacha-coupons/guild-config.json` to keep them private from the open source repository.

### Analytics

The `/redeem stats` command provides comprehensive analytics:

**Per-Game Stats:**
- Subscriber counts (auto-redeem vs notification-only)
- Coupon counts (active, expired, no-expiry)
- Redemption statistics (total, unique users, average per user)
- Top 5 most redeemed codes

**System-Wide Stats:**
- Total subscribers across all games
- Total coupons in the system
- Total redemptions performed
- Per-game breakdown

### Environment Variables

Add to your `.env`:
```plaintext
CDN_DOMAIN_URL=https://your-cdn.com
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_REGION=us-east-1
S3_BUCKET=your-bucket-name
```

---
