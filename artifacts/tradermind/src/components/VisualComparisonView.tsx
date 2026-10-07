/**
 * VisualComparisonView — Prompt 15, Section 11
 * ──────────────────────────────────────────────
 * Compares what the user wrote in their analysis
 * with what the visual features show in the screenshot.
 */

import { AnalysisComparison } from '../types/screenshot';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { CheckCircle2, AlertCircle, FileText, Eye } from 'lucide-react';
import { cn } from '../lib/utils';

interface Props {
  comparison: AnalysisComparison;
  userTextLabel?: string;
}

export default function VisualComparisonView({ comparison, userTextLabel = 'تحلیل کاربر' }: Props) {
  const { userText, extractedFeatures, agreements, differences } = comparison;

  const confirmedFeatures = extractedFeatures.filter(f => f.confirmed !== false);
  const hasData = confirmedFeatures.length > 0 || userText.trim().length > 0;

  if (!hasData) return null;

  return (
    <div className="space-y-4">
      {/* Two-column text vs visual */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* User text */}
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-blue-300">
              <FileText className="w-4 h-4" />
              {userTextLabel}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {userText.trim() ? (
              <p className="text-sm text-muted-foreground leading-relaxed">{userText}</p>
            ) : (
              <p className="text-xs text-muted-foreground italic">متنی ثبت نشده</p>
            )}
          </CardContent>
        </Card>

        {/* Visual features */}
        <Card className="border-violet-500/20 bg-violet-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-violet-300">
              <Eye className="w-4 h-4" />
              ویژگی‌های بصری (AI)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {confirmedFeatures.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {confirmedFeatures.map(f => (
                  <span
                    key={f.id}
                    className="text-xs px-2 py-0.5 bg-violet-500/20 border border-violet-500/30
                               text-violet-300 rounded-full"
                  >
                    {f.correctedValue
                      ? (f.label !== f.correctedValue ? f.correctedValue : f.label)
                      : f.label}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">ویژگی تأییدشده‌ای ثبت نشده</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Agreements */}
      {agreements.length > 0 && (
        <div className="rounded-lg border border-green-500/25 bg-green-500/5 p-3 space-y-1.5">
          <p className="text-xs font-medium text-green-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            همخوانی‌ها ({agreements.length})
          </p>
          <ul className="space-y-1">
            {agreements.map((a, i) => (
              <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                <span className="text-green-500 mt-0.5 flex-shrink-0">✓</span>
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Differences */}
      {differences.length > 0 && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 space-y-1.5">
          <p className="text-xs font-medium text-amber-400 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            تفاوت‌ها ({differences.length})
          </p>
          <ul className="space-y-1">
            {differences.map((d, i) => (
              <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                <span className="text-amber-500 mt-0.5 flex-shrink-0">△</span>
                {d}
              </li>
            ))}
          </ul>
        </div>
      )}

      {agreements.length === 0 && differences.length === 0 && confirmedFeatures.length > 0 && userText.trim() && (
        <p className="text-xs text-muted-foreground text-center py-2">
          متن تحلیل و ویژگی‌های بصری با یکدیگر مقایسه شدند — هیچ اشتراک صریحی یافت نشد
        </p>
      )}
    </div>
  );
}
