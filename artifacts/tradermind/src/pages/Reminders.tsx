import { useEffect, useMemo, useState } from 'react';
import { Bell, BellOff, CalendarClock, Plus, Trash2, ShieldCheck, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { reminderService, type Reminder } from '../services/reminderService';

function formatReminderDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('fa-IR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function toDateTimeLocal(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function Reminders() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [scheduledAt, setScheduledAt] = useState(() => toDateTimeLocal(new Date(Date.now() + 60 * 60 * 1000)));
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState<'granted' | 'default' | 'denied' | 'unsupported'>('default');

  const reload = () => setReminders(reminderService.list());
  useEffect(() => {
    reload();
    void reminderService.getPermissionStatus().then(setPermission);
  }, []);

  const activeCount = useMemo(() => reminders.filter(reminder => reminder.enabled && reminder.scheduledAt > Date.now()).length, [reminders]);

  const addReminder = async () => {
    const timestamp = new Date(scheduledAt).getTime();
    if (!title.trim()) { toast.error('عنوان اعلان را وارد کنید'); return; }
    if (!Number.isFinite(timestamp) || timestamp <= Date.now()) { toast.error('تاریخ و ساعت باید در آینده باشد'); return; }
    setBusy(true);
    try {
      const reminder = await reminderService.add({ title: title.trim(), body: body.trim(), scheduledAt: timestamp });
      if (!reminder.enabled) toast.error('مجوز اعلان فعال نیست؛ یادآور ذخیره شد اما اعلان زمان‌بندی نشد');
      else toast.success('یادآور با موفقیت زمان‌بندی شد');
      setTitle('');
      setBody('');
      reload();
    } catch {
      toast.error('زمان‌بندی اعلان انجام نشد');
    } finally {
      setBusy(false);
    }
  };

  const requestNotificationPermission = async () => {
    const granted = await reminderService.requestPermission();
    const status = await reminderService.getPermissionStatus();
    setPermission(status);
    if (granted) {
      await reminderService.initialize();
      toast.success('مجوز اعلان فعال شد');
    } else {
      toast.error('مجوز اعلان فعال نشد؛ تنظیمات اعلان دستگاه را بررسی کنید');
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold"><Bell className="h-7 w-7 text-primary" />یادآورها</h1>
        <p className="mt-1 text-sm text-muted-foreground">برای زمان مشخص، اعلان آفلاین روی دستگاه دریافت کنید.</p>
      </div>

      {permission !== 'granted' && permission !== 'unsupported' && (
        <Card className={permission === 'denied' ? 'border-destructive/40 bg-destructive/5' : 'border-amber-500/40 bg-amber-500/5'}>
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            {permission === 'denied'
              ? <ShieldAlert className="h-5 w-5 shrink-0 text-destructive" />
              : <ShieldCheck className="h-5 w-5 shrink-0 text-amber-500" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {permission === 'denied' ? 'مجوز اعلان رد شده است' : 'مجوز اعلان هنوز فعال نشده است'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {permission === 'denied'
                  ? 'از تنظیمات مرورگر یا دستگاه، اعلان‌های TraderMind را فعال کنید.'
                  : 'برای دریافت هشدار در پس‌زمینه، مجوز اعلان را فعال کنید.'}
              </p>
            </div>
            {permission === 'default' && (
              <Button variant="outline" size="sm" onClick={() => void requestNotificationPermission()}>
                فعال‌سازی اعلان
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" />یادآور جدید</CardTitle>
          <CardDescription>اعلان در تاریخ و ساعت انتخاب‌شده نمایش داده می‌شود.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reminder-title">عنوان اعلان</Label>
            <Input id="reminder-title" value={title} onChange={event => setTitle(event.target.value)} placeholder="مثلاً بررسی ستاپ طلا" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reminder-body">متن اعلان</Label>
            <Textarea id="reminder-body" value={body} onChange={event => setBody(event.target.value)} placeholder="متن توضیحی اعلان را وارد کنید…" rows={3} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reminder-time">تاریخ و ساعت</Label>
            <Input id="reminder-time" type="datetime-local" value={scheduledAt} onChange={event => setScheduledAt(event.target.value)} dir="ltr" />
          </div>
          <Button className="w-full" onClick={() => void addReminder()} disabled={busy}>
            <CalendarClock className="ml-2 h-4 w-4" />زمان‌بندی اعلان
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">اعلان‌های زمان‌بندی‌شده</h2>
        <span className="text-xs text-muted-foreground">{activeCount} فعال</span>
      </div>
      {reminders.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">هنوز یادآوری‌ای ثبت نشده است.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {reminders.map(reminder => (
            <Card key={reminder.id} className={!reminder.enabled ? 'opacity-60' : ''}>
              <CardContent className="flex items-start gap-3 p-4">
                {reminder.enabled ? <Bell className="mt-1 h-5 w-5 shrink-0 text-primary" /> : <BellOff className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{reminder.title}</p>
                  {reminder.body && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{reminder.body}</p>}
                  <p className="mt-2 text-xs text-muted-foreground">{formatReminderDate(reminder.scheduledAt)}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" onClick={() => { void reminderService.setEnabled(reminder.id, !reminder.enabled).then(reload); }} aria-label={reminder.enabled ? 'غیرفعال کردن' : 'فعال کردن'}>
                    {reminder.enabled ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { void reminderService.remove(reminder.id).then(reload); }} aria-label="حذف یادآور">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}