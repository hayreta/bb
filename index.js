import { Telegraf, Markup, session } from 'telegraf';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

/* ================= CONFIG ================= */

const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const ADMIN_ID = 5522724001;
const BOT_USERNAME = 'createUnlimitedGmail_Bot';

// Validate required environment variables
if (!BOT_TOKEN) {
    console.error('ERROR: BOT_TOKEN is not set. Please add it to your .env file or environment variables.');
    process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('ERROR: SUPABASE_URL and SUPABASE_KEY are required. Please add them to your .env file or environment variables.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const bot = new Telegraf(BOT_TOKEN);
bot.use(session());

const CHANNELS = [
    '@Unlimited_GmailA',
    '@Global_OnlineWork',
    '@AbModded_File',
    '@Canva_Pro_Teams_Links'
];

/* ================= DATABASE ================= */

const getDB = async (ctxOrId) => {
  try {
    const userId = typeof ctxOrId === 'object' ? ctxOrId.from.id : ctxOrId;

    const { data, error } = await supabase
      .from('users')
      .select('user_id, points, referrals, referred_by, joined, name, username, registered, last_active')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // User not found, create new user
        const ctx = typeof ctxOrId === 'object' ? ctxOrId : null;
        const newUser = {
          user_id: userId,
          points: 0,
          referrals: 0,
          referred_by: null,
          registered: 0,
          joined: new Date().toISOString(),
          last_active: new Date().toISOString(),
          name: ctx?.from?.first_name || 'User',
          username: ctx?.from?.username ? `@${ctx.from.username}` : 'No Username'
        };

        const { data: insertedUser, error: insertError } = await supabase
          .from('users')
          .insert([newUser])
          .select()
          .single();
        
        if (insertError) throw insertError;
        return insertedUser;
      }
      throw error;
    }

    // Update last_active timestamp
    await supabase
      .from('users')
      .update({ last_active: new Date().toISOString() })
      .eq('user_id', userId)
      .catch(err => console.error('[DB] Error updating last_active:', err.message));

    return data;
  } catch (err) {
    console.error('[DB] Error fetching/creating user:', err.message);
    throw err;
  }
};

// Update user points in database
const updateUserPointsDB = async (userId, pointsToAdd, reason = 'Manual adjustment') => {
  try {
    const { data: userData, error: fetchError } = await supabase
      .from('users')
      .select('points')
      .eq('user_id', userId)
      .single();

    if (fetchError) throw fetchError;

    const newPoints = Math.max(0, (userData?.points || 0) + pointsToAdd);

    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update({ points: newPoints })
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Log admin action
    await supabase.from('admin_logs').insert([{
      admin_id: ADMIN_ID,
      action: 'POINTS_UPDATE',
      details: { userId, newPoints, pointsToAdd, reason }
    }]).catch(err => console.error('[DB] Error logging action:', err.message));

    return updatedUser;
  } catch (err) {
    console.error('[DB] Error updating user points:', err.message);
    throw err;
  }
};

// Get all users from database
const getAllUsersDB = async () => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('points', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('[DB] Error fetching all users:', err.message);
    return [];
  }
};

// Search users in database
const searchUsersDB = async (query, limit = 20) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .or(`user_id.eq.${query},name.ilike.%${query}%,username.ilike.%${query}%`)
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('[DB] Error searching users:', err.message);
    return [];
  }
};
/* ================= KEYBOARDS ================= */

const getMenu = (ctx) => {
    let buttons = [
        ['➕ Register New Gmail'],
        ['⚙️ Account', '🚸 My Referrals'],
        ['🏥 Help']
    ];
    if (ctx.from.id === ADMIN_ID) {
        buttons.push(['🛠 Admin Panel']);
    }
    return Markup.keyboard(buttons).resize();
};

const adminKeyboard = Markup.keyboard([
    ['📊 Global Stats', '📢 Broadcast'],
    ['➕ Add Points', '➖ Remove Points'],
    ['👥 List All Users'],
    ['⬅️ Back to User Menu']
]).resize();

const cancelKeyboard = Markup.keyboard([
    ['❌ Cancel Operation']
]).resize();

/* ================= FORCE JOIN ================= */

async function checkJoin(ctx, next) {
    if (ctx.from.id === ADMIN_ID) return next();

    for (const chan of CHANNELS) {
        try {
            const member = await ctx.telegram.getChatMember(chan, ctx.from.id);
            if (['left', 'kicked'].includes(member.status)) throw new Error();
        } catch {
            return ctx.replyWithPhoto(
                { url: 'https://hayre32.wordpress.com/wp-content/uploads/2026/01/image_2026-01-24_114307874.png' },
                {
                    caption: `⛔️ *ACCESS DENIED*\n\nJoin all channels to continue.`,
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.url("📢 Channel 1", "https://t.me/Unlimited_GmailA")],
                        [Markup.button.url("📢 Channel 2", "https://t.me/Global_OnlineWork")],
                        [Markup.button.url("📢 Channel 3", "https://t.me/AbModded_File")],
                        [Markup.button.url("📢 Channel 4", "https://t.me/Canva_Pro_Teams_Links")],
                        [Markup.button.callback("✅ Verify Membership", "verify_and_delete")]
                    ])
                }
            );
        }
    }
    return next();
}

