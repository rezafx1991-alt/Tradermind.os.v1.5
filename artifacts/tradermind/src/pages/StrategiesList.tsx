import { useEffect, useState, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { strategyService } from "../services/strategyService";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { PlusCircle, MoreVertical, Edit, Trash, Copy, Power, PowerOff } from "lucide-react";
import { Strategy } from "../db/database";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { Badge } from "../components/ui/badge";
import { toast } from "sonner";
import { formatDateFa } from "../lib/i18n";

export default function StrategiesList() {
  const [, setLocation] = useLocation();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);

  const loadStrategies = useCallback(async () => {
    setLoading(true);
    try {
      const data = await strategyService.getAllStrategies();
      setStrategies(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStrategies(); }, [loadStrategies]);

  const handleCreate = async () => {
    try {
      const strat = await strategyService.createStrategy({
        name: 'استراتژی جدید',
        description: 'قوانین استراتژی خود را اینجا بنویسید.',
        icon: null,
        colorTag: '#3b82f6',
        isActive: true,
      });
      toast.success('استراتژی ساخته شد');
      setLocation(`/strategies/${strat.id}`);
    } catch {
      toast.error('خطا در ساخت استراتژی');
    }
  };

  const handleDuplicate = async (strat: Strategy) => {
    try {
      const newStrat = await strategyService.createStrategy({
        name: `${strat.name} (کپی)`,
        description: strat.description,
        icon: strat.icon,
        colorTag: strat.colorTag,
        isActive: false,
      });
      const phases = await strategyService.getPhasesByStrategyId(strat.id);
      for (const p of phases) {
        const newPhase = await strategyService.createPhase({
          strategyId: newStrat.id, name: p.name, description: p.description, order: p.order,
        });
        const steps = await strategyService.getStepsByPhaseId(p.id);
        for (const s of steps) {
          await strategyService.createStep({
            phaseId: newPhase.id, name: s.name, description: s.description,
            type: s.type, required: s.required, order: s.order, options: s.options, hint: s.hint,
          });
        }
      }
      toast.success('استراتژی کپی شد');
      loadStrategies();
    } catch {
      toast.error('خطا در کپی کردن استراتژی');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('آیا از حذف این استراتژی مطمئن هستید؟ جلسات تحلیل قدیمی تحت تأثیر قرار نمی‌گیرند.')) return;
    await strategyService.deleteStrategy(id);
    toast.success('استراتژی حذف شد');
    loadStrategies();
  };

  const handleToggleActive = async (strat: Strategy) => {
    await strategyService.updateStrategy(strat.id, { isActive: !strat.isActive });
    toast.success(`استراتژی ${!strat.isActive ? 'فعال' : 'غیرفعال'} شد`);
    loadStrategies();
  };

  // ── Skeleton Loading ──
  if (loading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-10 w-36" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* هدر */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">استراتژی‌ها</h1>
          <p className="text-muted-foreground mt-1">چک‌لیست‌ها و پلن‌های معاملاتی خود را مدیریت کنید.</p>
        </div>
        <Button onClick={handleCreate} className="gap-2 shrink-0 w-full sm:w-auto">
          <PlusCircle className="h-4 w-4" /> استراتژی جدید
        </Button>
      </div>

      {/* حالت خالی */}
      {strategies.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 sm:p-12 border border-dashed rounded-xl bg-card/30 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <PlusCircle className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-2">هنوز استراتژی‌ای ندارید</h3>
          <p className="text-muted-foreground max-w-md mb-6">
            یک استراتژی به‌عنوان چک‌لیست ساختارمند عمل می‌کند. اولین استراتژی را بسازید تا معاملات منضبط‌تری داشته باشید.
          </p>
          <Button onClick={handleCreate}>اولین استراتژی را بسازید</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {strategies.map(strat => (
            <Card key={strat.id} className={`flex flex-col ${!strat.isActive ? 'opacity-60 grayscale-[0.3]' : ''}`}>
              <CardHeader className="pb-3 flex flex-row items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    {strat.isActive ? (
                      <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">فعال</Badge>
                    ) : (
                      <Badge variant="outline">غیرفعال</Badge>
                    )}
                  </div>
                  <CardTitle className="text-xl flex items-center gap-2 min-w-0">
                    {strat.icon && <span>{strat.icon}</span>}
                    <span className="truncate">{strat.name}</span>
                  </CardTitle>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="-mr-2 -mt-2 shrink-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setLocation(`/strategies/${strat.id}`)}>
                      <Edit className="h-4 w-4 ml-2" /> ویرایش
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDuplicate(strat)}>
                      <Copy className="h-4 w-4 ml-2" /> کپی
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleToggleActive(strat)}>
                      {strat.isActive ? <PowerOff className="h-4 w-4 ml-2" /> : <Power className="h-4 w-4 ml-2" />}
                      {strat.isActive ? 'غیرفعال کردن' : 'فعال کردن'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDelete(strat.id)} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                      <Trash className="h-4 w-4 ml-2" /> حذف
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent className="flex-1">
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {strat.description || 'توضیحی ثبت نشده است.'}
                </p>
              </CardContent>
              <CardFooter className="pt-3 border-t bg-muted/20 text-xs text-muted-foreground flex justify-between gap-2">
                <span>به‌روزرسانی: {formatDateFa(new Date(strat.updatedAt).toISOString().split("T")[0])}</span>
                <Link href={`/strategies/${strat.id}`}>
                  <Button variant="ghost" size="sm" className="h-6 text-xs px-2">ویرایش</Button>
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
