const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { sendPurchaseDM, getProducts, findProduct } = require('../modules/ratings');
const { isOwner } = require('../config');

function isRateStaff(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const staffRoles = require('../guildCfg').get(member.guild.id).staffRoles || [];
  return staffRoles.some(r => member.roles.cache.has(r));
}

module.exports = {
  name: 'rating-group',
  commands: [
    {
      data: new SlashCommandBuilder()
        .setName('rate')
        .setDescription('إرسال رسالة تقييم منتج لعميل على الخاص')
        .addUserOption(o => o.setName('user').setDescription('العميل الذي سيُقيّم').setRequired(true))
        .addStringOption(o => o.setName('product').setDescription('اسم المنتج (اكتب أو اختر من القائمة)').setRequired(true).setAutocomplete(true)),
      async autocomplete(interaction) {
        const q = interaction.options.getFocused().toLowerCase();
        const prods = getProducts(interaction.guild.id).filter(p => p.name.toLowerCase().includes(q)).slice(0, 25);
        await interaction.respond(prods.map(p => ({ name: p.name, value: p.id })));
      },
      async execute(interaction) {
        if (!isOwner(interaction.user.id) && !isRateStaff(interaction.member)) {
          await interaction.reply({ content: '❌ هذا الأمر للإدارة فقط (حدد رتب الإدارة من لوحة التحكم).', ephemeral: true });
          return;
        }
        const target = interaction.options.getUser('user');
        if (!target || target.bot) {
          await interaction.reply({ content: '❌ اختر عميلاً حقيقياً (وليس بوتاً).', ephemeral: true });
          return;
        }
        if (!getProducts(interaction.guild.id).length) {
          await interaction.reply({ content: '❌ لا توجد منتجات بعد — أضف منتجاً من لوحة التحكم أولاً.', ephemeral: true });
          return;
        }
        const raw = interaction.options.getString('product');
        const product = findProduct(interaction.guild.id, raw);
        if (!product) {
          await interaction.reply({
            content: '❌ المنتج غير موجود. المنتجات المتاحة:\n' + getProducts(interaction.guild.id).map(p => `• **${p.name}**`).join('\n'),
            ephemeral: true,
          });
          return;
        }
        const guild = interaction.guild;
        const ok = await sendPurchaseDM(target, product, interaction.client, guild);
        if (!ok) {
          await interaction.reply({ content: `❌ تعذر إرسال رسالة خاصة إلى ${target} — ربما قفل الخاص.`, ephemeral: true });
          return;
        }
        await interaction.reply({
          content: `✅ تم إرسال رسالة تقييم **«${product.name}»** إلى ${target} على الخاص.`,
          ephemeral: true,
        });
      },
    },
  ],
};