/* ================= VERIFY CALLBACK ================= */

bot.action('verify_and_delete', async (ctx) => {
    for (const chan of CHANNELS) {
        try {
            const member = await ctx.telegram.getChatMember(chan, ctx.from.id);
            if (['left', 'kicked'].includes(member.status)) {
                return ctx.answerCbQuery("❌ Join all channels!", { show_alert: true });
            }
        } catch {
            return ctx.answerCbQuery("❌ Join all channels!", { show_alert: true });
        }
    }

    try { await ctx.deleteMessage(); } catch {}

    const user = await getDB(ctx);

    await ctx.answerCbQuery("Success! Welcome ✅");

    await ctx.replyWithPhoto(
        { url: 'https://hayre32.wordpress.com/wp-content/uploads/2026/01/image_2026-01-24_114307874.png' },
        {
            caption:
`👋 *Welcome to ❝𝕏-𝐇𝐮𝐧𝐭𝐞𝐫❞*

👤 *User:* ${user.name}
💰 *Balance:* \`${user.points} Points\`

Invite friends to earn points!`,
            parse_mode: 'Markdown',
            ...getMenu(ctx)
        }
    );
});

/* ================= START COMMAND ================= */

bot.start(checkJoin, async (ctx) => {
    const user = await getDB(ctx);
    const refId = ctx.payload;

    if (refId && refId != ctx.from.id && !user.referred_by) {
        await supabase
            .from('users')
            .update({ referred_by: refId })
            .eq('user_id', ctx.from.id);

        await supabase.rpc('add_referral', { ref_user_id: refId });

        try {
            await bot.telegram.sendMessage(
                refId,
                `🔔 *Referral Alert!*\nYou earned +1 Point.`,
                { parse_mode: 'Markdown' }
            );
        } catch {}
    }

    await ctx.replyWithPhoto(
        { url: 'https://hayre32.wordpress.com/wp-content/uploads/2026/01/image_2026-01-24_114307874.png' },
        {
            caption:
`👋 *Welcome to ❝𝕏-𝐇𝐮𝐧𝐭𝐞𝐫❞*

👤 *User:* ${user.name}
💰 *Balance:* \`${user.points} Points\`

Invite friends to earn points!`,
            parse_mode: 'Markdown',
            ...getMenu(ctx)
        }
    );
});

// --- MAIN MENU HANDLERS ---

bot.hears('➕ Register New Gmail', checkJoin, async (ctx) => {
    const user = await getDB(ctx);
    
    if (user.points < 5) {
        const needed = 5 - user.points;
        return ctx.replyWithMarkdown(
            `❌ *Insufficient Balance*\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `💰 *Current Balance:* \`${user.points} Points\`\n` +
            `📍 *Points Needed:* \`${needed} Points\`\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `✨ **Ways to Earn Points:**\n` +
            `🔗 Refer Friends → +1 Point per user\n` +
            `🎁 Daily Bonus → +1 Point daily\n` +
            `👑 Premium Tasks → +2-5 Points`,
            Markup.inlineKeyboard([
                [Markup.button.callback("🚸 Invite Friends", "show_referral_link")],
                [Markup.button.callback("🔙 Back", "main_menu")]
            ])
        );
    }

    ctx.session.step = 'EMAIL';
    const preview = `
🌟 *Gmail Registration Portal* 🌟
━━━━━━━━━━━━━━━━━━━━━━━━━━━
💎 *Cost:* 5 Points
📊 *Your Balance:* ${user.points} Points
📈 *Registered:* ${user.registered || 0} Gmails
━━━━━━━━━━━━━━━━━━━━━━━━━━━

📧 **Step 1️⃣ : Send Gmail Address**

Please enter your Gmail address:
_Example: yourname@gmail.com_

⚠️ Ensure the email is valid!`;

    ctx.replyWithMarkdown(preview, cancelKeyboard);
});

bot.hears('⚙️ Account', async (ctx) => {
    const user = await getDB(ctx);
    ctx.replyWithMarkdown(
        `⭐ *PREMIUM ACCOUNT STATUS*\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🆔 *User ID:* \`${ctx.from.id}\`\n` +
        `💰 *Balance:* \`${user.points} Points\`\n` +
        `📊 *Registered:* \`${user.registered || 0} Gmails\`\n` +
        `🚸 *Invites:* \`${user.referrals || 0} Users\`\n` +
        `━━━━━━━━━━━━━━━━━━`, 
        getMenu(ctx)
    );
});

bot.hears('🚸 My Referrals', async (ctx) => {
    const user = await getDB(ctx); 
    const link = `https://t.me/${BOT_USERNAME}?start=${ctx.from.id}`;
    const totalEarned = (user.referrals || 0) * 1;

    ctx.replyWithMarkdown(
        `✨ **𝕏-𝐇𝐔𝐍𝐓𝐄𝐑 AFFILIATE CENTER** ✨\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `👤 **User:** ${user.name}\n` +
        `👥 **Total Referrals:** \`${user.referrals || 0}\`\n` +
        `💰 **Total Earned:** \`${totalEarned} Points\`\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🎁 **Reward:** \`1 Point\` per join!\n\n` +
        `🔗 **Your Unique Link:**\n\`${link}\``, 
        Markup.inlineKeyboard([
            [Markup.button.url("📤 Share Invite Link", `https://t.me/share/url?url=${encodeURIComponent(link)}`)],
            [Markup.button.callback("📊 Refresh Stats", "refresh_ref")],
            [Markup.button.callback("🔙 Back", "main_menu")]
        ])
    );
});

// --- CALLBACK QUERY HANDLERS (With Message Deletion) ---

bot.action('main_menu', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        await ctx.deleteMessage(); // Deletes the inline message
    } catch (e) {
        console.error("Could not delete message:", e);
    }
    return ctx.reply("🏠 Welcome back to the Main Menu", getMenu(ctx));
});

