import { Message, ChannelType, TextChannel, PartialMessage } from 'discord.js';
import { CustomClient } from '../utils/interfaces/CustomClient.interface.js';
import { getChatCommand, getChatCommandNames } from '../chatCommands/index.js';
import { checkSensitiveTerms } from '../utils/sensitiveTermsChecker.js';
import { checkEmbedFixUrls } from '../services/embedFix/urlFixService.js';
import { ChatCommandRateLimiter } from '../utils/chatCommandRateLimiter.js';
import { getRandomCdnMediaUrl } from '../utils/cdn/mediaManager.js';
import { findRoleByName, logError, isMessageCommand } from '../utils/util.js';
import { logger } from '../utils/logger.js';
import { getUptimeService } from '../services/uptimeService.js';

const PRE = '/';
const DEFAULT_IMAGE_EXTENSIONS = ['.gif', '.png', '.jpg', '.webp'] as const;

/**
 * Helper to check if an error is a timeout/network error
 */
function isTimeoutOrNetworkError(error: any): boolean {
    return (
        error.name === 'AbortError' ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'EAI_AGAIN'
    );
}

/**
 * Helper to check if an error is a file too large error
 */
function isFileTooLargeError(error: any): boolean {
    return error.code === 40005 || error.status === 413;
}

/**
 * Handle incoming messages (bot's messageCreate event)
 */
export async function handleMessage(msg: Message, bot: CustomClient): Promise<void> {
    // Filter: Ignore @everyone/@here mentions or missing context
    if (msg.mentions.everyone || !msg.guild || !msg.member || msg.author.bot) return;

    // Filter: Ignore welcome channel
    const welcomeChannel = msg.guild.channels.cache.find(
        channel => channel.type === ChannelType.GuildText && channel.name.toLowerCase() === 'welcome'
    ) as TextChannel | undefined;
    if (welcomeChannel?.id === msg.channel.id) {
        return;
    }

    // Check sensitive terms
    await checkSensitiveTerms(msg);

    // Check for scarrow mentions
    await checkScarrowMention(msg);

    // Check for embed-worthy URLs (Twitter, Pixiv, etc.)
    await checkEmbedFixUrls(msg);

    // Command processing
    const isRapiBotChannel = msg.channel.type === ChannelType.GuildText &&
        (msg.channel as TextChannel).name === 'rapi-bot';

    const strippedContent = msg.content
        .toLowerCase()
        .replace(/https?:\/\/[\S]+/g, '')
        .replace(/<@!?\d+>/g, '')
        .trim();

    const args = msg.content.startsWith(PRE)
        ? msg.content.slice(PRE.length).trim().split(/\s+/)
        : [strippedContent];

    const command = args.shift()?.toLowerCase();
    if (!command) return;

    // Check if command exists
    const allChatCommandNames = getChatCommandNames();
    const isChatCommand = allChatCommandNames.includes(command);

    const matchedCommand = bot.commands.get(command);
    const chatCommand = getChatCommand(command);

    if (!matchedCommand || !chatCommand || chatCommand.name.toLowerCase() !== command) {
        return;
    }

    try {
        const ignoredRole = findRoleByName(msg.guild, 'Grounded');
        const contentCreatorRole = findRoleByName(msg.guild, 'Content Creator');

        const hasIgnoredRole = ignoredRole && msg.member.roles.cache.has(ignoredRole.id);
        const hasContentCreatorRole = contentCreatorRole && msg.member.roles.cache.has(contentCreatorRole.id);

        // Rate limit all chat commands (except in rapi-bot channel)
        if (isChatCommand && !isRapiBotChannel) {
            const guildId = msg.guild.id;
            const userId = msg.author.id;

            if (!ChatCommandRateLimiter.check(guildId, userId, command)) {
                const remainingTime = ChatCommandRateLimiter.getRemainingTime(guildId, userId);
                const remainingSeconds = Math.ceil(remainingTime / 1000);

                // Check for excessive violations
                const violatorCount = (ChatCommandRateLimiter as any).violators?.[guildId]?.[userId] || 0;
                if (violatorCount >= 8) {
                    try {
                        await msg.member?.timeout(300000, 'Spamming chat commands (8+ violations in 1 hour)');
                        await msg.reply({
                            content: `Commander ${msg.author}, you have been timed out for 5 minutes due to excessive spam violations.`,
                        });
                    } catch (err) {
                        logger.error`Failed to timeout user: ${err}`;
                    }
                    return;
                }

                // Send temporary warning message
                const rapiBotChannelId = msg.guild.channels.cache.find(
                    channel => channel.type === ChannelType.GuildText && channel.name === 'rapi-bot'
                )?.id || 'unknown';

                const warningMsg = await msg.reply({
                    content: `Commander ${msg.author}, you're using chat commands too frequently. Please wait ${remainingSeconds} seconds before trying again. Use \`/spam check\` to see your status.\n\nUse <#${rapiBotChannelId}> for unlimited commands.`
                });

                // Delete warning after 5 seconds
                setTimeout(async () => {
                    try {
                        await warningMsg.delete();
                    } catch {
                        // Message likely already deleted
                    }
                }, 5000);

                return;
            }
        }

        if (isMessageCommand(matchedCommand) && isMessageCommand(chatCommand)) {
            // Increment command counter
            getUptimeService().incrementCommands();

            if (matchedCommand.name === 'content' && hasContentCreatorRole) {
                await matchedCommand.execute(msg, args);
            } else if (!hasIgnoredRole) {
                await matchedCommand.execute(msg, args);
            }
        }
    } catch (error: any) {
        // Handle common CDN/Discord errors gracefully
        if (isFileTooLargeError(error)) {
            await msg.reply(
                'Commander, the selected media file is too large for this server (>10MB). ' +
                'You may need to boost the server to allow larger file uploads, or try the command again for a different file.'
            ).catch(() => {});
        } else if (isTimeoutOrNetworkError(error)) {
            logger.error`Chat command ${command} timed out for guild ${msg.guild?.name}: ${error.message}`;
            await msg.reply('Commander, the request timed out. Please try again in a moment.').catch(() => {});
        } else {
            // Log unexpected errors and notify user
            logError(
                msg.guild?.id || 'UNKNOWN',
                msg.guild?.name || 'UNKNOWN',
                error instanceof Error ? error : new Error(String(error)),
                `Executing command: ${command}`
            );
            msg.reply({
                content: 'Commander, I think there is something wrong with me... (something broke, please ping @sefhi to check what is going on)'
            }).catch(replyError => {
                logError(
                    msg.guild?.id || 'UNKNOWN',
                    msg.guild?.name || 'UNKNOWN',
                    replyError instanceof Error ? replyError : new Error(String(replyError)),
                    'Sending error message'
                );
            });
        }
    }
}

