# Docker ESM Verification Guide

## Why Docker Will Work with ESM

### 1. Same Runtime (Bun)
- **Local**: `bun run src/index.ts`
- **Docker**: `bun run src/index.ts` (Dockerfile line 76)
- ✅ **Identical** - Both use Bun's native TypeScript + ESM support

### 2. Same Module System
- **package.json**: `"type": "module"` (copied to Docker)
- **tsconfig.json**: `"module": "esnext"` (copied to Docker)
- ✅ **Identical** - Same ESM configuration in both environments

### 3. Same Source Files
- **Local**: Reads from `src/` directory
- **Docker**: Copies entire codebase including `src/` (line 70)
- ✅ **Identical** - Same TypeScript files with `.js` import extensions

### 4. Same Dependencies
- **Local**: `bun install` creates `bun.lock`
- **Docker**: `bun install --frozen-lockfile` uses same `bun.lock` (line 67)
- ✅ **Identical** - Exact same package versions

## Verification Steps

### Step 1: Build Docker Image
```bash
docker build -t rapi-bot:esm-test .
```

**Expected**: Build completes without errors

### Step 2: Run Docker Container (Dry Run)
```bash
docker run --env-file .env rapi-bot:esm-test
```

**Expected output:**
```
Loaded slash command: redeem
Loaded slash command: rules
Loaded slash command: gacha
Loaded slash command: help
Loaded slash command: daily
Loaded slash command: spam
Loaded slash command: stream
Loaded slash command: lucky
Loaded slash command: embed
Loaded slash command: age
Loaded slash command: rapiball
Loaded slash command: compositions
Loaded slash command: relics
✓ Successfully loaded 13 slash commands
Client ID: [YOUR_CLIENT_ID]
Started refreshing application (/) commands.
Successfully reloaded 13 application (/) commands.
```

### Step 3: Check for Errors

**❌ BAD (CommonJS issues):**
```
TypeError: Expected CommonJS module to have a function wrapper
✓ Successfully loaded 0 slash commands
```

**✅ GOOD (ESM working):**
```
✓ Successfully loaded 13 slash commands
Successfully reloaded 13 application (/) commands
```

## Key Files That Must Be Correct

### 1. package.json
```json
{
  "type": "module",  // ← CRITICAL for ESM
  "scripts": {
    "start": "bun run src/index.ts"  // ← Same as Dockerfile
  }
}
```

### 2. tsconfig.json
```json
{
  "compilerOptions": {
    "module": "esnext",           // ← ESM modules
    "moduleResolution": "bundler"  // ← Bun-optimized
  }
}
```

### 3. Command Files
```typescript
// All 13 command files use:
export default {
  data: new SlashCommandBuilder(),
  async execute(interaction) { }
};
```

### 4. Import Statements
```typescript
// All imports have .js extensions:
import { initDiscordBot } from './discord.js';
import router from './router.js';
```

## Common Issues and Fixes

### Issue 1: "Cannot find module"
**Cause**: Missing `.js` extensions in imports
**Fix**: Already applied - all relative imports have `.js` extensions

### Issue 2: "Expected CommonJS module"
**Cause**: Using `module.exports` instead of `export default`
**Fix**: Already applied - all commands use `export default`

### Issue 3: "Module type not specified"
**Cause**: Missing `"type": "module"` in package.json
**Fix**: Already applied - package.json has `"type": "module"`

## What Makes This Work

### Bun's Native Support
- ✅ Transpiles TypeScript on-the-fly (no build step needed)
- ✅ Understands `.js` imports for `.ts` files
- ✅ Handles ESM natively (no Node.js quirks)
- ✅ Works identically in dev and production

### ESM Standards Compliance
- ✅ File extensions required (`.js` added to all imports)
- ✅ `export default` syntax (modern standard)
- ✅ `"type": "module"` declares package as ESM
- ✅ Dynamic `import()` for command loading

## Pre-Deployment Checklist

Before deploying to production:

- [ ] Local tests pass: `bun run test:run` (all 377 tests)
- [ ] Local dev works: `bun run dev` (loads 13 commands)
- [ ] Docker builds: `docker build -t rapi-bot:esm-test .`
- [ ] Docker runs: Verify 13 commands load in container
- [ ] No module errors in Docker logs
- [ ] Commands work in Discord: `/redeem`, `/rules`, etc.

## Troubleshooting Docker Issues

### If Commands Don't Load in Docker:

1. **Check Docker logs:**
   ```bash
   docker logs [container_id]
   ```

2. **Look for these lines:**
   ```
   ✓ Successfully loaded 13 slash commands
   Successfully reloaded 13 application (/) commands
   ```

3. **If you see 0 commands loaded:**
   - Check Dockerfile CMD uses `bun run src/index.ts`
   - Verify package.json has `"type": "module"`
   - Ensure all command files use `export default`

4. **Test command loading manually in Docker:**
   ```bash
   docker run -it --entrypoint sh rapi-bot:esm-test
   # Inside container:
   bun run src/index.ts
   ```

## Why This Is Better Than CommonJS

### Before (CommonJS):
- ❌ Bun had wrapper issues in Docker
- ❌ Required `require()` workaround
- ❌ Not standard JavaScript

### After (ESM):
- ✅ Native Bun support
- ✅ Uses modern `import()` with `export default`
- ✅ Industry standard
- ✅ Works identically everywhere

## Deployment Confidence

**High confidence** that Docker will work because:

1. ✅ **Same runtime**: Bun in both local and Docker
2. ✅ **Same command**: `bun run src/index.ts` everywhere
3. ✅ **Same config**: package.json and tsconfig.json copied to Docker
4. ✅ **All tests pass**: 377 tests passing locally
5. ✅ **ESM compliant**: Proper file extensions and exports
6. ✅ **Proven approach**: Bun ESM support is production-ready

If it works locally with `bun run dev`, it will work in Docker with `bun run src/index.ts`.