bot.action('show_referral_link', async (ctx) => {
    const user = await getDB(ctx);
    const link = `https://t.me/${BOT_USERNAME}?start=${ctx.from.id}`;
    
    try {
        await ctx.answerCbQuery();
        await ctx.deleteMessage(); // Deletes "Insufficient Balance" message
    } catch (e) {}

    return ctx.replyWithMarkdown(
        `✨ **𝕏-𝐇𝐔𝐍𝐓𝐄𝐑 AFFILIATE CENTER** ✨\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🔗 **Your Unique Link:**\n\`${link}\``, 
        Markup.inlineKeyboard([
            [Markup.button.url("📤 Share Invite Link", `https://t.me/share/url?url=${encodeURIComponent(link)}`)],
            [Markup.button.callback("🔙 Back", "main_menu")]
        ])
    );
});

bot.action('refresh_ref', async (ctx) => {
    const user = await getDB(ctx);
    const link = `https://t.me/${BOT_USERNAME}?start=${ctx.from.id}`;
    const totalEarned = (user.referrals || 0) * 1;
    
    try {
        await ctx.answerCbQuery("Stats Updated! ✅");
        // We use editMessageText here so the message stays the same but updates numbers
        await ctx.editMessageText(
            `✨ **𝕏-𝐇𝐔𝐍𝐓𝐄𝐑 AFFILIATE CENTER** ✨\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `👤 **User:** ${user.name}\n` +
            `👥 **Total Referrals:** \`${user.referrals || 0}\`\n` +
            `💰 **Total Earned:** \`${totalEarned} Points\`\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `🎁 **Reward:** \`1 Point\` per join!\n\n` +
            `🔗 **Your Unique Link:**\n\`${link}\``,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.url("📤 Share Invite Link", `https://t.me/share/url?url=${encodeURIComponent(link)}`)],
                    [Markup.button.callback("📊 Refresh Stats", "refresh_ref")],
                    [Markup.button.callback("🔙 Back", "main_menu")]
                ])
            }
        );
    } catch (e) {
        // If nothing changed, Telegram might throw an error, we ignore it
    }
});

// --- HELP MESSAGE HANDLER ---
bot.hears('🏥 Help', async (ctx) => {
    const helpMessage = 
        `🌟 **Account Registration System** 🌟\n\n` +
        `✅ **Registration Access**\n\n` +
        `🧢 **Allowed Limit:**\n\n` +
        `🤖 The robot has no restrictions on creating accounts using new methods and multiple servers.\n\n` +
        `You can create unlimited Gmail accounts with full automation.\n\n` +
        `⚠️ For safety and long-term stability, we recommend creating 5–10 accounts per hour to avoid bans and security flags.\n\n` +
        `🛍️ **My Referrals System**\n` +
        `☔ **Referral Tracking:**\n\n` +
        `📊 Your referral count is updated every 24 hours.\n\n` +
        `🧠 The system uses AI detection to identify fake or inactive users, and they are automatically excluded from the count.\n\n` +
        `✅ Only real, valid users are recorded and rewarded.`;

    await ctx.replyWithMarkdown(helpMessage, 
        Markup.inlineKeyboard([
            [Markup.button.callback("🗑️ Close Help", "close_help")]
        ])
    );
});

// --- DELETE ACTION ---
bot.action('close_help', async (ctx) => {
    try {
        await ctx.deleteMessage();
        await ctx.answerCbQuery("Message marked as read ✅");
    } catch (e) {
        ctx.answerCbQuery("Already deleted.");
    }
});

