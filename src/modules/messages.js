const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const log = require('../utils/logger');

const PENDING_USER = new Map();
const COOLDOWN_MS = 60000;
const lastSent = new Map(); // "userId:guildId:targetId" -> timestamp

const MSG_TYPES = {
  send: { emoji: '💬', name: 'رسالة', title: '💬 رسالة خاصة', color: 0x5865F2, dmTitle: '💬 {{USER}} تواصل معك', description: '{{TEXT}}\n\n**{{GUILD}}**', placeholders: ['TEXT', 'GUILD'] },
  summon: { emoji: '📣', name: 'استدعاء', title: '📣 استدعاء', color: 0xF1C40F, dmTitle: '📣 استدعاء لك', description: 'نرجى منك فتح تكت في اسرع وقت.\n\n{{TEXT}}\n\n**{{GUILD}}**', placeholders: ['TEXT', 'GUILD'] },
  thanks: { emoji: '🙏', name: 'شكر', title: '🙏 رسالة شكر', color: 0x57F287, dmTitle: '🙏 شكراً لك', description: 'نشكرك على تعاونك ووقتك.\n\n{{TEXT}}\n\n**{{GUILD}}**', placeholders: ['TEXT', 'GUILD'] },
};

function messagesEmbed(client, guild) {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('💬 نظام الرسائل')
    .setDescription([
      'أرسل رسالة خاصة لأي شخص في السيرفر، أو استدعاء، أو شكر.',
      '',
      `> **تنبيه:** هناك تهدئة بمقدار دقيقة بين كل رسالة لنفس الشخص.`,
      '',
      'اختر نوع الرسالة من الأزرار بالأسفل.'
    ].join('\n'))
    .setFooter({ text: 'NSR HUB - MoDy Dev' })
    .setTimestamp();
}

function messagesRows() {
  const backBtn = new ButtonBuilder().setCustomId('bd_back').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary);
  const btns = Object.entries(MSG_TYPES).map(([id, t]) =>
    new ButtonBuilder().setCustomId(`msg_${id}`).setLabel(t.name).setEmoji(t.emoji).setStyle(ButtonStyle.Primary)
  );
  return [
    new ActionRowBuilder().addComponents(...btns),
    new ActionRowBuilder().addComponents(backBtn),
  ];
}

async function handleMessagesButton(interaction) {
  const id = interaction.customId.replace('msg_', '');
  const t = MSG_TYPES[id];
  if (!t) return;
  const modal = new ModalBuilder().setCustomId(`msg_${id}_modal`).setTitle(t.title);
  const userInput = new TextInputBuilder()
    .setCustomId('msg_target')
    .setLabel('معرف العضو (User ID)')
    .setPlaceholder('كليك يمين على العضو ← نسخ معرف المستخدم')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  const textInput = new TextInputBuilder()
    .setCustomId('msg_text')
    .setLabel('النص')
    .setPlaceholder('اكتب نص الرسالة هنا...')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(2000);
  modal.addComponents(
    new ActionRowBuilder().addComponents(userInput),
    new ActionRowBuilder().addComponents(textInput),
  );
  await interaction.showModal(modal);
}

async function handleMessagesModal(interaction) {
  const id = interaction.customId.replace('msg_', '').replace('_modal', '');
  const t = MSG_TYPES[id];
  if (!t) {
    await interaction.reply({ content: '❌ نوع رسالة غير معروف.', ephemeral: true });
    return;
  }
  const rawTarget = interaction.fields.getTextInputValue('msg_target').trim();
  const text = interaction.fields.getTextInputValue('msg_text').trim();
  const match = String(rawTarget).match(/(\d{15,20})/);
  if (!match) {
    await interaction.reply({ content: '❌ أدخل معرف العضو الصحيح.', ephemeral: true });
    return;
  }
  const targetId = match[1];
  const user = await interaction.client.users.fetch(targetId).catch(() => null);
  if (!user) {
    await interaction.reply({ content: '❌ لم يتم العثور على هذا العضو.', ephemeral: true });
    return;
  }

  const key = `${interaction.user.id}:${interaction.guild.id}:${targetId}`;
  const now = Date.now();
  const last = lastSent.get(key);
  if (last && now - last < COOLDOWN_MS) {
    const secs = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
    await interaction.reply({ content: `⏳ انتظر **${secs}** ثانية قبل إرسال رسالة أخرى لنفس الشخص (تهدئة دقيقة).`, ephemeral: true });
    return;
  }

  const dmEmbed = new EmbedBuilder()
    .setColor(t.color)
    .setTitle(t.dmTitle.replace('{{USER}}', interaction.guild.name))
    .setDescription(t.description.replace('{{TEXT}}', text).replace('{{GUILD}}', interaction.guild.name))
    .setFooter({ text: interaction.guild.name })
    .setTimestamp();

  try {
    await user.send({ embeds: [dmEmbed] });
    lastSent.set(key, now);
    await interaction.reply({ content: `✅ تم إرسال **${t.name}** إلى <@${targetId}>.`, ephemeral: true });
  } catch (err) {
    await interaction.reply({ content: `❌ تعذر إرسال رسالة خاصة لـ <@${targetId}> (أغلق الرسائل الخاصة).`, ephemeral: true });
  }
}

module.exports = { messagesEmbed, messagesRows, handleMessagesButton, handleMessagesModal };