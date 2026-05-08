// مسیر فایل: /services/moderationService.js
// توضیح: سرویس moderation چندلایه (Regex + API خارجی اختیاری).
// بر اساس الگوی self-hosted LocalMod با fallback به regex.

const axios = require('axios');

// ===========================================
// Regex Suite — تشخیص سریع offensive text
// ===========================================
const OFFENSIVE_PATTERNS = [
    /\b(fuck|shit|damn|ass|bitch|crap|dick|piss|bastard|slut|whore)\b/i,
    /\b(nigger|kike|faggot|tranny|retard|spastic)\b/i,
    /\b(kill\s+(yourself|urself|u))\b/i,
    /\b(terrorist|bomb\s+threat)\b/i,
];

const SPAM_PATTERNS = [
    /(buy\s+now|click\s+here|limited\s+offer|discount|free\s+(trial|money|offer))/i,
    /(https?:\/\/[^\s]+){3,}/,  // >۲ URL
    /([A-Z\s]{30,})/,            // CAPS LOCK اسپم
];

/**
 * تحلیل متن با regex
 * @returns {{ flagged: boolean, reason: string|null }}
 */
function analyzeTextLocally(text) {
    for (const pattern of OFFENSIVE_PATTERNS) {
        if (pattern.test(text)) {
            return { flagged: true, reason: 'offensive_language' };
        }
    }
    for (const pattern of SPAM_PATTERNS) {
        if (pattern.test(text)) {
            return { flagged: true, reason: 'spam' };
        }
    }
    return { flagged: false, reason: null };
}

/**
 * تحلیل متن با API خارجی (ModerationAPI یا LocalMod)
 * این تابع در صورت تنظیم API Key در env فراخوانی می‌شود.
 */
async function analyzeTextRemote(text) {
    const apiKey = process.env.MODERATION_API_KEY;
    if (!apiKey) return null;

    try {
        const { default: ModerationAPI } = await import('@moderation-api/sdk');
        const client = new ModerationAPI({ secretKey: apiKey });
        const result = await client.content.submit({
            content: { type: 'text', text },
        });
        return {
            flagged: result.evaluation.flagged,
            reason: result.evaluation.flagged ? 'remote_flagged' : null,
            recommendation: result.recommendation?.action || 'allow',
        };
    } catch (err) {
        console.warn('[Moderation] Remote API error:', err.message);
        return null;
    }
}

/**
 * تابع اصلی moderation
 * @returns {{ flagged: boolean, reason: string|null, recommendation: string }}
 */
async function moderateText(text) {
    if (!text || typeof text !== 'string') {
        return { flagged: false, reason: null, recommendation: 'allow' };
    }

    // لایه ۱: Regex سریع
    const localResult = analyzeTextLocally(text);
    if (localResult.flagged) {
        return { ...localResult, recommendation: 'reject' };
    }

    // لایه ۲: API خارجی (در صورت وجود)
    const remoteResult = await analyzeTextRemote(text);
    if (remoteResult) {
        return {
            flagged: remoteResult.flagged,
            reason: remoteResult.reason,
            recommendation: remoteResult.recommendation,
        };
    }

    return { flagged: false, reason: null, recommendation: 'allow' };
}

module.exports = { moderateText, analyzeTextLocally };