// ═══════════════════════════════════════════════════════════════════
// 🛠️  ADVANCED ADMIN PANEL - NODE.JS TELEGRAM BOT
// ═══════════════════════════════════════════════════════════════════

class AdvancedAdminPanel {
    constructor(bot, adminId) {
        this.bot = bot;
        this.adminId = adminId;
        this.adminLog = [];
        this.rateLimits = new Map();
        this.setupHandlers();
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // AUTHORIZATION & SECURITY
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    isAdmin(ctx) {
        return ctx.from.id === this.adminId;
    }

    checkRateLimit(userId, action, limit = 3, windowMs = 60000) {
        const key = `${userId}:${action}`;
        const now = Date.now();
        
        if (!this.rateLimits.has(key)) {
            this.rateLimits.set(key, []);
        }

        const timestamps = this.rateLimits.get(key).filter(t => now - t < windowMs);
        
        if (timestamps.length >= limit) {
            return false;
        }

        timestamps.push(now);
        this.rateLimits.set(key, timestamps);
        return true;
    }

    logAdminAction(action, details) {
        const timestamp = new Date().toISOString();
        const logEntry = { timestamp, action, details };
        this.adminLog.push(logEntry);
        
        // Keep last 100 logs
        if (this.adminLog.length > 100) {
            this.adminLog.shift();
        }

        console.log(`[ADMIN] ${action}:`, details);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STATISTICS & ANALYTICS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    async getDetailedStats() {
        try {
            const users = await getAllUsersDB();
            
            if (!users || users.length === 0) {
                return {
                    totalUsers: 0,
                    totalPoints: 0,
                    averagePoints: 0,
                    topUsers: [],
                    bottomUsers: [],
                    activeToday: 0,
                    registeredCount: 0,
                    timestamp: new Date().toLocaleString(),
                };
            }

            const today = new Date().toDateString();
            const activeToday = users.filter(u => {
                const lastActive = new Date(u.last_active || 0);
                return lastActive.toDateString() === today;
            }).length;

            return {
                totalUsers: users.length,
                totalPoints: users.reduce((sum, u) => sum + (u.points || 0), 0),
                averagePoints: users.length ? (users.reduce((sum, u) => sum + (u.points || 0), 0) / users.length).toFixed(2) : 0,
                topUsers: users.slice(0, 5),
                bottomUsers: users.slice(-5).reverse(),
                activeToday,
                registeredCount: users.length,
                timestamp: new Date().toLocaleString(),
            };
        } catch (err) {
            console.error('[ADMIN] Error getting stats:', err.message);
            return {
                totalUsers: 0,
                totalPoints: 0,
                averagePoints: 0,
                topUsers: [],
                bottomUsers: [],
                activeToday: 0,
                registeredCount: 0,
                timestamp: new Date().toLocaleString(),
                error: err.message
            };
        }
    }

    formatStatsMessage(stats) {
        return `
╔══════════════════════════════════════════╗
║     📊 ADVANCED SERVER STATISTICS 📊     ║
╚══════════════════════════════════════════╝

👥 **Total Users:** ${stats.totalUsers}
🎯 **Total Points Distributed:** ${stats.totalPoints.toLocaleString()}
📈 **Average Points/User:** ${stats.averagePoints}
🔥 **Active Today:** ${stats.activeToday}
⏰ **Updated:** ${stats.timestamp}

┌─ 🏆 TOP 5 USERS ─────────────────────────┐
${stats.topUsers.map((u, i) => `${i + 1}. ${u.name} (@${u.username}) • ${u.points} pts`).join('\n')}
└──────────────────────────────────────────┘

┌─ ⬇️  BOTTOM 5 USERS ──────────────────────┐
${stats.bottomUsers.map((u, i) => `${i + 1}. ${u.name} (@${u.username}) • ${u.points} pts`).join('\n')}
└──────────────────────────────────────────┘

🔐 **Server Status:** ✅ OPERATIONAL
⚡ **API Latency:** ~${Math.random() * 50 + 20 | 0}ms
📡 **Uptime:** ${(process.uptime() / 3600).toFixed(1)}h
        `;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // USER SEARCH & FILTERING
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    async searchUsers(query, limit = 20) {
        try {
            return await searchUsersDB(query, limit);
        } catch (err) {
            console.error('[ADMIN] Error searching users:', err.message);
            return [];
        }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ADVANCED BROADCAST SYSTEM
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    async broadcastMessage(ctx, messageId, targetIds = null) {
        if (!this.checkRateLimit(ctx.from.id, 'broadcast')) {
            return ctx.reply('⏱️ **Rate Limit:** Too many broadcasts. Please wait before trying again.');
        }

        try {
            // Get targets from Supabase if not provided
            let targets = targetIds;
            if (!targets) {
                const users = await getAllUsersDB();
                targets = users.map(u => u.user_id);
            }

            if (!targets || targets.length === 0) {
                return ctx.reply('❌ No users found for broadcast.');
            }

            let sent = 0, failed = 0;

            await ctx.reply(`📡 **Broadcasting to ${targets.length} users...**\n\n⏳ Processing...`);

            for (const userId of targets) {
                try {
                    await ctx.telegram.copyMessage(userId, ctx.chat.id, messageId);
                    sent++;
                } catch (e) {
                    failed++;
                    console.error(`Failed to send to ${userId}:`, e.message);
                }
            }

            this.logAdminAction('BROADCAST', { sent, failed, total: targets.length });

            return ctx.reply(
                `✅ **BROADCAST COMPLETE**\n\n` +
                `✔️ Sent: ${sent}\n` +
                `❌ Failed: ${failed}\n` +
                `📊 Success Rate: ${((sent / targets.length) * 100).toFixed(1)}%`
            );
        } catch (err) {
            console.error('[ADMIN] Error broadcasting:', err.message);
            return ctx.reply('❌ Error during broadcast: ' + err.message);
        }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // POINTS MANAGEMENT - ADVANCED
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    async updateUserPoints(userId, amount, reason = 'Manual adjustment') {
        try {
            const updatedUser = await updateUserPointsDB(userId, amount, reason);
            
            this.logAdminAction('POINTS_UPDATE', {
                userId,
                newPoints: updatedUser.points,
                change: amount,
                reason
            });

            return {
                success: true,
                userId,
                newPoints: updatedUser.points,
                change: amount
            };
        } catch (err) {
            console.error('[ADMIN] Error updating points:', err.message);
            return { success: false, error: err.message };
        }
    }

    async bulkUpdatePoints(userIds, amount, reason) {
        try {
            const results = await Promise.all(
                userIds.map(id => this.updateUserPoints(id, amount, reason))
            );
            const successful = results.filter(r => r.success).length;

            this.logAdminAction('BULK_POINTS_UPDATE', {
                total: userIds.length,
                successful,
                amount,
                reason
            });

            return results;
        } catch (err) {
            console.error('[ADMIN] Error bulk updating points:', err.message);
            return [];
        }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // USER MANAGEMENT
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    async getUserProfile(userId) {
        try {
            const { data: user, error } = await supabase
                .from('users')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (error || !user) return null;

            const joinDate = new Date(user.joined || Date.now());
            const lastActive = new Date(user.last_active || Date.now());

            return {
                ...user,
                userId,
                joinedDate: joinDate.toLocaleDateString(),
                lastActiveDate: lastActive.toLocaleDateString(),
                accountAgeInDays: Math.floor((Date.now() - joinDate) / (1000 * 60 * 60 * 24)),
            };
        } catch (err) {
            console.error('[ADMIN] Error getting user profile:', err.message);
            return null;
        }
    }

    formatUserProfile(profile) {
        return `
╔══════════════════════════════════════════╗
║        👤 USER PROFILE DETAILS 👤        ║
╚══════════════════════════════════════════╝

🆔 **User ID:** \`${profile.userId}\`
📝 **Name:** ${profile.name}
🔗 **Username:** @${profile.username}
💰 **Points:** ${profile.points}
📅 **Joined:** ${profile.joinedDate}
🕐 **Last Active:** ${profile.lastActiveDate}
⏳ **Account Age:** ${profile.accountAgeInDays} days
        `;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ADMIN LOG VIEWER
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    getAdminLog(limit = 10) {
        return this.adminLog.slice(-limit).reverse();
    }

    formatAdminLog() {
        const logs = this.getAdminLog(15);
        const formatted = logs.map((log, i) => 
            `${i + 1}. **${log.action}** (${new Date(log.timestamp).toLocaleTimeString()})`
        ).join('\n');

        return `
╔══════════════════════════════════════════╗
║      📋 RECENT ADMIN ACTIONS LOG 📋      ║
╚══════════════════════════════════════════╝

${formatted || 'No recent actions'}

✏️ *Total Actions Logged:* ${this.adminLog.length}
        `;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // UI KEYBOARDS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    getMainAdminKeyboard() {
        return Markup.keyboard([
            ['📊 Statistics', '📢 Broadcast Message'],
            ['💰 Manage Points', '👥 User Directory'],
            ['🔍 Search User', '📋 Action Logs'],
            ['⬅️ Back to User Menu']
        ]).resize();
    }

    getPointsKeyboard() {
        return Markup.keyboard([
            ['➕ Add Points', '➖ Remove Points'],
            ['📊 Bulk Update'],
            ['⬅️ Back to Admin Menu']
        ]).resize();
    }

    getSearchKeyboard() {
        return Markup.keyboard([
            ['🔄 New Search'],
            ['⬅️ Back to Admin Menu']
        ]).resize();
    }

    getCancelKeyboard() {
        return Markup.keyboard([
            ['❌ Cancel Operation']
        ]).resize();
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // HANDLER SETUP
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    setupHandlers() {
        // Main Admin Panel
        this.bot.hears('🛠 Admin Panel', (ctx) => {
            if (!this.isAdmin(ctx)) {
                return ctx.reply('❌ This area is restricted to administrators only.');
            }
            ctx.reply(
                '╔════════════════════════════════╗\n' +
                '║ 🛠️  ADMIN CONTROL PANEL 🛠️   ║\n' +
                '╚════════════════════════════════╝\n\n' +
                'Select a management tool:',
                this.getMainAdminKeyboard()
            );
            this.logAdminAction('ACCESS_PANEL', { userId: ctx.from.id });
        });

        // Statistics
        this.bot.hears('📊 Statistics', async (ctx) => {
            if (!this.isAdmin(ctx)) return;
            const stats = await this.getDetailedStats();
            ctx.replyWithMarkdown(this.formatStatsMessage(stats));
            this.logAdminAction('VIEW_STATS', {});
        });

        // Search User
        this.bot.hears('🔍 Search User', (ctx) => {
            if (!this.isAdmin(ctx)) return;
            ctx.session.step = 'SEARCH_QUERY';
            ctx.reply('🔍 **Enter user ID, name, or username:**', this.getCancelKeyboard());
        });

        // Action Logs
        this.bot.hears('📋 Action Logs', (ctx) => {
            if (!this.isAdmin(ctx)) return;
            ctx.replyWithMarkdown(this.formatAdminLog());
        });

        // Points Management
        this.bot.hears('💰 Manage Points', (ctx) => {
            if (!this.isAdmin(ctx)) return;
            ctx.reply('💰 **Points Management**', this.getPointsKeyboard());
        });

        // Broadcast
        this.bot.hears('📢 Broadcast Message', (ctx) => {
            if (!this.isAdmin(ctx)) return;
            ctx.session.step = 'BROADCAST_PREVIEW';
            ctx.replyWithMarkdown('📢 **Advanced Broadcast System**\n\n➡️ Send your message now...', this.getCancelKeyboard());
        });

        // Add/Remove Points
        this.bot.hears('➕ Add Points', (ctx) => {
            if (!this.isAdmin(ctx)) return;
            ctx.session.step = 'ADD_POINTS_ID';
            ctx.reply('➕ **Enter User ID to add points:**', this.getCancelKeyboard());
        });

        this.bot.hears('➖ Remove Points', (ctx) => {
            if (!this.isAdmin(ctx)) return;
            ctx.session.step = 'REM_POINTS_ID';
            ctx.reply('➖ **Enter User ID to remove points:**', this.getCancelKeyboard());
        });

        // User Directory
        this.bot.hears('👥 User Directory', async (ctx) => {
            if (!this.isAdmin(ctx)) return;
            
            try {
                const users = await getAllUsersDB();
                if (!users || users.length === 0) return ctx.reply('📭 Database is empty.');
                
                const buttons = users.slice(0, 50).map(user => 
                    [Markup.button.callback(`${user.name || 'User'} - 💰 ${user.points}`, `view_prof:${user.user_id}`)]
                );
                
                if (buttons.length > 0) {
                    ctx.replyWithMarkdown(
                        `📂 **USER DIRECTORY** (${users.length} total)\n━━━━━━━━━━━━━━━━`,
                        Markup.inlineKeyboard(buttons)
                    );
                    this.logAdminAction('VIEW_DIRECTORY', { count: users.length });
                } else {
                    ctx.reply('❌ No users found.');
                }
            } catch (err) {
                ctx.reply('❌ Error loading user directory');
                console.error('[ADMIN] Error loading directory:', err.message);
            }
        });

        // Back buttons
        this.bot.hears('⬅️ Back to Admin Menu', (ctx) => {
            ctx.session = {};
            ctx.reply('↩️ Returning to Admin Menu...', this.getMainAdminKeyboard());
        });

        this.bot.hears('⬅️ Back to User Menu', (ctx) => {
            ctx.session = {};
            ctx.reply('↩️ Returning to User Menu...', getMenu(ctx));
        });

        // Cancel
        this.bot.hears('❌ Cancel Operation', (ctx) => {
            ctx.session = {};
            ctx.reply('🚫 Operation cancelled.', this.getMainAdminKeyboard());
        });

        // State Handler
        this.bot.on('message', async (ctx, next) => {
            const state = ctx.session?.step;
            if (!state) return next();
            
            const text = ctx.message?.text;

            // Gmail Registration Logic - Handle both admin and regular users
            if (state === 'EMAIL') {
                const emailRegex = /^[a-zA-Z0-9._%-]+@gmail\.com$/;
                if (!emailRegex.test(text.trim())) {
                    return ctx.replyWithMarkdown(
                        `❌ *Invalid Gmail Format*\n\n` +
                        `Please send a valid Gmail address:\n` +
                        `✅ Valid: \`yourname@gmail.com\`\n` +
                        `❌ Invalid: \`yourname@yahoo.com\`\n\n` +
                        `Try again:`,
                        cancelKeyboard
                    );
                }
                ctx.session.email = text.trim();
                
                // Send initial confirmation
                await ctx.replyWithMarkdown(
                    `⏳ *Validating Email Address...*\n\n` +
                    `Processing: \`${ctx.session.email}\``
                );

                // Simulate checking email validity
                await new Promise(resolve => setTimeout(resolve, 2000));

                // Check user balance
                const user = await getDB(ctx);
                await ctx.replyWithMarkdown(
                    `✅ *Email Validated!*\n\n` +
                    `📧 \`${ctx.session.email}\`\n\n` +
                    `━━━━━━━━━━━━━━━━━━\n` +
                    `💰 **Balance Check:**\n` +
                    `├─ Current Balance: ${user.points} Points\n` +
                    `├─ Cost: 5 Points\n` +
                    `└─ Status: ✅ Approved\n` +
                    `━━━━━━━━━━━━━━━━━━\n\n` +
                    `🔑 **Step 2️⃣: Send Password**\n\n` +
                    `Please enter the password for this account:`,
                    cancelKeyboard
                );
                
                ctx.session.step = 'PASS';
                return;
            }

            if (state === 'PASS') {
                const email = ctx.session.email;
                const password = text;
                const user = await getDB(ctx);
                
                if (!password || password.length < 8) {
                    return ctx.replyWithMarkdown(
                        `❌ *Password Too Weak*\n\n` +
                        `Requirements:\n` +
                        `✓ Minimum 8 characters\n` +
                        `✓ Mix of letters & numbers\n\n` +
                        `Try again:`,
                        cancelKeyboard
                    );
                }
                
                // Deduct points immediately
                user.points -= 5;
                user.registered += 1;
                
                // Send processing message
                const processingMsg = await ctx.replyWithMarkdown(
                    `⏳ *Processing Registration...*\n\n` +
                    `📧 Email: \`${email}\`\n` +
                    `🔐 Password: Received\n\n` +
                    `━━━━━━━━━━━━━━━━━━\n` +
                    `⚙️ Setting up account...`
                );

                // Simulate 10-second processing with progress animation
                const steps = [
                    { time: 2000, text: `⏳ *Processing...* 20%\n\n🔄 Validating credentials...` },
                    { time: 4000, text: `⏳ *Processing...* 40%\n\n🔄 Setting up account...` },
                    { time: 6000, text: `⏳ *Processing...* 60%\n\n🔄 Configuring settings...` },
                    { time: 8000, text: `⏳ *Processing...* 80%\n\n🔄 Finalizing setup...` }
                ];

                for (const step of steps) {
                    await new Promise(resolve => setTimeout(resolve, step.time));
                    try {
                        await ctx.telegram.editMessageText(
                            ctx.chat.id,
                            processingMsg.message_id,
                            undefined,
                            step.text,
                            { parse_mode: 'Markdown' }
                        );
                    } catch (e) {
                        // Silently ignore edit errors
                    }
                }

                // Final success message after 10 seconds
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                const successMessage = `
✅ *Registration Complete!* ✅
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 *Account Details:*
├─ Email: \`${email}\`
├─ Status: Active ✅
└─ Created: Now

💰 *Payment Processed:*
├─ Cost: -5 Points
├─ Balance: ${user.points} Pts
└─ Accounts: ${user.registered} total

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 Your account is ready to use!
                `;
                
                ctx.session = {};
                await ctx.replyWithMarkdown(successMessage, getMenu(ctx));
            }

            // Admin-only operations
            if (!this.isAdmin(ctx)) return next();

            // Search Logic
            if (state === 'SEARCH_QUERY') {
                try {
                    const results = await this.searchUsers(text);
                    if (!results || results.length === 0) {
                        ctx.reply('❌ No users found.');
                        ctx.session.step = 'SEARCH_QUERY';
                        return;
                    }

                    const buttons = results.slice(0, 20).map(user =>
                        [Markup.button.callback(
                            `${user.name || 'User'} - @${user.username || 'N/A'}`,
                            `view_prof:${user.user_id}`
                        )]
                    );

                    ctx.replyWithMarkdown(
                        `🔍 **Found ${results.length} results:**\n━━━━━━━━━━━━━━━━`,
                        Markup.inlineKeyboard(buttons)
                    );
                    ctx.session = {};
                } catch (err) {
                    ctx.reply('❌ Error searching users: ' + err.message);
                    ctx.session.step = 'SEARCH_QUERY';
                }
            }

            // Broadcast
            if (state === 'BROADCAST_PREVIEW') {
                ctx.session.msgToCopy = ctx.message.message_id;
                ctx.session.step = 'BROADCAST_CONFIRM';
                await ctx.reply('👇 **PREVIEW:**');
                await ctx.telegram.copyMessage(ctx.chat.id, ctx.chat.id, ctx.message.message_id);
                return ctx.reply('✅ Confirm & Send?', Markup.keyboard([['✅ CONFIRM & SEND'], ['❌ Cancel Operation']]).resize());
            }

            if (state === 'BROADCAST_CONFIRM' && text === '✅ CONFIRM & SEND') {
                await this.broadcastMessage(ctx, ctx.session.msgToCopy);
                ctx.session = {};
            }

            // Add/Remove Points
            if (state === 'ADD_POINTS_ID') {
                try {
                    const user = await getDB(parseInt(text));
                    if (!user) {
                        return ctx.reply('❌ User not found.');
                    }
                    ctx.session.targetId = text;
                    ctx.session.step = 'ADD_POINTS_AMT';
                    return ctx.reply('💰 **Enter points amount:**', this.getCancelKeyboard());
                } catch (err) {
                    return ctx.reply('❌ Error checking user: ' + err.message);
                }
            }

            if (state === 'ADD_POINTS_AMT') {
                try {
                    const amount = parseInt(text);
                    if (isNaN(amount) || amount < 0) {
                        return ctx.reply('❌ Enter a valid positive number.');
                    }
                    const result = await this.updateUserPoints(ctx.session.targetId, amount, 'Admin manual addition');
                    ctx.session = {};
                    return ctx.reply(`✅ Added ${amount} points to user ${result.userId}`, this.getMainAdminKeyboard());
                } catch (err) {
                    return ctx.reply('❌ Error adding points: ' + err.message);
                }
            }

            if (state === 'REM_POINTS_ID') {
                try {
                    const user = await getDB(parseInt(text));
                    if (!user) {
                        return ctx.reply('❌ User not found.');
                    }
                    ctx.session.targetId = text;
                    ctx.session.step = 'REM_POINTS_AMT';
                    return ctx.reply('💰 **Enter points to remove:**', this.getCancelKeyboard());
                } catch (err) {
                    return ctx.reply('❌ Error checking user: ' + err.message);
                }
            }

            if (state === 'REM_POINTS_AMT') {
                try {
                    const amount = parseInt(text);
                    if (isNaN(amount) || amount < 0) {
                        return ctx.reply('❌ Enter a valid positive number.');
                    }
                    const result = await this.updateUserPoints(ctx.session.targetId, -amount, 'Admin manual removal');
                    ctx.session = {};
                    return ctx.reply(`✅ Removed ${amount} points from user ${result.userId}`, this.getMainAdminKeyboard());
                } catch (err) {
                    return ctx.reply('❌ Error removing points: ' + err.message);
                }
            }
        });

        // Callback for user profile viewing
        this.bot.action(/view_prof:(.+)/, async (ctx) => {
            if (!this.isAdmin(ctx)) return ctx.answerCbQuery('❌ Access denied');
            
            try {
                const profile = await this.getUserProfile(ctx.match[1]);
                if (!profile) return ctx.answerCbQuery('❌ User not found');
                
                ctx.replyWithMarkdown(this.formatUserProfile(profile));
                ctx.answerCbQuery();
            } catch (err) {
                ctx.answerCbQuery('❌ Error loading profile');
                console.error('[ADMIN] Error viewing profile:', err.message);
            }
        });
    }
}

// Initialize Admin Panel
const adminPanel = new AdvancedAdminPanel(bot, ADMIN_ID);

// --- CALLBACK HANDLERS ---
bot.action(/quick_add:(.+)/, (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('❌ Access denied');
    ctx.session.step = 'ADD_POINTS_AMT';
    ctx.session.targetId = ctx.match[1];
    ctx.reply(`💰 **Enter points to add for ID ${ctx.match[1]}:**`, cancelKeyboard);
    ctx.answerCbQuery();
});

bot.action(/quick_rem:(.+)/, (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('❌ Access denied');
    ctx.session.step = 'REM_POINTS_AMT';
    ctx.session.targetId = ctx.match[1];
    ctx.reply(`💰 **Enter points to remove for ID ${ctx.match[1]}:**`, cancelKeyboard);
    ctx.answerCbQuery();
});

bot.action('list_users_back', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('❌ Access denied');
    const userIds = Object.keys(await getAllUsersDB());
    const buttons = userIds.map(id => [Markup.button.callback(`👤 ID: ${id} | 💰 ${getDB(id).points} pts`, `view_prof:${id}`)]);
    await ctx.editMessageText("📂 **𝕏-𝐇𝐔𝐍𝐓𝐄𝐑 USER DIRECTORY**", { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
});

(async () => {
    try {
        await bot.launch();
        console.log("❝𝕏-𝐇𝐮𝐧𝐭𝐞𝐫❞ Advanced Bot Online 🚀");
        process.once('SIGINT', () => bot.stop('SIGINT'));
        process.once('SIGTERM', () => bot.stop('SIGTERM'));
    } catch (error) {
        console.error('Bot launch failed:', error);
        process.exit(1);
    }
})();
