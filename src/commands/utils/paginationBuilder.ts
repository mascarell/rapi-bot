/**
 * Pagination builder utility for Discord embeds
 *
 * Provides reusable pagination with navigation buttons for multi-page embeds.
 * Eliminates 120 lines of duplicate pagination logic from redeem.ts.
 */

import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ComponentType
} from 'discord.js';

export interface PaginationOptions {
  /**
   * Prefix for button custom IDs (e.g., 'list', 'subscribers')
   */
  customIdPrefix: string;

  /**
   * Timeout duration in milliseconds (default: 5 minutes)
   */
  timeoutMs?: number;

  /**
   * Whether to show page numbers on buttons (default: true)
   */
  showPageNumbers?: boolean;

  /**
   * Error message when unauthorized user clicks buttons
   */
  unauthorizedMessage?: string;
}

/**
 * Create a paginated message with navigation buttons
 *
 * @param interaction - The command interaction (must be deferred or replied)
 * @param pages - Array of embeds to paginate
 * @param options - Pagination configuration
 *
 * @example
 * ```ts
 * await interaction.deferReply({ flags: MessageFlags.Ephemeral });
 * await createPaginatedMessage(interaction, embedPages, {
 *   customIdPrefix: 'list',
 *   timeoutMs: 5 * 60 * 1000
 * });
 * ```
 */
export async function createPaginatedMessage(
  interaction: ChatInputCommandInteraction,
  pages: EmbedBuilder[],
  options: PaginationOptions
): Promise<void> {
  const {
    customIdPrefix,
    timeoutMs = 5 * 60 * 1000,
    showPageNumbers = true,
    unauthorizedMessage = 'You cannot use these buttons.'
  } = options;

  // Handle empty or single page
  if (pages.length === 0) {
    throw new Error('Cannot paginate empty pages array');
  }

  if (pages.length === 1) {
    await interaction.editReply({ embeds: [pages[0]] });
    return;
  }

  let currentPage = 0;
  const totalPages = pages.length;

  /**
   * Create button row with current state
   */
  const createButtonRow = (disabled: boolean = false): ActionRowBuilder<ButtonBuilder> => {
    const previousButton = new ButtonBuilder()
      .setCustomId(`${customIdPrefix}_previous`)
      .setLabel('Previous')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled || currentPage === 0);

    const pageButton = new ButtonBuilder()
      .setCustomId(`${customIdPrefix}_page`)
      .setLabel(showPageNumbers ? `Page ${currentPage + 1} of ${totalPages}` : `${currentPage + 1}/${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);

    const nextButton = new ButtonBuilder()
      .setCustomId(`${customIdPrefix}_next`)
      .setLabel('Next')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled || currentPage === totalPages - 1);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      previousButton,
      pageButton,
      nextButton
    );
  };

  // Send initial message with buttons
  const message = await interaction.editReply({
    embeds: [pages[currentPage]],
    components: [createButtonRow()]
  });

  // Create button collector
  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: timeoutMs
  });

  collector.on('collect', async (buttonInteraction) => {
    // Check if the user is authorized
    if (buttonInteraction.user.id !== interaction.user.id) {
      await buttonInteraction.reply({
        content: `❌ ${unauthorizedMessage}`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // Update current page based on button clicked
    if (buttonInteraction.customId === `${customIdPrefix}_next`) {
      currentPage = Math.min(currentPage + 1, totalPages - 1);
    } else if (buttonInteraction.customId === `${customIdPrefix}_previous`) {
      currentPage = Math.max(currentPage - 1, 0);
    }

    // Update the message with new page and button states
    await buttonInteraction.update({
      embeds: [pages[currentPage]],
      components: [createButtonRow()]
    });
  });

  collector.on('end', async () => {
    // Disable all buttons when collector expires
    try {
      await message.edit({
        components: [createButtonRow(true)]
      });
    } catch (error) {
      // Message might have been deleted, ignore error
    }
  });
}

/**
 * PaginationBuilder class (alternative API style)
 */
export class PaginationBuilder {
  private pages: EmbedBuilder[] = [];
  private options: Partial<PaginationOptions> = {};

  /**
   * Set pages to paginate
   */
  setPages(pages: EmbedBuilder[]): this {
    this.pages = pages;
    return this;
  }

  /**
   * Add a page to paginate
   */
  addPage(page: EmbedBuilder): this {
    this.pages.push(page);
    return this;
  }

  /**
   * Set custom ID prefix
   */
  setCustomIdPrefix(prefix: string): this {
    this.options.customIdPrefix = prefix;
    return this;
  }

  /**
   * Set timeout duration
   */
  setTimeout(ms: number): this {
    this.options.timeoutMs = ms;
    return this;
  }

  /**
   * Set whether to show page numbers
   */
  setShowPageNumbers(show: boolean): this {
    this.options.showPageNumbers = show;
    return this;
  }

  /**
   * Set unauthorized message
   */
  setUnauthorizedMessage(message: string): this {
    this.options.unauthorizedMessage = message;
    return this;
  }

  /**
   * Build and send the paginated message
   */
  async send(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!this.options.customIdPrefix) {
      throw new Error('Custom ID prefix is required');
    }

    await createPaginatedMessage(interaction, this.pages, this.options as PaginationOptions);
  }

  /**
   * Static method to create a builder
   */
  static create(): PaginationBuilder {
    return new PaginationBuilder();
  }
}
