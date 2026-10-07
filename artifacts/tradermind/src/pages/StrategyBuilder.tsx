import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { strategyService } from "../services/strategyService";
import { Strategy, Phase, Step, Rule } from "../db/database";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Trash, Settings, Copy, ChevronDown, ChevronRight, GripVertical
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Switch as UISwitch } from "../components/ui/switch";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { useNavigationGuard } from "../navigation/NavigationGuard";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ─── SortablePhaseItem ──────────────────────────────────────────
function SortablePhaseItem({ phase, isActive, onClick }: { phase: Phase; isActive: boolean; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: phase.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className={`flex items-center gap-1 p-2 rounded-md cursor-pointer group transition-colors
        ${isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
    >
      <span {...attributes} {...listeners} className="cursor-grab text-muted-foreground shrink-0" onClick={e => e.stopPropagation()}>
        <GripVertical className="w-3.5 h-3.5" />
      </span>
      <span className="text-sm font-medium truncate flex-1">{phase.name || 'Unnamed Phase'}</span>
    </div>
  );
}

// ─── SortableStepCard ───────────────────────────────────────────
function SortableStepCard({
  step, onUpdate, onDelete, onDuplicate, rules, onAddRule, onUpdateRule, onDeleteRule,
}: {
  step: Step;
  onUpdate: (id: string, data: Partial<Step>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  rules: Rule[];
  onAddRule: (stepId: string) => void;
  onUpdateRule: (id: string, data: Partial<Rule>) => void;
  onDeleteRule: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const [showRules, setShowRules] = useState(false);
  const parseOptions = () => {
    try {
      const parsed = JSON.parse(step.options || '[]');
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  };

  const STEP_TYPE_LABELS: Record<string, string> = {
    checkbox: 'Checkbox (Task)',
    text: 'Short Text',
    textarea: 'Long Text',
    number: 'Number',
    rating: 'Rating (1-5)',
    select: 'Single Choice',
    'multi-select': 'Multiple Choice',
    date: 'Date / Time',
    image: 'Image / Screenshot',
  };

  return (
    <div ref={setNodeRef} style={style} className="border rounded-xl bg-card shadow-sm overflow-hidden">
      <div className="flex gap-3 p-4">
        <div {...attributes} {...listeners} className="cursor-grab text-muted-foreground mt-1 shrink-0">
          <GripVertical className="w-5 h-5" />
        </div>
        <div className="flex-1 space-y-3 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <Input
              value={step.name}
              onChange={e => onUpdate(step.id, { name: e.target.value })}
              className="font-medium flex-1"
              placeholder="Step title"
            />
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => onDuplicate(step.id)} title="Duplicate step">
                <Copy className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-danger" onClick={() => onDelete(step.id)} title="Delete step">
                <Trash className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Input Type</Label>
              <Select value={step.type} onValueChange={(val: any) => onUpdate(step.id, { type: val })}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STEP_TYPE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <UISwitch
                checked={step.required}
                onCheckedChange={c => onUpdate(step.id, { required: c })}
                id={`req-${step.id}`}
              />
              <Label htmlFor={`req-${step.id}`} className="text-sm cursor-pointer">Required</Label>
              {step.required && <Badge variant="secondary" className="bg-danger/10 text-danger border-danger/20 text-xs">Required</Badge>}
            </div>
          </div>

          {(step.type === 'select' || step.type === 'multi-select') && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Options (هر گزینه در یک کادر)</Label>
              <div className="space-y-2">
                {parseOptions().map((option, index) => (
                  <div key={`${step.id}-option-${index}`} className="flex items-center gap-2">
                    <Input
                      value={option}
                      onChange={e => {
                        const options = parseOptions();
                        options[index] = e.target.value;
                        onUpdate(step.id, { options: JSON.stringify(options) });
                      }}
                      placeholder={`Option ${index + 1}`}
                      className="h-8 text-sm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-danger"
                      onClick={() => {
                        const options = parseOptions().filter((_, i) => i !== index);
                        onUpdate(step.id, { options: JSON.stringify(options) });
                      }}
                      aria-label="Remove option"
                    >
                      <Trash className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-dashed"
                  onClick={() => onUpdate(step.id, { options: JSON.stringify([...parseOptions(), '']) })}
                >
                  <Plus className="w-3 h-3 mr-1" /> Add option
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Hint / Instructions</Label>
            <Textarea
              value={step.hint || ''}
              onChange={e => onUpdate(step.id, { hint: e.target.value })}
              placeholder="Optional guidance shown during analysis..."
              className="h-14 text-sm resize-none"
            />
          </div>

          {/* Rules section */}
          <div className="border-t pt-2">
            <button
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-left"
              onClick={() => setShowRules(!showRules)}
            >
              {showRules ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              Rules / Sub-checklist
              {rules.length > 0 && <Badge variant="secondary" className="ml-1 text-xs h-4 px-1">{rules.length}</Badge>}
            </button>

            {showRules && (
              <div className="mt-2 pl-3 border-l-2 border-muted space-y-2">
                {rules.map(rule => (
                  <div key={rule.id} className="rounded-lg border bg-background/50 p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <Input
                        value={rule.title}
                        onChange={e => onUpdateRule(rule.id, { title: e.target.value })}
                        placeholder="Rule title"
                        className="h-8 text-sm flex-1"
                      />
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-danger shrink-0" onClick={() => onDeleteRule(rule.id)} aria-label="Delete rule">
                        <Trash className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
                      <Select value={rule.type} onValueChange={(value: any) => onUpdateRule(rule.id, { type: value })}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="checkbox">Checklist rule</SelectItem>
                          <SelectItem value="conditional">Conditional: اگر… آنگاه…</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-2 h-8">
                        <UISwitch checked={rule.required} onCheckedChange={c => onUpdateRule(rule.id, { required: c })} id={`rule-req-${rule.id}`} />
                        <Label htmlFor={`rule-req-${rule.id}`} className="text-xs text-muted-foreground whitespace-nowrap">Required</Label>
                      </div>
                    </div>
                    {rule.type === 'conditional' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Input
                          value={rule.condition || ''}
                          onChange={e => onUpdateRule(rule.id, { condition: e.target.value })}
                          placeholder="اگر این اتفاق افتاد…"
                          className="h-8 text-sm"
                        />
                        <Input
                          value={rule.action || ''}
                          onChange={e => onUpdateRule(rule.id, { action: e.target.value })}
                          placeholder="آنگاه این کار را انجام بده…"
                          className="h-8 text-sm"
                        />
                      </div>
                    )}
                    <Textarea
                      value={rule.description || ''}
                      onChange={e => onUpdateRule(rule.id, { description: e.target.value })}
                      placeholder="توضیح یا معیار پذیرش این Rule…"
                      className="min-h-16 text-sm resize-y"
                    />
                  </div>
                ))}
                <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={() => onAddRule(step.id)}>
                  <Plus className="w-3 h-3 mr-1" /> Add Rule
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main StrategyBuilder ────────────────────────────────────────
export default function StrategyBuilder() {
  const { id } = useParams<{ id: string }>();
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [activePhaseId, setActivePhaseId] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [rules, setRules] = useState<Record<string, Rule[]>>({}); // stepId -> rules
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const [metaDirty, setMetaDirty] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => { if (id) loadData(); }, [id]);

  const loadData = async () => {
    const s = await strategyService.getStrategyById(id!);
    if (!s) return;
    setStrategy(s);
    setMetaDirty(false);
    const p = await strategyService.getPhasesByStrategyId(s.id);
    setPhases(p);
    if (p.length > 0 && !activePhaseId) setActivePhaseId(p[0].id);
  };

  useEffect(() => {
    if (activePhaseId) loadStepsForPhase(activePhaseId);
    else { setSteps([]); setRules({}); }
  }, [activePhaseId]);

  const loadStepsForPhase = async (phaseId: string) => {
    const s = await strategyService.getStepsByPhaseId(phaseId);
    setSteps(s);
    const r: Record<string, Rule[]> = {};
    for (const step of s) {
      r[step.id] = await strategyService.getRulesByStepId(step.id);
    }
    setRules(r);
  };

  // ── Phase handlers ──
  const handleAddPhase = async () => {
    if (!strategy) return;
    const p = await strategyService.createPhase({
      strategyId: strategy.id,
      name: 'New Phase',
      description: '',
      order: phases.length,
    });
    setPhases([...phases, p]);
    setActivePhaseId(p.id);
    await strategyService.updateStrategy(strategy.id, {});
  };

  const handleUpdatePhase = async (phaseId: string, data: Partial<Phase>) => {
    await strategyService.updatePhase(phaseId, data);
    setPhases(phases.map(p => p.id === phaseId ? { ...p, ...data } : p));
  };

  useNavigationGuard({
    isDirty: Boolean(strategy && metaDirty),
    onSave: async () => {
      if (!strategy) return;
      await strategyService.updateStrategy(strategy.id, {
        name: strategy.name,
        description: strategy.description,
      });
      setMetaDirty(false);
    },
    onDiscard: () => setMetaDirty(false),
  });

  const handleDeletePhase = async (phaseId: string) => {
    if (!confirm('Delete this phase and all its steps and rules?')) return;
    await strategyService.deletePhase(phaseId);
    const newPhases = phases.filter(p => p.id !== phaseId);
    setPhases(newPhases);
    if (activePhaseId === phaseId) setActivePhaseId(newPhases[0]?.id ?? null);
  };

  const handleDuplicatePhase = async (phaseId: string) => {
    const newPhase = await strategyService.duplicatePhase(phaseId);
    const updatedPhases = await strategyService.getPhasesByStrategyId(strategy!.id);
    setPhases(updatedPhases);
    setActivePhaseId(newPhase.id);
    toast.success('Phase duplicated');
  };

  const handlePhaseDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = phases.findIndex(p => p.id === active.id);
    const newIndex = phases.findIndex(p => p.id === over.id);
    const reordered = arrayMove(phases, oldIndex, newIndex).map((p, i) => ({ ...p, order: i }));
    setPhases(reordered);
    await strategyService.reorderPhases(reordered);
  };

  // ── Step handlers ──
  const handleAddStep = async () => {
    if (!activePhaseId) return;
    const s = await strategyService.createStep({
      phaseId: activePhaseId,
      name: 'New Step',
      description: '',
      type: 'checkbox',
      required: true,
      order: steps.length,
      options: '[]',
      hint: '',
    });
    setSteps([...steps, s]);
    setRules({ ...rules, [s.id]: [] });
  };

  const handleUpdateStep = async (stepId: string, data: Partial<Step>) => {
    await strategyService.updateStep(stepId, data);
    setSteps(steps.map(s => s.id === stepId ? { ...s, ...data } : s));
  };

  const handleDeleteStep = async (stepId: string) => {
    if (!confirm('Delete this step and its rules?')) return;
    await strategyService.deleteStep(stepId);
    setSteps(steps.filter(s => s.id !== stepId));
    const newRules = { ...rules };
    delete newRules[stepId];
    setRules(newRules);
  };

  const handleDuplicateStep = async (stepId: string) => {
    const newStep = await strategyService.duplicateStep(stepId);
    const newStepRules = await strategyService.getRulesByStepId(newStep.id);
    setSteps([...steps, newStep]);
    setRules({ ...rules, [newStep.id]: newStepRules });
    toast.success('Step duplicated');
  };

  const handleStepDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = steps.findIndex(s => s.id === active.id);
    const newIndex = steps.findIndex(s => s.id === over.id);
    const reordered = arrayMove(steps, oldIndex, newIndex).map((s, i) => ({ ...s, order: i }));
    setSteps(reordered);
    await strategyService.reorderSteps(reordered);
  };

  // ── Rule handlers ──
  const handleAddRule = async (stepId: string) => {
    const stepRules = rules[stepId] || [];
    const r = await strategyService.createRule({
      stepId,
      title: 'New Rule',
      description: '',
      type: 'checkbox',
      required: true,
      order: stepRules.length,
      options: '[]',
    });
    setRules({ ...rules, [stepId]: [...stepRules, r] });
  };

  const handleUpdateRule = async (ruleId: string, data: Partial<Rule>) => {
    await strategyService.updateRule(ruleId, data);
    const newRules = { ...rules };
    for (const stepId in newRules) {
      newRules[stepId] = newRules[stepId].map(r => r.id === ruleId ? { ...r, ...data } : r);
    }
    setRules(newRules);
  };

  const handleDeleteRule = async (ruleId: string) => {
    await strategyService.deleteRule(ruleId);
    const newRules = { ...rules };
    for (const stepId in newRules) {
      newRules[stepId] = newRules[stepId].filter(r => r.id !== ruleId);
    }
    setRules(newRules);
  };

  if (!strategy) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  const activePhase = phases.find(p => p.id === activePhaseId);

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] animate-in fade-in">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4 mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/strategies">
            <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button>
          </Link>
          {isEditingMeta ? (
            <div className="flex flex-col gap-1.5">
              <Input
                value={strategy.name}
                onChange={e => { setStrategy({ ...strategy, name: e.target.value }); setMetaDirty(true); }}
                onBlur={() => {
                  void strategyService.updateStrategy(strategy.id, { name: strategy.name, description: strategy.description });
                  setMetaDirty(false);
                  setIsEditingMeta(false);
                }}
                className="font-bold text-lg w-72"
                autoFocus
              />
              <Input
                value={strategy.description}
                onChange={e => { setStrategy({ ...strategy, description: e.target.value }); setMetaDirty(true); }}
                onBlur={() => {
                  void strategyService.updateStrategy(strategy.id, { description: strategy.description });
                  setMetaDirty(false);
                }}
                className="text-sm w-72"
                placeholder="Strategy description"
              />
            </div>
          ) : (
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                {strategy.name}
                <Button variant="ghost" size="icon" onClick={() => setIsEditingMeta(true)} className="h-6 w-6 opacity-60 hover:opacity-100">
                  <Settings className="w-3.5 h-3.5" />
                </Button>
              </h1>
              {strategy.description && <p className="text-sm text-muted-foreground">{strategy.description}</p>}
            </div>
          )}
        </div>
        <Link href="/strategies">
          <Button>Done</Button>
        </Link>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left: Phases panel */}
        <div className="w-56 flex flex-col border rounded-xl bg-card/50 overflow-hidden shrink-0">
          <div className="p-3 border-b bg-muted/20 flex justify-between items-center">
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Phases</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleAddPhase} title="Add phase">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {phases.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No phases yet</p>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlePhaseDragEnd}>
                <SortableContext items={phases.map(p => p.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1">
                    {phases.map(p => (
                      <div key={p.id} className="group relative">
                        <SortablePhaseItem
                          phase={p}
                          isActive={activePhaseId === p.id}
                          onClick={() => setActivePhaseId(p.id)}
                        />
                        {activePhaseId === p.id && (
                          <div className="absolute right-1 top-1 hidden group-hover:flex gap-0.5">
                            <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-foreground" onClick={e => { e.stopPropagation(); handleDuplicatePhase(p.id); }} title="Duplicate">
                              <Copy className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-danger" onClick={e => { e.stopPropagation(); handleDeletePhase(p.id); }} title="Delete">
                              <Trash className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>

        {/* Right: Steps panel */}
        <div className="flex-1 flex flex-col border rounded-xl bg-card overflow-hidden">
          {activePhase ? (
            <>
              <div className="p-4 border-b bg-muted/10 shrink-0">
                <div className="flex items-center gap-2">
                  <Input
                    value={activePhase.name}
                    onChange={e => handleUpdatePhase(activePhaseId!, { name: e.target.value })}
                    className="font-semibold text-lg bg-transparent border-transparent focus-visible:border-input focus-visible:bg-background -ml-1"
                    placeholder="Phase Name"
                  />
                </div>
                <Input
                  value={activePhase.description}
                  onChange={e => handleUpdatePhase(activePhaseId!, { description: e.target.value })}
                  className="text-sm text-muted-foreground bg-transparent border-transparent focus-visible:border-input focus-visible:bg-background -ml-1 mt-1 h-7"
                  placeholder="Phase description (optional)"
                />
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleStepDragEnd}>
                  <SortableContext items={steps.map(s => s.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-3">
                      {steps.map(step => (
                        <SortableStepCard
                          key={step.id}
                          step={step}
                          onUpdate={handleUpdateStep}
                          onDelete={handleDeleteStep}
                          onDuplicate={handleDuplicateStep}
                          rules={rules[step.id] || []}
                          onAddRule={handleAddRule}
                          onUpdateRule={handleUpdateRule}
                          onDeleteRule={handleDeleteRule}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>

                <Button
                  variant="outline"
                  className="w-full border-dashed py-6 text-muted-foreground mt-3"
                  onClick={handleAddStep}
                >
                  <Plus className="w-4 h-4 mr-2" /> Add Step
                </Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
              <p>Select or create a phase to edit its steps.</p>
              <Button variant="outline" onClick={handleAddPhase}><Plus className="w-4 h-4 mr-2" /> Add First Phase</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}