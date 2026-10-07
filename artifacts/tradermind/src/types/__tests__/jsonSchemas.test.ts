/**
 * تست‌های Zod JSON Schemas — Prompt 4 (Part 10)
 */
import { describe, it, expect } from 'vitest';
import {
  TradeReviewSchema,
  PostTradeReviewSchema,
  StepResultSchema,
  ScreenshotsSchema,
  KnowledgeTagsSchema,
  parseJsonSchema,
  defaultTradeReview,
} from '../jsonSchemas';

describe('TradeReviewSchema', () => {
  it('باید یک review معتبر را parse کند', () => {
    const result = TradeReviewSchema.safeParse({
      didWell: 'صبر کردم',
      didWrong: 'زود خارج شدم',
      learned: 'باید منتظر confirmation باشم',
      wouldTakeAgain: true,
      validSetup: true,
    });
    expect(result.success).toBe(true);
  });

  it('باید مقادیر پیش‌فرض را اعمال کند', () => {
    const result = TradeReviewSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.didWell).toBe('');
      expect(result.data.wouldTakeAgain).toBeNull();
    }
  });

  it('باید با فیلدهای اضافه fail شود (strict mode)', () => {
    const result = TradeReviewSchema.safeParse({
      unknownField: 'unexpected',
    });
    expect(result.success).toBe(false);
  });
});

describe('PostTradeReviewSchema', () => {
  it('باید یک review کامل را parse کند', () => {
    const result = PostTradeReviewSchema.safeParse({
      completedAt: 1700000000000,
      whatDidISee: 'FVG تشکیل شد',
      whyEntered: 'تأیید روند',
      planFollowed: true,
      executionAssessment: 'عالی',
      overallRating: 8,
    });
    expect(result.success).toBe(true);
  });

  it('باید rating خارج از محدوده را رد کند', () => {
    const result = PostTradeReviewSchema.safeParse({ overallRating: 11 });
    expect(result.success).toBe(false);
  });
});

describe('StepResultSchema', () => {
  it('باید یک stepResults معتبر را parse کند', () => {
    const result = StepResultSchema.safeParse({
      'step-001': { value: 'yes', answeredAt: 1700000000 },
      'step-002': { value: ['a', 'b'], answeredAt: 1700000001 },
    });
    expect(result.success).toBe(true);
  });
});

describe('ScreenshotsSchema', () => {
  it('باید آرایه screenshot را parse کند', () => {
    const result = ScreenshotsSchema.safeParse([
      { id: 'sc1', label: 'ورود', dataUrl: 'data:image/webp;base64,abc', type: 'entry' },
    ]);
    expect(result.success).toBe(true);
  });

  it('باید آرایه خالی را قبول کند', () => {
    const result = ScreenshotsSchema.safeParse([]);
    expect(result.success).toBe(true);
  });
});

describe('KnowledgeTagsSchema', () => {
  it('باید آرایه رشته را قبول کند', () => {
    const result = KnowledgeTagsSchema.safeParse(['ریسک', 'پلن', 'FVG']);
    expect(result.success).toBe(true);
  });

  it('باید آرایه غیر رشته را رد کند', () => {
    const result = KnowledgeTagsSchema.safeParse([1, 2, 3]);
    expect(result.success).toBe(false);
  });
});

describe('parseJsonSchema', () => {
  it('باید JSON string را parse و validate کند', () => {
    const raw = JSON.stringify({ didWell: 'خوب', didWrong: '', learned: '', wouldTakeAgain: null, validSetup: null });
    const result = parseJsonSchema(TradeReviewSchema, raw, defaultTradeReview);
    expect(result.didWell).toBe('خوب');
  });

  it('باید برای JSON خراب fallback برگرداند', () => {
    const result = parseJsonSchema(TradeReviewSchema, '{bad json}', defaultTradeReview);
    expect(result).toEqual(defaultTradeReview);
  });

  it('باید برای null fallback برگرداند', () => {
    const result = parseJsonSchema(TradeReviewSchema, null, defaultTradeReview);
    expect(result).toEqual(defaultTradeReview);
  });
});
