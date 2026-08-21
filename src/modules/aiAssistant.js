// ═══════════ معالج AI — ردود ذكية قائمة على قواعد ═══════════
// يعمل بدون مفتاح API: قاعدة معرفة عربية + تحليل سياق الرسالة.
// وضعان:
//   solve   — حل مشاكل (يكتشف مشكلة ويقدم خطوات الحل)
//   inquiry — استفسارات (يجيب على الأسئلة العامة / باند / تكت / شرح)
// قيود: يرد فقط على الرسائل التي تحوي مشكلة أو سؤال، لا يسولف.
const { EmbedBuilder } = require('discord.js');
const log = require('../utils/logger');

const replied = new Map(); // "guildId:userId" -> timestamp (تهدئة)
const COOLDOWN_MS = 8000;

function aiCfg(guildId) {
  return require('../guildCfg').get(guildId).ai || {};
}

function isEnabled(guildId) {
  const c = aiCfg(guildId);
  return c.enabled && !c.locked;
}

// ═══════════ قاعدة المعرفة ═══════════
const KB = {
  ban: {
    test: /(متبند|تبندت|تبند|باند|ban|ممنوع ادخال|مطرود)/i,
    reply: 'إذا كنت متبند من السيرفر:\n• افتح **تكت** من قسم الدعم واكتب سبب الباند.\n• الإدارة تستعرض طلبك وترد عليك خلال وقت قصير.\n• لا تنشئ حسابات بديلة — هذا يزيد المدة.',
  },
  ticket: {
    test: /(تكت|تيكت|ticket|افتح تكت|من وين افتح تكت|وين افتح)/i,
    reply: 'لفتح تكت:\n• ابحث في رومات السيرفر عن لوحة **التذاكر** 🎫\n• اختر نوع الطلب من القائمة واضغط عليه.\n• سيُنشأ لك روم خاص بك وتتواصل مع الفريق فيه.',
  },
  discordInvite: {
    test: /(رابط.*ديسكورد|ديسكورد.*رابط|انضم.*سيرفر|invite|سيرفر ديسكورد)/i,
    reply: 'رابط سيرفرنا في الوصف أو من زر الديسكورد 🔗\n• إذا ما ظهر لك، اطلب من أي إدارة الرابط مباشرة.',
  },
  roles: {
    test: /(رتبة|رول|رولات|الرتب|role|رتبة العضوية)/i,
    reply: 'الرتب تُعطى تلقائياً عند دخولك السيرفر 🎭\n• إذا ما وصلك الدور، افتح تكت واذكر اسم الرتبة الناقصة.',
  },
  payment: {
    test: /(دفع|شراء|اشتريت|الدفع|أقساط|قسط|شراء)/i,
    reply: 'بخصوص الدفع والشراء:\n• تواصل مع الإدارة عبر **تكت** لمراجعة طلبك.\n• جهّز اسم المنتج أو الخدمة التي تريدها.',
  },
  fivem: {
    test: /(فايف ام|فايفام|five|fivem|الخامس|خمس)/i,
    reply: 'للأمور المتعلقة بفايف ام:\n• تأكد أنك في السيرفر الصحيح (اسم السيرفر في الأعلى).\n• لو تواجه مشكلة اتصال: أعد تشغيل اللانشر وافحص الإنترنت.\n• لو كانت مشكلة داخل اللعبة، اكتب تفاصيلها بالضبط وسنساعدك.',
  },
  crash: {
    test: /(كراش|crash|يقفل اللعبة|تطلع اللعبة|يعلق|فريز|freez)/i,
    reply: 'مشكلة الكراش/التعليق:\n• حدّث كروت الشاشة واللعبة لآخر إصدار.\n• أغلق البرامج الخلفية (المتصفحات، الرندر).\n• جرّب تقليل الإعدادات الرسومية.\n• إذا استمرت، أرسل لنا لقطة للرسالة التي تظهر.',
  },
  lag: {
    test: /(لاق|بطئ|بطيء|تأخير|نيت|net|بينق|ping)/i,
    reply: 'مشكلة التأخير (نيت/لاق):\n• قرب من الراوتر أو استخدم كابل مباشر.\n• أغلق التحميلات والبث أثناء اللعب.\n• جرب سيرفر قريب من منطقتك.',
  },
  install: {
    test: /(تثبيت|تحميل|تنزيل|installation|ما يشتغل|لا يشتغل|ماتحمل)/i,
    reply: 'لمساعدتك بالتركيب:\n• أعد تحميل الملف من رابط التحميل الرسمي.\n• شغّله كمسؤول (كليك يمين ← تشغيل كمسؤول).\n• أعد تشغيل الجهاز وجرب مرة أخرى.\n• اذكر بالضبط الخطأ الذي يظهر.',
  },
  greeting: {
    test: /(هلا|اهلين|السلام|مرحبا|هلو|هاي|هاي|كيفك|كيف الحال)/i,
    reply: 'هلا والله! 👋 اكتب مشكلتك أو سؤالك وسأحاول مساعدتك.',
    brief: true,
  },
  thanks: {
    test: /(شكرا|شكراً|يعطيك العافيه|يعطيك العافية|تسلم|تسلمي|مشكور|thx|thanks)/i,
    reply: 'العفو! 💙 لو تحتاج مساعدة مرة ثانية أنا هنا.',
    brief: true,
  },
  bye: {
    test: /(باي|مع السلامه|مع السلامة|وداعا|يلا امشي)/i,
    reply: 'بالتوفيق! 👋',
    brief: true,
  },
};

