/**
 * VisualFeatureEditor — Prompt 15, Section 10
 * ─────────────────────────────────────────────
 * UI for confirming, rejecting, editing, and adding visual features
 * extracted from a chart screenshot.
 */

import { useState } from 'react';
import {
  VisualFeature,
  FEATURE_LABELS,
  FEATURE_CATEGORIES,
  VisualFeatureCategory,
  ConfidenceLevel,
} from '../types/screenshot';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Check, X, Plus, Edit2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../lib/utils';

function uid() { return crypto.randomUUID(); }

const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  low: 'کم', medium: 'متوسط', high: 'بالا',
};

const CONFIDENCE_COLORS: Record<ConfidenceLevel, string> = {
  low: 'border-orange-500/40 text-orange-400',
  medium: 'border-amber-500/40 text-amber-400',
  high: 'border-green-500/40 text-green-400',
};

const CATEGORY_LABELS: Record<VisualFeatureCategory, string> = {
  'price-action': 'پرایس اکشن',
  'structure': 'ساختار',
  'retracement': 'پولبک',
  'range': 'رفتار رنج',
  'reaction': 'واکنش',
  'fibonacci': 'فیبوناچی',
};

interface Props {
  features: VisualFeature[];
  userAddedFeatures: VisualFeature[];
  onChange: (extracted: VisualFeature[], userAdded: VisualFeature[]) => void;
}

