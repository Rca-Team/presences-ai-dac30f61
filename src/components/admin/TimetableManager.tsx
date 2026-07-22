import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, Trash2, CalendarDays, BookOpen, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ALL_CLASS_SECTIONS, getCategoryLabel } from '@/constants/schoolConfig';
import { parseClassSection } from '@/utils/teacherAccess';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface PeriodTiming {
  period_number: number;
  start_time: string;
  end_time: string;
  is_break: boolean;
  label: string | null;
}

interface Teacher {
  id: string;
  name: string;
}

interface Subject {
  id: string;
  name: string;
  short_name: string | null;
  class: string | null;
  section: string | null;
}

interface TimetableEntry {
  id?: string;
  category: string;
  day_of_week: number;
  period_number: number;
  teacher_id: string;
  teacher_name: string;
  subject_id: string | null;
}

interface DraftSlot {
  teacherId: string;
  subjectId: string;
}

interface ValidationIssue {
  key: string;
  message: string;
}

interface TimetableManagerProps {
  allowedCategories?: string[];
}

const TimetableManager: React.FC<TimetableManagerProps> = ({ allowedCategories }) => {
  const { toast } = useToast();
  const categoryOptions = allowedCategories && allowedCategories.length > 0 ? allowedCategories : ALL_CLASS_SECTIONS;
  const [periods, setPeriods] = useState<PeriodTiming[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [draftSlots, setDraftSlots] = useState<Record<string, DraftSlot>>({});
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>(categoryOptions[0]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const slotKey = (day: number, period: number) => `${day}-${period}`;
  const readableSlot = (day: number, period: number) => `${DAYS[day - 1]} • Period ${period}`;

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [periodRes, teacherRes, subjectRes] = await Promise.all([
        supabase.from('period_timings').select('*').order('period_number'),
        supabase.from('attendance_records')
          .select('id, user_id, device_info, image_url')
          .eq('status', 'registered')
          .eq('category', 'Teacher'),
        supabase.from('subjects').select('*').order('name'),
      ]);

      setPeriods((periodRes.data || []).map((p: any) => ({
        period_number: p.period_number,
        start_time: p.start_time,
        end_time: p.end_time,
        is_break: p.is_break,
        label: p.label,
      })));

      const teacherList = (teacherRes.data || []).map((r: any) => {
        const meta = (r.device_info as any)?.metadata || {};
        return { id: r.user_id || r.id, name: meta.name || 'Unknown Teacher' };
      }).filter((t: Teacher) => t.name !== 'Unknown Teacher');
      setTeachers(teacherList);

      setSubjects((subjectRes.data || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        short_name: s.short_name,
        class: s.class ?? null,
        section: s.section ?? null,
      })));

      const parsed = parseClassSection(selectedCategory);
      let ttData: any[] = [];
      const modernRes = parsed
        ? await supabase.from('timetable').select('*').eq('class', parsed.className).eq('section', parsed.section)
        : { data: [], error: null };

      if (!modernRes?.error && Array.isArray(modernRes?.data) && modernRes.data.length > 0) {
        ttData = modernRes.data;
      } else {
        const legacyRes = await supabase.from('timetable').select('*').eq('category', selectedCategory);
        ttData = legacyRes.data || [];
      }

      const rows = ttData.map((t: any) => ({
        id: t.id,
        category: t.category || selectedCategory,
        day_of_week: t.day_of_week,
        period_number: t.period_number,
        teacher_id: t.teacher_id || t.teacher_record_id,
        teacher_name: t.teacher_name,
        subject_id: t.subject_id,
      })) as TimetableEntry[];

      const nextDraft: Record<string, DraftSlot> = {};
      rows.forEach((row) => {
        if (!row.day_of_week || !row.period_number || !row.teacher_id) return;
        nextDraft[slotKey(row.day_of_week, row.period_number)] = {
          teacherId: row.teacher_id,
          subjectId: row.subject_id || '',
        };
      });
      setDraftSlots(nextDraft);
      setValidationIssues([]);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [selectedCategory]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getSubjectName = (subjectId: string | null) => {
    if (!subjectId) return null;
    const s = subjects.find(s => s.id === subjectId);
    return s ? (s.short_name || s.name) : null;
  };

  const filteredSubjects = useMemo(() => {
    const parsed = parseClassSection(selectedCategory);
    if (!parsed) return subjects;

    const byClass = subjects.filter((s) =>
      s.class === parsed.className && s.section === parsed.section
    );
    if (byClass.length > 0) return byClass;

    return subjects.filter((s) => !s.class && !s.section);
  }, [selectedCategory, subjects]);

  const setTeacherForSlot = (day: number, period: number, teacherId: string) => {
    const key = slotKey(day, period);
    setDraftSlots((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || { teacherId: '', subjectId: '' }),
        teacherId,
      },
    }));
  };

  const setSubjectForSlot = (day: number, period: number, subjectId: string) => {
    const key = slotKey(day, period);
    setDraftSlots((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || { teacherId: '', subjectId: '' }),
        subjectId,
      },
    }));
  };

  const removeSlot = (day: number, period: number) => {
    const key = slotKey(day, period);
    setDraftSlots((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const validateDraft = () => {
    const issues: ValidationIssue[] = [];

    if (periods.filter((p) => !p.is_break).length === 0) {
      issues.push({ key: 'periods', message: 'No working periods found. Please set period timings before saving.' });
    }

    const hasSelectedTeacher = Object.values(draftSlots).some((slot) => slot.teacherId);
    if (!hasSelectedTeacher) {
      issues.push({ key: 'empty', message: 'Please assign at least one timetable slot before saving.' });
    }

    Object.entries(draftSlots).forEach(([key, value]) => {
      const [day, period] = key.split('-').map(Number);
      if (value.teacherId && !value.subjectId) {
        issues.push({
          key: `subject-${key}`,
          message: `${readableSlot(day, period)}: subject is required when a teacher is selected.`,
        });
      }
      if (!value.teacherId && value.subjectId) {
        issues.push({
          key: `teacher-${key}`,
          message: `${readableSlot(day, period)}: teacher is required when a subject is selected.`,
        });
      }
    });

    setValidationIssues(issues);
    return issues;
  };

  const buildRowsToSave = () => {
    return Object.entries(draftSlots)
      .map(([key, value]) => {
        const [day, period] = key.split('-').map(Number);
        const teacher = teachers.find((t) => t.id === value.teacherId);
        if (!teacher || !value.subjectId) return null;

        return {
          category: selectedCategory,
          day_of_week: day,
          period_number: period,
          teacher_id: teacher.id,
          teacher_name: teacher.name,
          subject_id: value.subjectId,
        } as TimetableEntry;
      })
      .filter((row): row is TimetableEntry => Boolean(row));
  };

  const saveTimetable = async () => {
    const issues = validateDraft();
    if (issues.length > 0) {
      toast({
        title: 'Validation failed',
        description: `Please fix ${issues.length} issue${issues.length > 1 ? 's' : ''} before saving.`,
        variant: 'destructive',
      });
      return;
    }

    const rowsToSave = buildRowsToSave();
    setIsSaving(true);
    try {
      const parsed = parseClassSection(selectedCategory);
      if (parsed) {
        const modernDelete = await supabase
          .from('timetable')
          .delete()
          .eq('class', parsed.className)
          .eq('section', parsed.section);
        if (modernDelete.error) {
          await supabase.from('timetable').delete().eq('category', selectedCategory);
        }
      } else {
        await supabase.from('timetable').delete().eq('category', selectedCategory);
      }

      if (rowsToSave.length > 0) {
        const rowsModern = rowsToSave.map(t => ({
          class: parsed?.className || null,
          section: parsed?.section || null,
          day_of_week: t.day_of_week,
          period_number: t.period_number,
          teacher_id: t.teacher_id,
          teacher_name: t.teacher_name,
          subject_id: t.subject_id,
          metadata: {
            category: selectedCategory,
            class: parsed?.className || null,
            section: parsed?.section || null,
            teacher_record_id: t.teacher_id,
            teacher_name: t.teacher_name,
            subject_id: t.subject_id,
          },
        }));
        const modernInsert = await supabase.from('timetable').insert(rowsModern);
        if (modernInsert.error) {
          const rowsLegacy = rowsToSave.map(t => ({
            category: selectedCategory,
            day_of_week: t.day_of_week,
            period_number: t.period_number,
            teacher_record_id: t.teacher_id,
            teacher_name: t.teacher_name,
            subject_id: t.subject_id,
          }));
          const legacyInsert = await supabase.from('timetable').insert(rowsLegacy);
          if (legacyInsert.error) throw legacyInsert.error;
        }
      }

      toast({ title: 'Saved', description: `Timetable for ${getCategoryLabel(selectedCategory)} saved.` });
      fetchData();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to save', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-5 w-5 text-primary" />
            Timetable Manager
          </CardTitle>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map(cat => (
                  <SelectItem key={cat} value={cat}>{getCategoryLabel(cat)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={saveTimetable} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              Save
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Badge variant="outline">
            Class: {getCategoryLabel(selectedCategory)}
          </Badge>
          <Badge variant="secondary">
            Filled slots: {Object.values(draftSlots).filter((slot) => slot.teacherId && slot.subjectId).length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : teachers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No teachers registered. Register teachers with category "Teacher" first.</p>
          </div>
        ) : periods.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No period timings found. Please configure periods before editing timetable.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {validationIssues.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-destructive">Fix these issues before saving</p>
                    <ul className="list-disc pl-4 space-y-1">
                      {validationIssues.slice(0, 8).map((issue) => (
                        <li key={issue.key} className="text-xs text-destructive">{issue.message}</li>
                      ))}
                      {validationIssues.length > 8 && (
                        <li className="text-xs text-destructive">+{validationIssues.length - 8} more issue(s)</li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="border border-border bg-muted p-2 text-left text-xs font-semibold min-w-[110px]">Period</th>
                    {DAYS.map(day => (
                      <th key={day} className="border border-border bg-muted p-2 text-center text-xs font-semibold min-w-[190px]">
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {periods.map(period => (
                    <tr key={period.period_number}>
                      <td className={`border border-border p-2 ${period.is_break ? 'bg-amber-500/10' : ''}`}>
                        <div className="text-xs font-medium">{period.label || `Period ${period.period_number}`}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {period.start_time?.slice(0, 5)} - {period.end_time?.slice(0, 5)}
                        </div>
                      </td>
                      {DAYS.map((_, dayIndex) => {
                        if (period.is_break) {
                          return (
                            <td key={dayIndex} className="border border-border p-2 bg-amber-500/10 text-center">
                              <span className="text-xs text-muted-foreground italic">Break</span>
                            </td>
                          );
                        }

                        const key = slotKey(dayIndex + 1, period.period_number);
                        const slot = draftSlots[key] || { teacherId: '', subjectId: '' };
                        const subjectLabel = getSubjectName(slot.subjectId || null);

                        return (
                          <td key={dayIndex} className="border border-border p-1 align-top">
                            <div className="space-y-1">
                              <Select
                                value={slot.teacherId}
                                onValueChange={(val) => setTeacherForSlot(dayIndex + 1, period.period_number, val)}
                              >
                                <SelectTrigger className="h-7 text-[10px] border-dashed">
                                  <SelectValue placeholder="Teacher" />
                                </SelectTrigger>
                                <SelectContent>
                                  {teachers.map(t => (
                                    <SelectItem key={t.id} value={t.id} className="text-xs">
                                      {t.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>

                              <Select
                                value={slot.subjectId}
                                onValueChange={(val) => setSubjectForSlot(dayIndex + 1, period.period_number, val)}
                              >
                                <SelectTrigger className="h-7 text-[10px] border-dashed">
                                  <SelectValue placeholder="Subject" />
                                </SelectTrigger>
                                <SelectContent>
                                  {filteredSubjects.map(s => (
                                    <SelectItem key={s.id} value={s.id} className="text-xs">
                                      <BookOpen className="w-3 h-3 inline mr-1" />{s.short_name || s.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>

                              <div className="flex items-center justify-between gap-1 min-h-[18px]">
                                {slot.teacherId && subjectLabel ? (
                                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5 truncate max-w-[130px]">
                                    {subjectLabel}
                                  </Badge>
                                ) : (
                                  <span className="text-[9px] text-muted-foreground">Not set</span>
                                )}
                                {(slot.teacherId || slot.subjectId) && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 shrink-0"
                                    onClick={() => removeSlot(dayIndex + 1, period.period_number)}
                                  >
                                    <Trash2 className="w-3 h-3 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TimetableManager;
