const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const db = require('../db');
const emb = require('../utils/embeds');

module.exports = {
  name: 'moderation-group',
  commands: [
    // ⚠️ التحذيرات
    {
      data: new SlashCommandBuilder().setName('warn').setDescription('⚠️ تحذير عضو').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(o => o.setName('user').setDescription('العضو').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('السبب').setRequired(false)),
      async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) { await interaction.reply({ content: '❌ بدون صلاحية.', ephemeral: true }); return; }
        const target = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason') || 'بدون سبب';
        if (!target) { await interaction.reply({ content: '❌ العضو غير موجود.', ephemeral: true }); return; }
        db.warnings.add(interaction.guild.id, target.id, reason, interaction.user.id);
        const count = db.warnings.list(interaction.guild.id, target.id).length;
        const embed = new emb.successEmbed(interaction.client, '⚠️ تم تحذير العضو', `**العضو:** ${target.user.tag}\n**السبب:** ${reason}\n**عدد التحذيرات:** \`${count}\``);
        await interaction.reply({ embeds: [embed] });
        target.send({ content: `⚠️ تم تحذيرك في ${interaction.guild.name}!\n**السبب:** ${reason}` }).catch(() => {});
      },
    },
    {
      data: new SlashCommandBuilder().setName('warnings').setDescription('📋 تحذيرات عضو').addUserOption(o => o.setName('user').setDescription('العضو').setRequired(true)),
      async execute(interaction) {
        const target = interaction.options.getUser('user');
        const rows = db.warnings.list(interaction.guild.id, target.id);
        const embed = new emb.infoEmbed(interaction.client, `📋 تحذيرات ${target.username}`, rows.length === 0
          ? 'لا توجد تحذيرات.'
          : rows.map((r, i) => `${i + 1}. ${r.reason} — بواسطة <@${r.moderator_id}> (<t:${Math.floor(r.timestamp / 1000)}:R>)`).join('\n'));
        await interaction.reply({ embeds: [embed] });
      },
    },
    {
      data: new SlashCommandBuilder().setName('clearwarnings').setDescription('🗑️ مسح تحذيرات عضو').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(o => o.setName('user').setDescription('العضو').setRequired(true)),
      async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) { await interaction.reply({ content: '❌ بدون صلاحية.', ephemeral: true }); return; }
        const target = interaction.options.getUser('user');
        const cleared = db.warnings.clear(interaction.guild.id, target.id);
        const embed = new emb.successEmbed(interaction.client, 'تم المسح', `تم مسح **${cleared}** تحذير لـ **${target.username}**.`);
        await interaction.reply({ embeds: [embed] });
      },
    },

    // 🎉 الجيفاواي
    {
      data: new SlashCommandBuilder().setName('giveaway').setDescription('🎉 نظام الجيفاواي').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addSubcommand(s => s.setName('start').setDescription('بدء جيفاواي').addStringOption(o => o.setName('prize').setDescription('الجائزة').setRequired(true)).addIntegerOption(o => o.setName('duration').setDescription('المدة بالدقائق').setRequired(true)).addChannelOption(o => o.setName('channel').setDescription('القناة (اختياري)'))),
      async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) { await interaction.reply({ content: '❌ بدون صلاحية.', ephemeral: true }); return; }
        if (interaction.options.getSubcommand() === 'start') {
          const prize = interaction.options.getString('prize');
          const duration = interaction.options.getInteger('duration');
          const channel = interaction.options.getChannel('channel') || interaction.channel;
          const endAt = Date.now() + duration * 60000;
          const embed = new EmbedBuilder()
            .setTitle(`🎉 ${prize}`)
            .setColor('Gold')
            .setDescription([
              `**ينتهي:** <t:${Math.floor(endAt / 1000)}:R>`,
              `**الفائز:** ?`,
              '',
              '> اضغط على 🎉 للمشاركة!',
            ].join('\n'))
            .setFooter({ text: `بواسطة ${interaction.user.tag}` })
            .setTimestamp();
          const msg = await channel.send({ embeds: [embed] });
          await msg.react('🎉');
          db.giveaways.create({ messageId: msg.id, guildId: interaction.guild.id, channelId: channel.id, prize, description: '', winners: 1, hostedBy: interaction.user.id, emoji: '🎉', endsAt: endAt, entrants: [], pickedWinners: [] });
          await interaction.reply({ content: `✅ تم بدء الجيفاواي: ${prize}`, ephemeral: true });
        }
      },
    },
    {
      data: new SlashCommandBuilder().setName('giveaway-end').setDescription('🎉 إنهاء جيفاواي').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(o => o.setName('id').setDescription('معرف الجيفاواي (اختياري)').setRequired(false)),
      async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) { await interaction.reply({ content: '❌ بدون صلاحية.', ephemeral: true }); return; }
        const id = interaction.options.getString('id');
        let record;
        if (id) record = db.giveaways.get(id);
        else {
          const active = db.giveaways.active(interaction.guild.id);
          record = active[active.length - 1];
        }
        if (!record) { await interaction.reply({ content: '❌ لا توجد جيفاواي نشطة.', ephemeral: true }); return; }
        db.db.prepare(`UPDATE giveaways SET ends_at=? WHERE message_id=?`).run(Date.now(), record.message_id);
        await interaction.reply({ content: '✅ سيتم إعلان الفائز خلال ثوانٍ.', ephemeral: true });
      },
    },

    // 🏷️ لوحة الرتب
    {
      data: new SlashCommandBuilder().setName('rolespanel').setDescription('🏷️ لوحة الرتب').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addRoleOption(o => o.setName('role').setDescription('رتبة يجب وضعها في اللوحة').setRequired(false)),
      async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) { await interaction.reply({ content: '❌ بدون صلاحية.', ephemeral: true }); return; }
        const role = interaction.options.getRole('role');
        const roles = role ? [role] : interaction.guild.roles.cache.filter(r => r.id !== interaction.guild.id && r.managed === false && r.members.size > 0).sort((a, b) => b.position - a.position).first(10);
        const row = new ActionRowBuilder().addComponents(roles.map(r => new ButtonBuilder().setCustomId(`role_${r.id}`).setLabel(r.name).setStyle(ButtonStyle.Secondary)));
        const embed = new EmbedBuilder().setTitle('🏷️ لوحة الرتب').setColor('Blurple').setDescription('اضغط على الزر للحصول على الرتبة أو إزالتها.').setTimestamp();
        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ تم إرسال لوحة الرتب.', ephemeral: true });
      },
    },

    // 👢 العقوبات
    {
      data: new SlashCommandBuilder().setName('kick').setDescription('👢 طرد عضو').setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .addUserOption(o => o.setName('user').setDescription('العضو').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('السبب').setRequired(false)),
      async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) { await interaction.reply({ content: '❌ بدون صلاحية.', ephemeral: true }); return; }
        const target = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason') || 'بدون سبب';
        if (!target) { await interaction.reply({ content: '❌ العضو غير موجود.', ephemeral: true }); return; }
        if (target.id === interaction.user.id) { await interaction.reply({ content: '❌ لا يمكنك طرد نفسك.', ephemeral: true }); return; }
        try {
          await target.kick(reason);
          const embed = new emb.successEmbed(interaction.client, '👢 تم طرد العضو', `**العضو:** ${target.user.tag}\n**السبب:** ${reason}`);
          await interaction.reply({ embeds: [embed] });
        } catch (err) { await interaction.reply({ content: '❌ فشل الطرد: ' + err.message, ephemeral: true }); }
      },
    },
    {
      data: new SlashCommandBuilder().setName('ban').setDescription('⛔ باند عضو').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addUserOption(o => o.setName('user').setDescription('العضو').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('السبب').setRequired(false)),
      async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) { await interaction.reply({ content: '❌ بدون صلاحية.', ephemeral: true }); return; }
        const target = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'بدون سبب';
        try {
          await interaction.guild.members.ban(target, { reason });
          const embed = new emb.successEmbed(interaction.client, '⛔ تم باند العضو', `**العضو:** ${target.tag}\n**السبب:** ${reason}`);
          await interaction.reply({ embeds: [embed] });
        } catch (err) { await interaction.reply({ content: '❌ فشل الباند: ' + err.message, ephemeral: true }); }
      },
    },
    {
      data: new SlashCommandBuilder().setName('unban').setDescription('✅ إلغاء باند').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addStringOption(o => o.setName('user_id').setDescription('معرف المستخدم').setRequired(true)),
      async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) { await interaction.reply({ content: '❌ بدون صلاحية.', ephemeral: true }); return; }
        const userId = interaction.options.getString('user_id');
        try {
          await interaction.guild.members.unban(userId);
          const embed = new emb.successEmbed(interaction.client, '✅ تم إلغاء الباند', `<@${userId}>`);
          await interaction.reply({ embeds: [embed] });
        } catch (err) { await interaction.reply({ content: '❌ فشل إلغاء الباند: ' + err.message, ephemeral: true }); }
      },
    },
    {
      data: new SlashCommandBuilder().setName('timeout').setDescription('⏳ تايم أوت').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(o => o.setName('user').setDescription('العضو').setRequired(true)).addIntegerOption(o => o.setName('minutes').setDescription('المدة بالدقائق').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('السبب').setRequired(false)),
      async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) { await interaction.reply({ content: '❌ بدون صلاحية.', ephemeral: true }); return; }
        const target = interaction.options.getMember('user');
        const minutes = interaction.options.getInteger('minutes');
        const reason = interaction.options.getString('reason') || 'بدون سبب';
        if (!target) { await interaction.reply({ content: '❌ العضو غير موجود.', ephemeral: true }); return; }
        try {
          await target.timeout(minutes * 60000, reason);
          const embed = new emb.successEmbed(interaction.client, '⏳ تم تطبيق التايم أوت', `**العضو:** ${target.user.tag}\n**المدة:** ${minutes} دقيقة\n**السبب:** ${reason}`);
          await interaction.reply({ embeds: [embed] });
        } catch (err) { await interaction.reply({ content: '❌ فشل التايم أوت: ' + err.message, ephemeral: true }); }
      },
    },
    {
      data: new SlashCommandBuilder().setName('untimeout').setDescription('✅ إزالة التايم أوت').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(o => o.setName('user').setDescription('العضو').setRequired(true)),
      async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) { await interaction.reply({ content: '❌ بدون صلاحية.', ephemeral: true }); return; }
        const target = interaction.options.getMember('user');
        if (!target) { await interaction.reply({ content: '❌ العضو غير موجود.', ephemeral: true }); return; }
        try {
          await target.timeout(null);
          const embed = new emb.successEmbed(interaction.client, '✅ تم إزالة التايم أوت', `${target.user.tag}`);
          await interaction.reply({ embeds: [embed] });
        } catch (err) { await interaction.reply({ content: '❌ فشل: ' + err.message, ephemeral: true }); }
      },
    },

    // 🧹 إدارة القنوات والرسائل
    {
      data: new SlashCommandBuilder().setName('purge').setDescription('🧹 مسح رسائل').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addIntegerOption(o => o.setName('amount').setDescription('العدد (1-100)').setRequired(true)),
      async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) { await interaction.reply({ content: '❌ بدون صلاحية.', ephemeral: true }); return; }
        const amount = Math.min(100, Math.max(1, interaction.options.getInteger('amount')));
        try {
          await interaction.channel.bulkDelete(amount, true);
          const reply = await interaction.channel.send({ content: `🧹 تم حذف \`${amount}\` رسالة.` });
          setTimeout(() => reply.delete().catch(() => {}), 3000);
        } catch (err) {
          await interaction.reply({ content: '❌ لا يمكن حذف رسائل أقدم من 14 يوم: ' + err.message, ephemeral: true });
        }
      },
    },
    {
      data: new SlashCommandBuilder().setName('lock').setDescription('🔒 قفل القناة').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addChannelOption(o => o.setName('channel').setDescription('القناة (اختياري)')),
      async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) { await interaction.reply({ content: '❌ بدون صلاحية.', ephemeral: true }); return; }
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        try {
          await channel.permissionOverwrites.edit(interaction.guild.id, { SendMessages: false });
          const embed = new emb.successEmbed(interaction.client, '🔒 تم قفل القناة', `${channel.name}`);
          await interaction.reply({ embeds: [embed] });
        } catch (err) { await interaction.reply({ content: '❌ فشل: ' + err.message, ephemeral: true }); }
      },
    },
    {
      data: new SlashCommandBuilder().setName('unlock').setDescription('🔓 فتح القناة').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addChannelOption(o => o.setName('channel').setDescription('القناة (اختياري)')),
      async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) { await interaction.reply({ content: '❌ بدون صلاحية.', ephemeral: true }); return; }
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        try {
          await channel.permissionOverwrites.edit(interaction.guild.id, { SendMessages: null });
          const embed = new emb.successEmbed(interaction.client, '🔓 تم فتح القناة', `${channel.name}`);
          await interaction.reply({ embeds: [embed] });
        } catch (err) { await interaction.reply({ content: '❌ فشل: ' + err.message, ephemeral: true }); }
      },
    },
    {
      data: new SlashCommandBuilder().setName('slowmode').setDescription('🐢 وضع بطيء').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addIntegerOption(o => o.setName('seconds').setDescription('المدة بالثواني').setRequired(true)),
      async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) { await interaction.reply({ content: '❌ بدون صلاحية.', ephemeral: true }); return; }
        const seconds = interaction.options.getInteger('seconds');
        try {
          await interaction.channel.setRateLimitPerUser(seconds);
          const embed = new emb.successEmbed(interaction.client, '🐢 تم تعيين الوضع البطيء', `\`${seconds}\` ثانية`);
          await interaction.reply({ embeds: [embed] });
        } catch (err) { await interaction.reply({ content: '❌ فشل: ' + err.message, ephemeral: true }); }
      },
    },
    {
      data: new SlashCommandBuilder().setName('createchannel').setDescription('➕ إنشاء روم').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addStringOption(o => o.setName('name').setDescription('الاسم').setRequired(true)).addStringOption(o => o.setName('type').setDescription('النوع').addChoices({ name: 'نصي', value: 'text' }, { name: 'صوتي', value: 'voice' }, { name: 'فئة', value: 'category' })),
      async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) { await interaction.reply({ content: '❌ بدون صلاحية.', ephemeral: true }); return; }
        const name = interaction.options.getString('name');
        const type = interaction.options.getString('type') || 'text';
        try {
          const channel = await interaction.guild.channels.create({ name, type: type === 'voice' ? 2 : type === 'category' ? 4 : 0 });
          const embed = new emb.successEmbed(interaction.client, '➕ تم إنشاء الروم', `<#${channel.id}>`);
          await interaction.reply({ embeds: [embed] });
        } catch (err) { await interaction.reply({ content: '❌ فشل: ' + err.message, ephemeral: true }); }
      },
    },
    {
      data: new SlashCommandBuilder().setName('deletechannel').setDescription('🗑️ حذف روم').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addChannelOption(o => o.setName('channel').setDescription('القناة').setRequired(true)),
      async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) { await interaction.reply({ content: '❌ بدون صلاحية.', ephemeral: true }); return; }
        const channel = interaction.options.getChannel('channel');
        try {
          await interaction.reply({ content: `🗑️ جاري حذف ${channel.name}...`, ephemeral: true });
          await channel.delete('حذف بواسطة إدارة');
        } catch (err) { await interaction.reply({ content: '❌ فشل: ' + err.message, ephemeral: true }); }
      },
    },

    // 🎭 الرتب
    {
      data: new SlashCommandBuilder().setName('role').setDescription('🎭 إعطاء/سحب رتبة').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addUserOption(o => o.setName('user').setDescription('العضو').setRequired(true)).addRoleOption(o => o.setName('role').setDescription('الرتبة').setRequired(true)),
      async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) { await interaction.reply({ content: '❌ بدون صلاحية.', ephemeral: true }); return; }
        const target = interaction.options.getMember('user');
        const role = interaction.options.getRole('role');
        if (!target) { await interaction.reply({ content: '❌ العضو غير موجود.', ephemeral: true }); return; }
        if (target.roles.cache.has(role.id)) {
          await target.roles.remove(role);
          await interaction.reply({ content: `✅ تم سحب رتبة **${role.name}** من ${target.user.tag}.` });
        } else {
          await target.roles.add(role);
          await interaction.reply({ content: `✅ تم إعطاء **${role.name}** لـ ${target.user.tag}.` });
        }
      },
    },
    {
      data: new SlashCommandBuilder().setName('createrole').setDescription('➕ إنشاء رتبة').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addStringOption(o => o.setName('name').setDescription('الاسم').setRequired(true)),
      async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) { await interaction.reply({ content: '❌ بدون صلاحية.', ephemeral: true }); return; }
        try {
          const role = await interaction.guild.roles.create({ name: interaction.options.getString('name') });
          await interaction.reply({ content: `✅ تم إنشاء رتبة **${role.name}**.` });
        } catch (err) { await interaction.reply({ content: '❌ فشل: ' + err.message, ephemeral: true }); }
      },
    },
    {
      data: new SlashCommandBuilder().setName('deleterole').setDescription('🗑️ حذف رتبة').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addRoleOption(o => o.setName('role').setDescription('الرتبة').setRequired(true)),
      async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) { await interaction.reply({ content: '❌ بدون صلاحية.', ephemeral: true }); return; }
        const role = interaction.options.getRole('role');
        try {
          await role.delete();
          await interaction.reply({ content: `✅ تم حذف رتبة **${role.name}**.` });
        } catch (err) { await interaction.reply({ content: '❌ فشل: ' + err.message, ephemeral: true }); }
      },
    },
    {
      data: new SlashCommandBuilder().setName('addemoji').setDescription('😀 إضافة إيموجي').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
        .addStringOption(o => o.setName('url').setDescription('رابط الصورة').setRequired(true)).addStringOption(o => o.setName('name').setDescription('الاسم').setRequired(true)),
      async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) { await interaction.reply({ content: '❌ بدون صلاحية.', ephemeral: true }); return; }
        try {
          const emoji = await interaction.guild.emojis.create({ attachment: interaction.options.getString('url'), name: interaction.options.getString('name') });
          await interaction.reply({ content: `✅ تم إضافة الإيموجي ${emoji}` });
        } catch (err) { await interaction.reply({ content: '❌ فشل: ' + err.message, ephemeral: true }); }
      },
    },

    // 📝 الرسائل
    {
      data: new SlashCommandBuilder().setName('say').setDescription('📢 إرسال رسالة باسم البوت').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(o => o.setName('message').setDescription('الرسالة').setRequired(true)),
      async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) { await interaction.reply({ content: '❌ بدون صلاحية.', ephemeral: true }); return; }
        await interaction.channel.send({ content: interaction.options.getString('message') });
        await interaction.reply({ content: '✅ تم الإرسال.', ephemeral: true });
      },
    },
    {
      data: new SlashCommandBuilder().setName('embed').setDescription('📋 إرسال إمبد').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(o => o.setName('title').setDescription('العنوان').setRequired(true)).addStringOption(o => o.setName('description').setDescription('الوصف').setRequired(true)),
      async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) { await interaction.reply({ content: '❌ بدون صلاحية.', ephemeral: true }); return; }
        const embed = new EmbedBuilder().setTitle(interaction.options.getString('title')).setDescription(interaction.options.getString('description')).setColor('Blurple').setFooter({ text: interaction.user.tag });
        await interaction.channel.send({ embeds: [embed] });
        await interaction.reply({ content: '✅ تم الإرسال.', ephemeral: true });
      },
    },
    {
      data: new SlashCommandBuilder().setName('announce').setDescription('📣 إعلان مع منشن').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(o => o.setName('message').setDescription('الإعلان').setRequired(true)).addRoleOption(o => o.setName('role').setDescription('رتبة المنشن (اختياري)')),
      async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) { await interaction.reply({ content: '❌ بدون صلاحية.', ephemeral: true }); return; }
        const role = interaction.options.getRole('role');
        await interaction.channel.send({ content: (role ? `<@&${role.id}> ` : '@everyone ') + interaction.options.getString('message') });
        await interaction.reply({ content: '✅ تم الإعلان.', ephemeral: true });
      },
    },
    {
      data: new SlashCommandBuilder().setName('poll').setDescription('📊 استفتاء').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(o => o.setName('question').setDescription('السؤال').setRequired(true)),
      async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) { await interaction.reply({ content: '❌ بدون صلاحية.', ephemeral: true }); return; }
        const msg = await interaction.channel.send({ content: `📊 **${interaction.options.getString('question')}**` });
        await msg.react('👍');
        await msg.react('👎');
        await msg.react('🤷');
        await interaction.reply({ content: '✅ تم إنشاء الاستفتاء.', ephemeral: true });
      },
    },
    {
      data: new SlashCommandBuilder().setName('snipe').setDescription('🔍 آخر رسالة محذوفة'),
      async execute(interaction) {
        const deleted = db.snipe.get(interaction.channel.id);
        if (!deleted) {
          await interaction.reply({ content: '❌ لا توجد رسالة محذوفة في هذه القناة.', ephemeral: true });
          return;
        }
        const embed = new EmbedBuilder()
          .setColor('Orange')
          .setAuthor({ name: deleted.author, iconURL: deleted.avatar })
          .setDescription(deleted.content || '*بدون محتوى*')
          .setFooter({ text: `حذفت منذ <t:${Math.floor(deleted.deletedAt / 1000)}:R>` });
        await interaction.reply({ embeds: [embed] });
      },
    },

    // ℹ️ المعلومات
    {
      data: new SlashCommandBuilder().setName('avatar').setDescription('🖼️ صورة العضو').addUserOption(o => o.setName('user').setDescription('العضو')),
      async execute(interaction) {
        const user = interaction.options.getUser('user') || interaction.user;
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🖼️ صورة ${user.username}`).setImage(user.displayAvatarURL({ size: 1024 })).setColor('Blurple')] });
      },
    },
    {
      data: new SlashCommandBuilder().setName('userinfo').setDescription('👤 معلومات العضو').addUserOption(o => o.setName('user').setDescription('العضو')),
      async execute(interaction) {
        const target = interaction.options.getMember('user') || interaction.member;
        const embed = new EmbedBuilder()
          .setTitle(`👤 ${target.user.username}`)
          .setColor('Blurple')
          .setThumbnail(target.user.displayAvatarURL({ size: 256 }))
          .addFields(
            { name: 'المعرف', value: target.id },
            { name: 'تاريخ الانضمام', value: `<t:${Math.floor(target.joinedAt.getTime() / 1000)}:R>` },
            { name: 'تاريخ الحساب', value: `<t:${Math.floor(target.user.createdAt.getTime() / 1000)}:R>` },
            { name: 'الرتب', value: target.roles.cache.filter(r => r.id !== interaction.guild.id).map(r => `<@&${r.id}>`).slice(0, 10).join(' ') || 'لا توجد' },
          );
        await interaction.reply({ embeds: [embed] });
      },
    },
    {
      data: new SlashCommandBuilder().setName('serverinfo').setDescription('🏠 معلومات السيرفر'),
      async execute(interaction) {
        const g = interaction.guild;
        const embed = new EmbedBuilder()
          .setTitle(`🏠 ${g.name}`)
          .setColor('Blurple')
          .setThumbnail(g.iconURL({ size: 256 }))
          .addFields(
            { name: 'المالك', value: `<@${g.ownerId}>`, inline: true },
            { name: 'الأعضاء', value: `\`${g.memberCount}\``, inline: true },
            { name: 'الرتب', value: `\`${g.roles.cache.size}\``, inline: true },
            { name: 'الرومات', value: `\`${g.channels.cache.size}\``, inline: true },
            { name: 'تاريخ الإنشاء', value: `<t:${Math.floor(g.createdAt.getTime() / 1000)}:R>`, inline: true },
            { name: 'التحقق', value: String({ 0: 'بدون', 1: 'منخفض', 2: 'متوسط', 3: 'مرتفع', 4: 'الأعلى' }[g.verificationLevel] ?? g.verificationLevel), inline: true },
          )
          .setTimestamp();
        await interaction.reply({ embeds: [embed] });
      },
    },

    // 🎤 الصوت
    {
      data: new SlashCommandBuilder().setName('nickname').setDescription('✏️ تغيير الاسم').setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
        .addUserOption(o => o.setName('user').setDescription('العضو').setRequired(true)).addStringOption(o => o.setName('nickname').setDescription('الاسم الجديد').setRequired(true)),
      async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageNicknames)) { await interaction.reply({ content: '❌ بدون صلاحية.', ephemeral: true }); return; }
        const target = interaction.options.getMember('user');
        try {
          await target.setNickname(interaction.options.getString('nickname'));
          await interaction.reply({ content: `✅ تم تغيير اسم ${target.user.tag}.` });
        } catch (err) { await interaction.reply({ content: '❌ فشل: ' + err.message, ephemeral: true }); }
      },
    },
    {
      data: new SlashCommandBuilder().setName('move').setDescription('🚚 نقل عضو لروم صوتي').setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers)
        .addUserOption(o => o.setName('user').setDescription('العضو').setRequired(true)).addChannelOption(o => o.setName('channel').setDescription('الروم الصوتي').setRequired(true)),
      async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.MoveMembers)) { await interaction.reply({ content: '❌ بدون صلاحية.', ephemeral: true }); return; }
        const target = interaction.options.getMember('user');
        const channel = interaction.options.getChannel('channel');
        if (channel.type !== 2) { await interaction.reply({ content: '❌ يجب اختيار روم صوتي.', ephemeral: true }); return; }
        try {
          await target.voice.setChannel(channel);
          await interaction.reply({ content: `✅ تم نقل ${target.user.tag} إلى ${channel.name}.` });
        } catch (err) { await interaction.reply({ content: '❌ فشل: ' + err.message, ephemeral: true }); }
      },
    },
    {
      data: new SlashCommandBuilder().setName('deafen').setDescription('🙉 دفن/رفع دفن عضو').setDefaultMemberPermissions(PermissionFlagsBits.DeafenMembers)
        .addUserOption(o => o.setName('user').setDescription('العضو').setRequired(true)).addBooleanOption(o => o.setName('deafen').setDescription('دفن أم لا').setRequired(true)),
      async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.DeafenMembers)) { await interaction.reply({ content: '❌ بدون صلاحية.', ephemeral: true }); return; }
        const target = interaction.options.getMember('user');
        const deafen = interaction.options.getBoolean('deafen');
        try {
          await target.voice.setDeaf(deafen);
          await interaction.reply({ content: `✅ ${deafen ? 'تم الدفن' : 'تم رفع الدفن'} لـ ${target.user.tag}.` });
        } catch (err) { await interaction.reply({ content: '❌ فشل: ' + err.message, ephemeral: true }); }
      },
    },
  ],
};