export default function VisualFeatureEditor({ features, userAddedFeatures, onChange }: Props) {
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [addCategory, setAddCategory] = useState<VisualFeatureCategory>('price-action');
  const [addValue, setAddValue] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState('');
  const [editCorrectedValue, setEditCorrectedValue] = useState('');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUserLabel, setEditUserLabel] = useState('');
  const [editUserNotes, setEditUserNotes] = useState('');

  const updateFeature = (id: string, patch: Partial<VisualFeature>) => {
    const updated = features.map(f => f.id === id ? { ...f, ...patch } : f);
    const updatedUser = userAddedFeatures.map(f => f.id === id ? { ...f, ...patch } : f);
    onChange(updated, updatedUser);
  };

  const removeUserAdded = (id: string) => {
    onChange(features, userAddedFeatures.filter(f => f.id !== id));
  };

  const addUserFeature = () => {
    if (!addValue) return;
    const label = FEATURE_LABELS[addValue] ?? addValue;
    const newFeature: VisualFeature = {
      id: uid(),
      category: addCategory,
      label,
      value: addValue,
      confidence: 'high',
      notes: null,
      source: 'user',
      confirmed: true,
      correctedValue: null,
      correctionNote: null,
    };
    onChange(features, [...userAddedFeatures, newFeature]);
    setAddValue('');
    setShowAddPanel(false);
  };

  const startEdit = (f: VisualFeature) => {
    setEditingId(f.id);
    setEditNote(f.correctionNote ?? '');
    setEditCorrectedValue(f.correctedValue ?? f.value);
  };

  const saveEdit = (f: VisualFeature) => {
    updateFeature(f.id, {
      correctedValue: editCorrectedValue !== f.value ? editCorrectedValue : null,
      correctionNote: editNote || null,
    });
    setEditingId(null);
  };

  const startUserEdit = (feature: VisualFeature) => {
    setEditingUserId(feature.id);
    setEditUserLabel(feature.label);
    setEditUserNotes(feature.notes ?? '');
  };

  const saveUserEdit = (feature: VisualFeature) => {
    onChange(features, userAddedFeatures.map(item => item.id === feature.id
      ? { ...item, label: editUserLabel.trim() || item.label, notes: editUserNotes.trim() || null }
      : item
    ));
    setEditingUserId(null);
  };

  const availableFeatures = FEATURE_CATEGORIES.find(c => c.id === addCategory)?.features ?? [];

  const allFeatures = [...features, ...userAddedFeatures];
  const confirmedCount = allFeatures.filter(f => f.confirmed === true).length;
  const rejectedCount = allFeatures.filter(f => f.confirmed === false).length;
  const pendingCount = allFeatures.filter(f => f.confirmed === null).length;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="px-2 py-0.5 bg-green-500/15 text-green-400 rounded-full border border-green-500/30">
          ✓ {confirmedCount} تأیید
        </span>
        <span className="px-2 py-0.5 bg-red-500/15 text-red-400 rounded-full border border-red-500/30">
          ✗ {rejectedCount} رد
        </span>
        {pendingCount > 0 && (
          <span className="px-2 py-0.5 bg-amber-500/15 text-amber-400 rounded-full border border-amber-500/30">
            ⏳ {pendingCount} در انتظار بررسی
          </span>
        )}
      </div>

      {/* AI-suggested features */}
      {features.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">ویژگی‌های پیشنهادی (تأیید یا رد کنید):</p>
          <div className="space-y-2">
            {features.map(f => (
              <div key={f.id} className={cn(
                'rounded-lg border p-3 transition-all',
                f.confirmed === true && 'border-green-500/30 bg-green-500/5',
                f.confirmed === false && 'border-red-500/20 bg-red-500/5 opacity-50',
                f.confirmed === null && 'border-white/10 bg-white/3',
              )}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">
                      {f.correctedValue ? FEATURE_LABELS[f.correctedValue] ?? f.correctedValue : f.label}
                    </span>
                    {f.correctedValue && f.correctedValue !== f.value && (
                      <span className="text-xs text-muted-foreground line-through">{f.label}</span>
                    )}
                    <span className={cn(
                      'text-xs px-1.5 py-0.5 rounded border',
                      CONFIDENCE_COLORS[f.confidence],
                    )}>
                      {CONFIDENCE_LABELS[f.confidence]}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {CATEGORY_LABELS[f.category]}
                    </span>
                    {f.source === 'ai' && (
                      <span className="text-xs text-violet-400">AI</span>
                    )}
                  </div>

                  {/* Actions */}
                  {f.confirmed !== false && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost" size="sm"
                        className={cn('h-6 w-6 p-0', f.confirmed === true && 'text-green-400')}
                        onClick={() => updateFeature(f.id, { confirmed: f.confirmed === true ? null : true })}
                        title="تأیید"
                      >
                        <Check className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400"
                        onClick={() => updateFeature(f.id, { confirmed: false })}
                        title="رد"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-blue-400"
                        onClick={() => editingId === f.id ? setEditingId(null) : startEdit(f)}
                        title="ویرایش"
                      >
                        <Edit2 className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                  {f.confirmed === false && (
                    <Button
                      variant="ghost" size="sm"
                      className="h-6 text-xs text-muted-foreground"
                      onClick={() => updateFeature(f.id, { confirmed: null })}
                    >
                      بازگردانی
                    </Button>
                  )}
                </div>

                {/* Edit panel */}
                {editingId === f.id && (
                  <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">ویژگی صحیح:</p>
                      <Select value={editCorrectedValue} onValueChange={setEditCorrectedValue}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(FEATURE_LABELS).map(([val, label]) => (
                            <SelectItem key={val} value={val} className="text-xs">{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">توضیح تصحیح:</p>
                      <Input
                        value={editNote}
                        onChange={e => setEditNote(e.target.value)}
                        placeholder="مثال: این liquidity sweep بود نه ایمپالس"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs" onClick={() => saveEdit(f)}>ذخیره</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingId(null)}>لغو</Button>
                    </div>
                  </div>
                )}

                {/* Correction note display */}
                {f.correctionNote && editingId !== f.id && (
                  <p className="mt-1 text-xs text-blue-400 italic">"{f.correctionNote}"</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* User-added features */}
      {userAddedFeatures.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">ویژگی‌های اضافه‌شده توسط کاربر:</p>
          <div className="space-y-2">
            {userAddedFeatures.map(f => (
              <div
                key={f.id}
                className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-blue-300">{f.label}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => editingUserId === f.id ? setEditingUserId(null) : startUserEdit(f)} className="text-muted-foreground hover:text-blue-400 transition-colors" aria-label="ویرایش ویژگی">
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button onClick={() => removeUserAdded(f.id)} className="text-muted-foreground hover:text-red-400 transition-colors" aria-label="حذف ویژگی">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                {f.notes && editingUserId !== f.id && <p className="mt-1 text-[11px] text-muted-foreground">{f.notes}</p>}
                {editingUserId === f.id && (
                  <div className="mt-2 space-y-2 border-t border-blue-500/20 pt-2">
                    <Input value={editUserLabel} onChange={e => setEditUserLabel(e.target.value)} className="h-8 text-xs" placeholder="عنوان ویژگی" />
                    <Input value={editUserNotes} onChange={e => setEditUserNotes(e.target.value)} className="h-8 text-xs" placeholder="توضیح مفهومی یا مشاهده شما" />
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs" onClick={() => saveUserEdit(f)}>ذخیره</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingUserId(null)}>لغو</Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add feature panel */}
      <div className="border border-dashed border-white/20 rounded-lg">
        <button
          className="w-full flex items-center justify-between p-3 text-sm text-muted-foreground
                     hover:text-foreground transition-colors"
          onClick={() => setShowAddPanel(v => !v)}
        >
          <span className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            افزودن ویژگی بصری
          </span>
          {showAddPanel ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showAddPanel && (
          <div className="px-3 pb-3 space-y-2 border-t border-white/10">
            <div className="flex gap-2 pt-2">
              <Select value={addCategory} onValueChange={v => { setAddCategory(v as VisualFeatureCategory); setAddValue(''); }}>
                <SelectTrigger className="h-8 text-xs flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEATURE_CATEGORIES.map(c => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={addValue} onValueChange={setAddValue}>
                <SelectTrigger className="h-8 text-xs flex-1">
                  <SelectValue placeholder="ویژگی" />
                </SelectTrigger>
                <SelectContent>
                  {availableFeatures.map(v => (
                    <SelectItem key={v} value={v} className="text-xs">
                      {FEATURE_LABELS[v] ?? v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button size="sm" className="h-7 text-xs w-full" onClick={addUserFeature} disabled={!addValue}>
              افزودن
            </Button>
          </div>
        )}
      </div>

      {allFeatures.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">
          هیچ ویژگی بصری ثبت نشده — از بخش بالا اضافه کنید
        </p>
      )}
    </div>
  );
}
