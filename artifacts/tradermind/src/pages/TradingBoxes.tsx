import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { tradingBoxService } from '../services/tradingBoxService';
import { accountService } from '../services/accountService';
import { TradingBox, db } from '../db/database';
import type { Account } from '../db/database';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Plus, Pencil, Trash2, Box, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';

const COLORS = ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#ec4899', '#14b8a6', '#eab308', '#ef4444'];

const emptyForm = {
  name: '',
  accountId: 'none',
  description: '',
  targetTradeCount: '',
  color: '#3b82f6',
  status: 'active' as TradingBox['status'],
  notes: '',
};

export default function TradingBoxes() {
  const [, setLocation] = useLocation();
  const [boxes, setBoxes] = useState<TradingBox[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tradeCounts, setTradeCounts] = useState<Record<string, number>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const load = async () => {
    const all = await tradingBoxService.getAll();
    setBoxes(all);
    const counts: Record<string, number> = {};
    await Promise.all(
      all.map(async b => {
        counts[b.id] = await tradingBoxService.getTradeCount(b.id);
      })
    );
    setTradeCounts(counts);
  };

  useEffect(() => {
    load();
    accountService.getAll().then(setAccounts);
  }, []);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (box: TradingBox) => {
    setEditingId(box.id);
    setForm({
      name: box.name,
      accountId: box.accountId ?? 'none',
      description: box.description ?? '',
      targetTradeCount: box.targetTradeCount?.toString() ?? '',
      color: box.color,
      status: box.status,
      notes: box.notes ?? '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('نام باکس الزامی است');
      return;
    }
    setSaving(true);
    const data = {
      name: form.name.trim(),
      accountId: form.accountId === 'none' ? null : form.accountId,
      description: form.description.trim() || null,
      targetTradeCount: form.targetTradeCount ? parseInt(form.targetTradeCount) : null,
      color: form.color,
      status: form.status,
      notes: form.notes.trim() || null,
    };
    try {
      if (editingId) {
        await tradingBoxService.update(editingId, data);
        toast.success('باکس به‌روز شد');
      } else {
        await tradingBoxService.create(data);
        toast.success('باکس جدید ساخته شد');
      }
      await load();
      setDialogOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await tradingBoxService.delete(id);
    toast.success('باکس حذف شد');
    await load();
    setDeleteConfirm(null);
  };

  const statusLabel: Record<TradingBox['status'], string> = {
    active: 'فعال',
    completed: 'تکمیل‌شده',
    archived: 'بایگانی',
  };
  const statusColor: Record<TradingBox['status'], string> = {
    active: 'bg-emerald-500/15 text-emerald-600',
    completed: 'bg-blue-500/15 text-blue-600',
    archived: 'bg-muted text-muted-foreground',
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">باکس‌های معاملاتی</h1>
          <p className="text-sm text-muted-foreground mt-1">مجموعه‌ای از معاملات را گروه‌بندی و تحلیل کنید</p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="w-4 h-4" /> باکس جدید
        </Button>
      </div>

      {boxes.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
            <Box className="w-10 h-10 opacity-30" />
            <p>هنوز باکسی تعریف نشده</p>
            <p className="text-xs max-w-xs text-center">با باکس‌های معاملاتی می‌توانید گروهی از معاملات را (مثلاً ۲۰۰ معامله آزمایشی) دسته‌بندی و تحلیل کنید</p>
            <Button variant="outline" onClick={openNew} className="gap-2">
              <Plus className="w-4 h-4" /> اولین باکس را بسازید
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {boxes.map(box => {
            const count = tradeCounts[box.id] ?? 0;
            const pct = box.targetTradeCount ? Math.min(100, Math.round((count / box.targetTradeCount) * 100)) : null;
            return (
              <Card key={box.id} className="overflow-hidden">
                <div className="h-1.5" style={{ backgroundColor: box.color }} />
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Box className="w-5 h-5 shrink-0" style={{ color: box.color }} />
                      <div className="min-w-0">
                         <div className="font-semibold truncate">{box.name}</div>
                        {box.description && <div className="text-xs text-muted-foreground truncate">{box.description}</div>}
                         {box.accountId && (
                           <div className="text-[11px] text-primary/80 truncate">
                             حساب: {accounts.find(account => account.id === box.accountId)?.name ?? 'حساب حذف‌شده'}
                           </div>
                         )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge className={`text-xs ${statusColor[box.status]}`}>{statusLabel[box.status]}</Badge>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(box)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteConfirm(box.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-sm">
                    <div className="flex items-center gap-1.5">
                      <BarChart3 className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{count}</span>
                      {box.targetTradeCount && <span className="text-muted-foreground">/ {box.targetTradeCount} معامله</span>}
                    </div>
                    {pct !== null && (
                      <div className="flex-1">
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: box.color }} />
                        </div>
                      </div>
                    )}
                    {pct !== null && <span className="text-xs text-muted-foreground">{pct}%</span>}
                  </div>

                  {count > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-1.5 h-8"
                      onClick={() => setLocation(`/journal/trades?boxId=${box.id}`)}
                    >
                      <BarChart3 className="w-3.5 h-3.5" /> مشاهده معاملات این باکس
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog ساخت/ویرایش */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'ویرایش باکس' : 'باکس جدید'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>نام باکس *</Label>
              <Input placeholder="مثلاً باکس ۱ — آزمون استراتژی FVG" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>توضیح</Label>
              <Textarea placeholder="هدف از این باکس چیست؟" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="min-h-[70px]" />
            </div>
            <div className="space-y-2">
              <Label>حساب اختصاصی</Label>
              <Select value={form.accountId} onValueChange={v => setForm(f => ({ ...f, accountId: v }))}>
                <SelectTrigger><SelectValue placeholder="مشترک بین حساب‌ها" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">مشترک بین حساب‌ها</SelectItem>
                  {accounts.map(account => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">باکس مشترک در معامله‌های همهٔ حساب‌ها قابل انتخاب است.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>هدف تعداد معاملات</Label>
                <Input type="number" placeholder="مثلاً ۲۰۰" value={form.targetTradeCount} onChange={e => setForm(f => ({ ...f, targetTradeCount: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>وضعیت</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as TradingBox['status'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">فعال</SelectItem>
                    <SelectItem value="completed">تکمیل‌شده</SelectItem>
                    <SelectItem value="archived">بایگانی</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>رنگ</Label>
              <div className="flex gap-1.5 flex-wrap">
                {COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setForm(f => ({ ...f, color: c }))}
                    className="w-7 h-7 rounded-full border-2 transition-transform"
                    style={{ backgroundColor: c, borderColor: form.color === c ? 'white' : 'transparent', transform: form.color === c ? 'scale(1.2)' : 'scale(1)' }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>یادداشت</Label>
              <Textarea placeholder="نکات بیشتر درباره این باکس…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="min-h-[60px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>لغو</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'ذخیره…' : 'ذخیره'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
      <Dialog open={!!deleteConfirm} onOpenChange={v => !v && setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>حذف باکس</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">آیا مطمئنید؟ معاملات داخل این باکس پاک نمی‌شوند ولی از این گروه خارج می‌شوند.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>لغو</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>حذف</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
