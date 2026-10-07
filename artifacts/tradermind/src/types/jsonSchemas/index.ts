/**
 * jsonSchemas/index.ts — Prompt 4 (Part 3)
 * Zod schemas برای JSON string‌های ذخیره‌شده در دیتابیس
 */
import { z } from 'zod';

// ─── Trade Review ─────────────────────────────────────────────────────────────

export const TradeReviewSchema = z.object({
  didWell: z.string().default(''),
  didWrong: z.string().default(''),
  learned: z.string().default(''),
  wouldTakeAgain: z.boolean().nullable().default(null),
  validSetup: z.boolean().nullable().default(null),
}).strict();

export type TradeReview = z.infer<typeof TradeReviewSchema>;

export const defaultTradeReview: TradeReview = {
  didWell: '',
  didWrong: '',
  learned: '',
  wouldTakeAgain: null,
  validSetup: null,
};

// ─── Post Trade Review ───────────────────────────────────────────────────────

export const PostTradeReviewSchema = z.object({
  completedAt: z.number().default(0),
  whatDidISee: z.string().default(''),
  whyEntered: z.string().default(''),
  planFollowed: z.boolean().nullable().default(null),
  executionAssessment: z.string().default(''),
  whatLearnedAboutSelf: z.string().default(''),
  whatLearnedAboutMarket: z.string().default(''),
  improvementForNext: z.string().default(''),
  emotionalState: z.string().default(''),
  overallRating: z.number().min(1).max(10).nullable().default(null),
}).catchall(z.unknown());

export type PostTradeReview = z.infer<typeof PostTradeReviewSchema>;

// ─── Checklist / Step Results ────────────────────────────────────────────────

export const StepResultValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.null(),
]);

export const StepResultItemSchema = z.object({
  value: StepResultValueSchema,
  answeredAt: z.number(),
});

export const StepResultSchema = z.record(z.string(), StepResultItemSchema);

export type StepResultItem = z.infer<typeof StepResultItemSchema>;
export type StepResults = z.infer<typeof StepResultSchema>;

// ─── Checklist Schema ────────────────────────────────────────────────────────

export const ChecklistItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  checked: z.boolean().default(false),
  required: z.boolean().default(false),
});

export const ChecklistSchema = z.object({
  items: z.array(ChecklistItemSchema).default([]),
  completedAt: z.number().nullable().default(null),
});

export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;
export type Checklist = z.infer<typeof ChecklistSchema>;

// ─── Screenshot Schema ───────────────────────────────────────────────────────

export const ScreenshotItemSchema = z.object({
  id: z.string(),
  label: z.string().default(''),
  dataUrl: z.string().default(''),
  type: z.string().default('chart'),
  linkedTo: z.string().nullable().default(null),
});

export const ScreenshotsSchema = z.array(ScreenshotItemSchema);

export type ScreenshotItem = z.infer<typeof ScreenshotItemSchema>;

// ─── Knowledge Note Tags ─────────────────────────────────────────────────────

export const KnowledgeTagsSchema = z.array(z.string());

export const KnowledgeSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string().default(''),
  tags: KnowledgeTagsSchema.default([]),
  category: z.string().default('general'),
  createdAt: z.number(),
  updatedAt: z.number(),
  linkedTradeIds: z.array(z.string()).default([]),
});

export type KnowledgeNote = z.infer<typeof KnowledgeSchema>;

// ─── MTF Analysis ────────────────────────────────────────────────────────────

export const MTFTimeframeSchema = z.object({
  screenshotId: z.string().nullable().default(null),
  bias: z.string().default(''),
  structure: z.string().default(''),
  context: z.string().default(''),
  confirmation: z.string().default(''),
  importantLevels: z.string().default(''),
  notes: z.string().default(''),
});

export const MTFAnalysisSchema = z.object({
  '4H': MTFTimeframeSchema,
  '15M': MTFTimeframeSchema,
  '5M': MTFTimeframeSchema,
  '1M': MTFTimeframeSchema,
});

export type MTFTimeframe = z.infer<typeof MTFTimeframeSchema>;

// ─── Final Decision ──────────────────────────────────────────────────────────

export const FinalDecisionSchema = z.object({
  choice: z.enum(['execute', 'no-trade', 'wait', 'cancelled']),
  reason: z.string().default(''),
});

export type FinalDecision = z.infer<typeof FinalDecisionSchema>;

// ─── Live Monitoring ─────────────────────────────────────────────────────────

export const LiveMonitoringDataSchema = z.object({
  startedAt: z.number(),
  notes: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  checkpoints: z.array(z.object({
    timestamp: z.number(),
    note: z.string(),
    price: z.number().nullable().default(null),
  })).default([]),
}).catchall(z.unknown());

export type LiveMonitoringData = z.infer<typeof LiveMonitoringDataSchema>;

// ─── Helper: parse with Zod schema ──────────────────────────────────────────

/**
 * JSON string رو parse کرده و با schema validate می‌کند.
 * در صورت خطا مقدار default برمی‌گردد.
 */
export function parseJsonSchema<T>(
  schema: z.ZodType<T>,
  raw: string | null | undefined,
  fallback: T,
): T {
  if (!raw || raw.trim() === '') return fallback;
  try {
    const parsed = JSON.parse(raw);
    const result = schema.safeParse(parsed);
    return result.success ? result.data : fallback;
  } catch {
    return fallback;
  }
}
