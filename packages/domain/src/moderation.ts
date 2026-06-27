import type { MessageReviewStatus } from "./schemas.js";

export type ReviewResult =
  | { status: "approved"; normalizedNote: string }
  | { status: "rejected"; reason: string };

const MAX_SHORT_NOTE_CHARS = 50;

const blockedTerms = [
  "微信",
  "wechat",
  "vx",
  "qq",
  "邮箱",
  "二维码",
  "群号",
  "加群",
  "进群",
  "入群",
  "群聊",
  "扫码",
  "优惠",
  "折扣",
  "代理",
  "返现",
  "招聘",
  "兼职",
  "贷款",
  "博彩",
  "彩票",
  "中奖",
  "赌博",
  "下注",
  "开奖",
  "赌场",
  "job",
  "jobs",
  "hiring",
  "hire",
  "recruit",
  "recruiting",
  "loan",
  "loans",
  "gamble",
  "gambling",
  "lottery",
  "promo",
  "promotion",
  "discount",
  "coupon",
  "cashback",
  "agent",
];

const blockedPatterns = [
  /https?:\/\//iu,
  /www\./iu,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu,
  /\d(?:[\s-]?\d){6,}/u,
];

export function reviewShortNote(note: string): ReviewResult {
  const normalizedNote = note.trim();

  if ([...normalizedNote].length > MAX_SHORT_NOTE_CHARS) {
    return {
      status: "rejected",
      reason: "Short note must be 50 characters or fewer",
    };
  }

  const lowerNote = normalizedNote.toLowerCase();
  const hasBlockedPattern = blockedPatterns.some((pattern) => pattern.test(normalizedNote));
  const hasBlockedTerm = blockedTerms.some((term) => lowerNote.includes(term.toLowerCase()));

  if (hasBlockedPattern || hasBlockedTerm) {
    return {
      status: "rejected",
      reason: "Short note contains disallowed contact, promotional, or abuse content",
    };
  }

  const status: MessageReviewStatus = "approved";
  return { status, normalizedNote };
}
