import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { analysisService } from "../services/analysisService";
import { strategyService } from "../services/strategyService";
import { AnalysisSession, Strategy } from "../db/database";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { PlusCircle, PlayCircle, Clock, CheckCircle2, XCircle, AlertCircle, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { formatDateFa } from "../lib/i18n";

const STATUS_MAP: Record<string, { label: string; icon: typeof Clock; cls: string }> = {
  'in-progress': { label: 'در حال انجام', icon: Clock, cls: 'text-primary' },
  'completed':   { label: 'تکمیل شده',   icon: CheckCircle2, cls: 'text-emerald-500' },
  'abandoned':   { label: 'رها شده',     icon: XCircle, cls: 'text-muted-foreground' },
};

export default function AnalysisList() {
  const [sessions, setSessions] = useState<AnalysisSession[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sess, strats] = await Promise.all([
        analysisService.getAllSessions(),
        strategyService.getAllStrategies(),
      ]);
      setSessions(sess);
      setStrategies(strats);
    } catch {
      setError('خطا در بارگذاری داده‌ها. لطفاً دوباره تلاش کنید.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const getStrategyName = useCallback((id: string) =>
    strategies.find(s => s.id === id)?.name || 'استراتژی نامشخص',
    [strategies]
  );

  const handleDelete = async (session: AnalysisSession) => {
    if (!window.confirm('این جلسه تحلیل حذف شود؟ این کار قابل بازگشت نیست.')) return;
    await analysisService.deleteSession(session.id);
    setSessions(current => current.filter(item => item.id !== session.id));
  };

  // ── Skeleton Loading ──
  if (loading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // ── Error State ──
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="h-7 w-7 text-destructive" />
        </div>
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={loadData} className="gap-2">
          <RefreshCw className="h-4 w-4" /> تلاش مجدد
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* هدر */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">جلسات تحلیل</h1>
          <p className="text-muted-foreground mt-1">استراتژی خود را گام به گام اجرا کنید.</p>
        </div>
        <Link href="/analysis/new">
          <Button className="gap-2 w-full sm:w-auto">
            <PlusCircle className="h-4 w-4" /> تحلیل جدید
          </Button>
        </Link>
      </div>

      {/* حالت خالی */}
      {sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 sm:p-12 border border-dashed rounded-xl bg-card/30 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <PlayCircle className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-2">هنوز تحلیلی انجام نشده</h3>
          <p className="text-muted-foreground max-w-md mb-6">
            یک جلسه تحلیل شما را قبل از ورود به معامله، گام به گام از طریق چک‌لیست استراتژی راهنمایی می‌کند.
          </p>
          <Link href="/analysis/new">
            <Button>اولین تحلیل را شروع کنید</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {sessions.map(session => {
            const status = STATUS_MAP[session.status] || STATUS_MAP['abandoned'];
            const Icon = status.icon;
            const isActive = session.status === 'in-progress';
            return (
              <Card key={session.id} className="hover:bg-muted/30 transition-colors">
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="mt-0.5 shrink-0">
                      <Icon className={`w-5 h-5 ${status.cls}`} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-base truncate">
                        {session.title || getStrategyName(session.strategyId)}
                      </h3>
                      <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                        <span>{formatDateFa(new Date(session.startedAt).toISOString().split("T")[0])}</span>
                        <Badge variant="outline" className="font-normal text-xs">{status.label}</Badge>
                      </div>
                    </div>
                  </div>
                   <div className="shrink-0 flex items-center gap-1">
                     <Link href={`/analysis/${session.id}`}>
                       <Button variant={isActive ? 'default' : 'secondary'} size="sm">
                         {isActive ? 'ادامه' : 'مشاهده'}
                       </Button>
                     </Link>
                     <Button
                       variant="ghost"
                       size="icon"
                       className="text-muted-foreground hover:text-destructive"
                       onClick={() => void handleDelete(session)}
                       aria-label="حذف جلسه تحلیل"
                     >
                       <Trash2 className="h-4 w-4" />
                     </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
