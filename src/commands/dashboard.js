const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const DOWNLOAD_URL = 'https://github.com/modyisherw-ui/nsr-mega-bot/releases/download/desktop/NSR-HUB-Setup-1.0.11.exe';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bordnsr')
    .setDescription('رابط تحميل لوحة التحكم')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: '❌ لوحة التحكم للإدارة فقط.', ephemeral: true });
      return;
    }
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('NSR HUB — لوحة التحكم')
      .setDescription(
        'طريقة التحميل والتثبيت:\n' +
        '1️⃣ اضغط على زر التحميل أدناه\n' +
        '2️⃣ شغّل الملف واضغط Next حتى النهاية\n' +
        '3️⃣ افتح البرنامج وسجّل الدخول بحساب البوت\n\n' +
        `📥 رابط مباشر: [اضغط هنا للتحميل](${DOWNLOAD_URL})`
      )
      .setFooter({ text: 'الإصدار 1.0.11' });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('تحميل التطبيق')
        .setURL(DOWNLOAD_URL)
    );
    await interaction.reply({ embeds: [embed], components: [row] });
  },
};
