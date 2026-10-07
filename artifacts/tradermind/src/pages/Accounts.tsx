import { useState, useEffect } from 'react';
import { accountService } from '../services/accountService';
import { Account } from '../db/database';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Card, CardContent } from '../components/ui/card';
import { Plus, Pencil, Trash2, Wallet, Star, Archive, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'IRR', 'USDT'];
const COLORS = ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#ec4899', '#14b8a6', '#eab308', '#ef4444'];

const emptyForm = {
  name: '',
  broker: '',
  currency: 'USD',
  initialBalance: '',
  currentBalance: '',
  color: '#3b82f6',
  isDefault: false,
  notes: '',
};

export default function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const load = () => accountService.getAll().then(setAccounts);

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (acc: Account) => {
    setEditingId(acc.id);
    setForm({
      name: acc.name,
      broker: acc.broker,
      currency: acc.currency,
      initialBalance: acc.initialBalance?.toString() ?? '',
      currentBalance: acc.currentBalance?.toString() ?? '',
      color: acc.color,
      isDefault: acc.isArchived ? false : acc.isDefault,
      notes: acc.notes ?? '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('نام حساب الزامی است');
      return;
    }
    setSaving(true);
    const data = {
      name: form.name.trim(),
      broker: form.broker.trim(),
      currency: form.currency,
      initialBalance: form.initialBalance ? parseFloat(form.initialBalance) : null,
      currentBalance: form.currentBalance ? parseFloat(form.currentBalance) : null,
      color: form.color,
      isDefault: form.isDefault,
      notes: form.notes.trim() || null,
    };
    try {
      if (editingId) {
        await accountService.update(editingId, data);
        toast.success('حساب به‌روز شد');
      } else {
        await accountService.create(data);
        toast.success('حساب جدید اضافه شد');
      }
      await load();
      setDialogOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await accountService.delete(id);
    toast.success('حساب بایگانی شد؛ معاملات و سشن‌های مرتبط حفظ شدند.');
    await load();
    setDeleteConfirm(null);
  };

  const handleRestore = async (id: string) => {
    await accountService.setArchived(id, false);
    toast.success('حساب دوباره فعال شد.');
    await load();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">حساب‌های معاملاتی</h1>
          <p className="text-sm text-muted-foreground mt-1">معاملات هر حساب را جداگانه ثبت و تحلیل کنید؛ حساب‌های قدیمی را بایگانی کنید تا سابقه باقی بماند.</p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="w-4 h-4" /> حساب جدید
        </Button>
      </div>

      {accounts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
            <Wallet className="w-10 h-10 opacity-30" />
            <p>هنوز حسابی تعریف نشده</p>
            <Button variant="outline" onClick={openNew} className="gap-2">
              <Plus className="w-4 h-4" /> اولین حساب را بسازید
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {accounts.map(acc => (
            <Card key={acc.id} className="overflow-hidden">
              <div className="h-1.5" style={{ backgroundColor: acc.color }} />
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Wallet className="w-5 h-5 shrink-0" style={{ color: acc.color }} />
                    <div className="min-w-0 flex-1" dir="rtl">
                      <div className="font-semibold whitespace-normal break-words leading-6 flex items-center gap-1.5">
                        {acc.name}
                        {acc.isDefault && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />}
                        {acc.isArchived && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">بایگانی</span>}
                      </div>
                      {acc.broker && <div className="text-xs text-muted-foreground whitespace-normal break-words leading-5">{acc.broker}</div>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(acc)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    {acc.isArchived ? (
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="بازیابی حساب" title="بازیابی حساب" onClick={() => void handleRestore(acc.id)}>
                        <RotateCcw className="w-3.5 h-3.5" />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="بایگانی حساب" title="بایگانی حساب" onClick={() => setDeleteConfirm(acc.id)}>
                        <Archive className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">ارز: </span>
                    <span className="font-medium">{acc.currency}</span>
                  </div>
                  {acc.currentBalance != null && (
                    <div>
                      <span className="text-muted-foreground">موجودی: </span>
                      <span className="font-medium">{acc.currentBalance.toLocaleString()}</span>
                    </div>
                  )}
                </div>
                {acc.notes && <p className="text-xs text-muted-foreground line-clamp-2">{acc.notes}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog ساخت/ویرایش */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'ویرایش حساب' : 'حساب جدید'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>نام حساب *</Label>
              <Input placeholder="مثلاً حساب اصلی" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>بروکر</Label>
              <Input placeholder="نام بروکر (اختیاری)" value={form.broker} onChange={e => setForm(f => ({ ...f, broker: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>ارز</Label>
                <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>رنگ</Label>
                <div className="flex gap-1.5 flex-wrap pt-1">
                  {COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setForm(f => ({ ...f, color: c }))}
                      className="w-6 h-6 rounded-full border-2 transition-transform"
                      style={{ backgroundColor: c, borderColor: form.color === c ? 'white' : 'transparent', transform: form.color === c ? 'scale(1.2)' : 'scale(1)' }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>موجودی اولیه</Label>
                <Input type="number" placeholder="0" value={form.initialBalance} onChange={e => setForm(f => ({ ...f, initialBalance: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>موجودی فعلی</Label>
                <Input type="number" placeholder="0" value={form.currentBalance} onChange={e => setForm(f => ({ ...f, currentBalance: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>یادداشت</Label>
              <Textarea placeholder="توضیحات اضافی…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="min-h-[70px]" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" className="rounded" checked={form.isDefault} onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))} />
              <span className="text-sm">حساب پیش‌فرض</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>لغو</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'ذخیره…' : 'ذخیره'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm archive */}
      <Dialog open={!!deleteConfirm} onOpenChange={v => !v && setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>بایگانی حساب</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">حساب از انتخاب‌های جدید پنهان می‌شود؛ معاملات و سشن‌های قبلی بدون تغییر باقی می‌مانند. هر زمان خواستید می‌توانید آن را بازیابی کنید.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>لغو</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>بایگانی</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
