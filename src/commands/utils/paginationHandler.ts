import { CommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { CONSTANTS } from './gachaConstants';

export async function handlePagination(interaction: CommandInteraction, embeds: EmbedBuilder[]) {
    let currentPage = 0;
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId("previous")
            .setLabel("Previous")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId("page")
            .setLabel(`Pull 1 of ${embeds.length}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId("next")
            .setLabel("Next")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(embeds.length <= 1)
    );

    const message = await interaction.followUp({ 
        embeds: [embeds[currentPage]], 
        components: [row] 
    });

    const collector = message.createMessageComponentCollector({ 
        time: CONSTANTS.pagination.TIMEOUT_MS 
    });

    collector.on("collect", async (i) => {
        if (i.user.id !== interaction.user.id) {
            await i.reply({ 
                content: "These aren't your pull results, Commander!", 
                ephemeral: true 
            });
            return;
        }

        currentPage = i.customId === "next" ? 
            (currentPage + 1) % embeds.length : 
            (currentPage - 1 + embeds.length) % embeds.length;

        row.components[0].setDisabled(currentPage === 0);
        row.components[1].setLabel(`Pull ${currentPage + 1} of ${embeds.length}`);
        row.components[2].setDisabled(currentPage === embeds.length - 1);

        await i.update({ 
            embeds: [embeds[currentPage]], 
            components: [row] 
        });
    });

    collector.on("end", () => {
        const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            row.components.map(component => 
                ButtonBuilder.from(component).setDisabled(true)
            )
        );
        message.edit({ 
            components: [disabledRow],
            content: "Gacha session ended. Use the command again for more pulls!"
        });
    });
} 