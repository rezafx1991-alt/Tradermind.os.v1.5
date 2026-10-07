import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { marketContextService, MarketContextSession } from '../services/marketContextService';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import {
  PlusCircle, Layers, Clock, CheckCircle2, AlertTriangle,
  TrendingUp, TrendingDown, Minus, Trash2, BarChart2, Brain,
} from 'lucide-react';
import { useToast } from '../hooks/use-toast';

const STATUS_CONFIG = {
  draft:     { label: 'پیش‌نویس',       icon: Clock,         cls: 'text-muted-foreground' },
  analyzed:  { label: 'تحلیل شده',     icon: BarChart2,     cls: 'text-blue-400' },
  decided:   { label: 'تصمیم گرفته شد', icon: CheckCircle2,  cls: 'text-green-400' },
  completed: { label: 'تکمیل شده',     icon: CheckCircle2,  cls: 'text-emerald-400' },
};

const SESSION_FA: Record<string, string> = {
  asian: 'آسیا', london: 'لندن', newyork: 'نیویورک', overlap: 'اوورلپ', custom: 'سفارشی',
};

export default function MarketContextList() {
  const [sessions, setSessions] = useState<MarketContextSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    marketContextService.getAll().then(s => { setSessions(s); setLoading(false); });
  }, []);

  const handleNew = async () => {
    const s = await marketContextService.create();
    setLocation(`/market-context/${s.id}`);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    await marketContextService.delete(id);
    setSessions(prev => prev.filter(s => s.id !== id));
    toast({ title: 'جلسه حذف شد' });
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300" dir="rtl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-52" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
        <div className="grid gap-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Layers className="h-7 w-7 text-primary" />
            تحلیل زمینه بازار
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            تحلیل چند تایم‌فریمی با مقایسه تاریخ شخصی
          </p>
        </div>
        <Button onClick={handleNew} className="gap-2 w-full sm:w-auto">
          <PlusCircle className="h-4 w-4" />
          جلسه جدید
        </Button>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'کل جلسات', value: sessions.length, icon: Layers, color: 'text-primary' },
          { label: 'تحلیل شده', value: sessions.filter(s => s.status !== 'draft').length, icon: BarChart2, color: 'text-blue-400' },
          { label: 'تصمیم گرفته', value: sessions.filter(s => s.status === 'decided' || s.status === 'completed').length, icon: CheckCircle2, color: 'text-green-400' },
          { label: 'تکمیل شده', value: sessions.filter(s => s.status === 'completed').length, icon: CheckCircle2, color: 'text-emerald-400' },
        ].map((stat, i) => (
          <Card key={i} className="bg-card/50">
            <CardContent className="p-3 flex items-center gap-2">
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
              <div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-lg font-bold">{stat.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty state */}
      {!loading && sessions.length === 0 && (
        <div className="flex flex-col items-center justify-center p-12 border border-dashed rounded-xl bg-card/30 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Brain className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-2">هنوز تحلیلی ندارید</h3>
          <p className="text-muted-foreground max-w-md mb-6 text-sm">
            یک جلسه تحلیل بازار شروع کنید. نمودارهای چند تایم‌فریم را آپلود کنید،
            تحلیل خود را بنویسید، و سیستم با تاریخچه معاملاتی شما مقایسه می‌کند.
          </p>
          <Button onClick={handleNew} className="gap-2">
            <PlusCircle className="h-4 w-4" />
            اولین جلسه را شروع کنید
          </Button>
        </div>
      )}

      {/* Session list */}
      {sessions.length > 0 && (
        <div className="grid gap-3">
          {sessions.map(session => {
            const statusCfg = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.draft;
            const StatusIcon = statusCfg.icon;
            const biasIcon = session.overallBias === 'bullish'
              ? <TrendingUp className="h-4 w-4 text-green-400" />
              : session.overallBias === 'bearish'
              ? <TrendingDown className="h-4 w-4 text-red-400" />
              : <Minus className="h-4 w-4 text-muted-foreground" />;

            return (
              <Link key={session.id} href={`/market-context/${session.id}`}>
                <Card className="hover:bg-muted/20 transition-colors cursor-pointer border-border/50">
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <StatusIcon className={`w-5 h-5 mt-0.5 shrink-0 ${statusCfg.cls}`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-base">{session.symbol || 'بدون نماد'}</span>
                          {biasIcon}
                          {session.setupType && (
                            <Badge variant="outline" className="text-[10px] h-4 capitalize">
                              {session.setupCustom || session.setupType}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
                          <span>{session.date} · {session.time}</span>
                          <span>{SESSION_FA[session.session] ?? session.session}</span>
                          <Badge variant="outline" className="font-normal text-[10px] h-4">{statusCfg.label}</Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="sm" className="text-xs h-7 px-2">
                        {session.status === 'draft' ? 'ادامه' : 'مشاهده'}
                      </Button>
                      <button
                        onClick={(e) => handleDelete(session.id, e)}
                        className="p-1.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
