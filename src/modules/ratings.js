const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const db = require('../db');
const log = require('../utils/logger');

const STARS_FULL = ['', '⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐'];

function ratingCfg(guildId) {
  return require('../guildCfg').get(guildId).rating || {};
}

// ═══════════════ المنتجات ═══════════════
function getProducts(guildId) { return ratingCfg(guildId).products || []; }

function findProduct(guildId, idOrName) {
  return getProducts(guildId).find(p => p.id === idOrName) ||
    getProducts(guildId).find(p => p.name.toLowerCase() === String(idOrName).toLowerCase());
}

function saveRatingConfig(guildId) {
  try {
    const cur = ratingCfg(guildId);
    require('../guildCfg').set(guildId, { rating: { reviewsChannelId: cur.reviewsChannelId || '', products: cur.products || [] } });
  } catch (err) {
    log.warn('فشل حفظ إعدادات التقييمات: ' + err.message);
  }
}

// ═══════════════ إرسال رسالة الشراء على الخاص ═══════════════
async function sendPurchaseDM(target, product, client, guild) {
  try {
    const dm = await target.createDM();
    const icon = guild?.iconURL({ size: 256 }) || client.user.displayAvatarURL();
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setThumbnail(icon)
      .setTitle('Thank you for purchase!')
      .setDescription('Thank you for purchase.\n\nشكراً لشرائك معنا.');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rate_lang_${guild?.id || '0'}_ar_${product.id}`).setLabel('العربية 🇸🇦').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`rate_lang_${guild?.id || '0'}_en_${product.id}`).setLabel('English 🇬🇧').setStyle(ButtonStyle.Primary),
    );
    await dm.send({ embeds: [embed], components: [row] });
    return true;
  } catch (err) {
    log.warn('تعذر إرسال خاص: ' + err.message);
    return false;
  }
}

// ═══════════════ اختيار اللغة ═══════════════
async function handleLangButton(interaction) {
  const parts = interaction.customId.split('_'); // rate_lang_<guildId>_<lang>_<pid>
  const guildId = parts[2];
  const lang = parts[3];
  const pid = parts.slice(4).join('_');
  const product = findProduct(guildId, pid);
  if (!product) {
    await interaction.reply({ content: '❌ المنتج لم يعد موجوداً.', ephemeral: true });
    return;
  }
  const ar = lang === 'ar';
  const desc = ar
    ? ['شكراً لثقتك بنا 💙', '', '**Products**', `**${product.name}**`, '', 'نتمنى أن تكون تجربتك معنا رائعة.', 'قيّم تجربتك بالأسفل ⭐'].join('\n')
    : ['**Products**', `**${product.name}**`, '', 'We hope you had a great experience with us.', 'Please rate your experience below ⭐'].join('\n');
  const embed = new EmbedBuilder()
    .setColor(ar ? 0x57F287 : 0x5865F2)
    .setTitle(ar ? 'تقييم تجربتك' : 'Rate your experience')
    .setDescription(desc);
  const starRow = new ActionRowBuilder().addComponents(
    [1, 2, 3, 4, 5].map(s => new ButtonBuilder()
      .setCustomId(`rate_star_${s}_${guildId}_${pid}_${lang}`)
      .setLabel('⭐'.repeat(s))
      .setStyle(ButtonStyle.Primary))
  );
  await interaction.update({ embeds: [embed], components: [starRow] });
}

// ═══════════════ اختيار النجوم → فتح نافذة الرسالة ═══════════════
async function handleStarButton(interaction) {
  const parts = interaction.customId.split('_'); // rate_star_<n>_<guildId>_<pid>_<lang>
  const stars = parseInt(parts[2], 10);
  const guildId = parts[3];
  const pid = parts.slice(4, -1).join('_');
  const lang = parts[parts.length - 1];
  const ar = lang === 'ar';
  const modal = new ModalBuilder()
    .setCustomId(`rate_comment_${guildId}_${pid}_${lang}_${stars}`)
    .setTitle(ar ? 'تقييمك' : 'Your review');
  const input = new TextInputBuilder()
    .setCustomId('review_comment')
    .setLabel(ar ? 'اكتب رسالتك' : 'Your message')
    .setPlaceholder(ar ? 'اكتب رسالة ترسل في روم التقييمات ⭐' : 'Write a message to be sent in the reviews room. ⭐')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

// ═══════════════ إرسال التقييم ═══════════════
async function handleCommentModal(interaction) {
  const parts = interaction.customId.split('_'); // rate_comment_<guildId>_<pid>_<lang>_<stars>
  const guildId = parts[2];
  const pid = parts.slice(3, -2).join('_');
  const lang = parts[parts.length - 2];
  const stars = parseInt(parts[parts.length - 1], 10);
  const comment = interaction.fields.getTextInputValue('review_comment').trim();
  const product = findProduct(guildId, pid);
  const ar = lang === 'ar';
  const client = interaction.client;
  const guild = client.guilds.cache.get(guildId) || null;

  db.productReviews.add({ guildId, productId: pid, userId: interaction.user.id, stars, comment });

  await interaction.reply({
    content: ar ? '✅ شكراً على تقييمك! ⭐' : '✅ Thank you for your rating! ⭐',
    ephemeral: true,
  });

  const reviewsChannelId = ratingCfg(guildId).reviewsChannelId;
  if (guild && reviewsChannelId) {
    const ch = guild.channels.cache.get(reviewsChannelId);
    if (ch) {
      const role = product?.roleId ? guild.roles.cache.get(product.roleId) : null;
      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setAuthor({ name: 'Feedback', iconURL: guild.iconURL({ size: 128 }) || client.user.displayAvatarURL() })
        .setDescription("We are delighted by a customer's evaluation of our services and the positive impression it left.")
        .addFields(
          { name: '**Products**', value: role ? `<@&${role.id}>` : (product?.name || '—') },
          { name: '**Rating**', value: `**${STARS_FULL[stars]} (${stars}/5)**` },
          { name: '**Comment**', value: comment ? `**${comment}**` : '—' },
          { name: '**Rating by**', value: `<@${interaction.user.id}>` },
        );
      await ch.send({ embeds: [embed] }).catch(err => log.warn('فشل إرسال التقييم للروم: ' + err.message));
    } else {
      log.warn(`روم التقييمات ${reviewsChannelId} غير موجود`);
    }
  } else {
    log.warn('لا يوجد روم تقييمات مضبوط بعد');
  }

  try {
    await interaction.message.edit({
      content: ar ? '✅ تم استلام تقييمك، شكراً لك! ⭐' : '✅ Your review has been received, thank you! ⭐',
      embeds: [],
      components: [],
    });
  } catch (_) {}
}

module.exports = { sendPurchaseDM, handleLangButton, handleStarButton, handleCommentModal, getProducts, findProduct, saveRatingConfig };