/**
 * Handle message updates (bot's messageUpdate event)
 */
export async function handleMessageUpdate(
    oldMsg: Message | PartialMessage,
    newMsg: Message | PartialMessage
): Promise<void> {
    try {
        if (newMsg.partial) {
            await newMsg.fetch();
        }
        if (oldMsg.partial) {
            try {
                await oldMsg.fetch();
            } catch {
                // Old message may not be fetchable, continue with what we have
            }
        }

        if (!newMsg.guild || !newMsg.member || newMsg.author?.bot) {
            return;
        }

        await checkSensitiveTerms(newMsg as Message);
    } catch (error) {
        logger.error`Error handling message update: ${error}`;
    }
}

/**
 * Checks if a message mentions scarrow or the specific user ID and responds with an image
 * @param message - Discord message to check
 */
async function checkScarrowMention(message: Message): Promise<void> {
    try {
        // Early exit conditions
        if (!message.guild?.id || !message.member || message.author.bot) {
            return;
        }

        const SCARROW_USER_ID = '526213488096313354';
        const messageContent = message.content.toLowerCase();

        // Check if message mentions scarrow by name or by user ID
        const mentionsScarrowByName = messageContent.includes('scarrow');
        const mentionsScarrowById = message.mentions.users.has(SCARROW_USER_ID);

        if (mentionsScarrowByName || mentionsScarrowById) {
            const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                'commands/scarrow/',
                message.guild.id,
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                }
            );

            // Try to find the salute emoji in the guild, leave blank if not found
            const saluteEmoji = message.guild.emojis.cache.find(emoji => emoji.name === 'salute') || '';

            const replyMessage = await message.reply({
                content: `Thank You Commander <@${SCARROW_USER_ID}> ${saluteEmoji}`,
                files: [randomCdnMediaUrl]
            });

            // React with salute emoji if available
            if (saluteEmoji) {
                try {
                    await replyMessage.react(saluteEmoji);
                } catch (error) {
                    logger.warning`Failed to react with salute emoji: ${error}`;
                }
            }
        }
    } catch (error) {
        // Log error but don't throw to avoid breaking message processing
        logError(
            message.guild?.id || 'UNKNOWN',
            message.guild?.name || 'UNKNOWN',
            error instanceof Error ? error : new Error(String(error)),
            'checkScarrowMention'
        );
    }
}