// ═══════════ كشف "مشكلة" من سياق الرسالة ═══════════
const PROBLEM_HINTS = /(مشكلة|مشكلتي|مشكله|عطل|لا يشتغل|ما يشتغل|ما اشتغل|مو شغال|موب شغال|مساعدة|ساعدوني|ساعدني|help|اقدر اساعد|ابغى حل|ابي حل|ضروووري|ضروري|صار لي|نفسي|واجهت|موقف|علقت|بلييز|help me)/i;
const QUESTION_HINTS = /(كيف|وين|ليش|ليه|متى|كم|ايش|شنو|وش|ما هو|من هو|عندك|هل|هل|any|how|where|when|what|why|شرح)/i;

// ═══════════ هل الرسالة تحتاج رد؟ ═══════════
function isProblemOrQuestion(text) {
  if (!text) return false;
  if (text.length > 500) return false;
  // تجاهل رسائل الإعلانات والروابط فقط
  if (/^(https?:\/\/)/i.test(text.trim())) return false;
  if (PROBLEM_HINTS.test(text)) return true;
  if (QUESTION_HINTS.test(text)) return true;
  // نص طويل بدون علامات سؤال/مشكلة = كلام عادي (ما نرد عليه)
  return false;
}

function findReply(text) {
  for (const k of Object.keys(KB)) {
    const entry = KB[k];
    if (entry.test.test(text)) {
      return { key: k, reply: entry.reply, brief: entry.brief };
    }
  }
  return null;
}

// رد عام للمشاكل غير المحددة
const GENERIC_PROBLEM = 'وضح لي أكثر 🔎\n• اكتب **مشكلتك** بالتفصيل (متى تبدأ؟ في أي شي؟ ما الرسالة التي تظهر؟)\n• أو اكتب **سؤالك** مباشرة وسأجيبك.\n• لو كان الموضوع خاصاً، افتح تكت 🎫 وشارك التفاصيل مع الإدارة.';

// ═══════════ المعالجة الرئيسية ═══════════
async function handleMessage(message) {
  try {
    if (!message.guild || message.author.bot) return;
    const cfg = aiCfg(message.guild.id);
    if (!isEnabled(message.guild.id)) return;
    // يجب أن تكون الرسالة في الروم المحدد
    if (!cfg.channelId || String(message.channel.id) !== String(cfg.channelId)) return;
    const text = (message.content || '').trim();
    if (!text) return;

    // تهدئة بين الردود لنفس الشخص (تحدَّث فقط عند رد فعلي)
    const key = `${message.guild.id}:${message.author.id}`;
    const last = replied.get(key);
    const now = Date.now();
    if (last && now - last < COOLDOWN_MS) return;

    const hit = findReply(text);
    let content;
    if (hit) {
      content = hit.reply;
    } else if (isProblemOrQuestion(text)) {
      // رسالة فيها مشكلة أو سؤال واضح
      if (cfg.mode === 'solve' && PROBLEM_HINTS.test(text)) {
        content = GENERIC_PROBLEM;
      } else if (cfg.mode === 'inquiry') {
        content = 'وصلني سؤالك 👍\n• جرّب توجيه السؤال بشكل أدق (مثال: «وين ألقى معرض السيارات؟» أو «كيف أفتح تكت؟»).\n• أو افتح تكت 🎫 لسؤال خاص بالإدارة.';
      } else {
        return;
      }
    } else {
      // رسالة عادية بدون مشكلة أو سؤال — لا يحتاج رد
      content = 'لا يحتاج رد - رسالة عادية بدون مشكلة أو سؤال.';
    }

    replied.set(key, now);
    if (replied.size > 500) replied.clear();
    await message.reply({ content: `${message.author.username}، ${content}` });
  } catch (err) {
    log.warn('معالج AI: ' + err.message);
  }
}

// ═══════════ اختبار رد (من لوحة التحكم) ═══════════
function testReply(text) {
  const hit = findReply(String(text || ''));
  if (hit) return { matched: hit.key, reply: hit.reply };
  if (isProblemOrQuestion(String(text || ''))) return { matched: 'general', reply: GENERIC_PROBLEM };
  return { matched: null, reply: 'لا يحتاج رد — رسالة عادية بدون مشكلة أو سؤال.' };
}

module.exports = { handleMessage, testReply, isEnabled, aiCfg };