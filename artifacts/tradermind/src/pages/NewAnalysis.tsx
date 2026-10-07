import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { strategyService } from "../services/strategyService";
import { analysisService } from "../services/analysisService";
import { Strategy } from "../db/database";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { ArrowRight, PlayCircle } from "lucide-react";
import { toast } from "sonner";

export default function NewAnalysis() {
  const [, setLocation] = useLocation();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    strategyService.getAllStrategies().then(strats => {
      setStrategies(strats.filter(s => s.isActive));
    });
  }, []);

  const handleStart = async (strategyId: string) => {
    try {
      setLoading(true);
      const session = await analysisService.createSession(strategyId);
      setLocation(`/analysis/${session.id}`);
    } catch {
      toast.error('خطا در شروع جلسه تحلیل');
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      {/* هدر */}
      <div className="flex items-center gap-3 border-b pb-4">
        <Link href="/analysis">
          <Button variant="ghost" size="icon" className="shrink-0">
            <ArrowRight className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">تحلیل جدید</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">یک استراتژی را برای اجرا انتخاب کنید</p>
        </div>
      </div>

      {strategies.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-8 text-center gap-4">
            <p className="text-muted-foreground">هنوز استراتژی فعالی ندارید.</p>
            <Link href="/strategies">
              <Button>رفتن به استراتژی‌ها</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {strategies.map(strat => (
            <Card
              key={strat.id}
              className="cursor-pointer hover:border-primary transition-colors card-pressable"
              onClick={() => !loading && handleStart(strat.id)}
            >
              <CardContent className="p-5 flex justify-between items-center gap-4">
                <div className="min-w-0">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    {strat.icon && <span>{strat.icon}</span>}
                    <span className="truncate">{strat.name}</span>
                  </h3>
                  {strat.description && (
                    <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">{strat.description}</p>
                  )}
                </div>
                <div className="shrink-0 text-primary">
                  <PlayCircle className="w-8 h-8 opacity-60" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
