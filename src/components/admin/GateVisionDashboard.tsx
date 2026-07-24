import { useEffect, useMemo, useState } from 'react';
import { supabase } , SUPABASE_URL } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  DoorOpen,
  Eye,
  LogIn,
  LogOut,
  MapPin,
  Radio,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

type CameraRow = {
  id: string;
  name: string;
  location_kind: string;
  class_key: string | null;
  status: string;
  last_seen_at: string | null;
};

type EventRow = {
  id: string;
  camera_id: string;
  class_key: string | null;
  period_key: string | null;
  subject_type: string;
  subject_id: string | null;
  subject_name: string | null;
  event_type: string;
  zone: string | null;
  meta: any;
  occurred_at: string;
};

type SessionRow = {
  id: string;
  class_key: string;
  period_key: string;
  day_key: string;
  teacher_scheduled: string | null;
  teacher_confirmed: boolean;
  teacher_entered_at: string | null;
  teacher_exited_at: string | null;
  student_count_peak: number;
  students_left_during: number;
  students_left_after: number;
};

const LOCATION_KINDS = ['gate', 'classroom', 'corridor', 'common'];

const eventIcon = (t: string) => {
  switch (t) {
    case 'enter':
      return <LogIn className="w-4 h-4 text-emerald-500" />;
    case 'exit':
      return <LogOut className="w-4 h-4 text-orange-500" />;
    case 'face_confirm':
      return <CheckCircle2 className="w-4 h-4 text-blue-500" />;
    case 'concurrent_exit_alert':
      return <AlertTriangle className="w-4 h-4 text-red-500" />;
    case 'zone_change':
      return <MapPin className="w-4 h-4 text-purple-500" />;
    default:
      return <Eye className="w-4 h-4 text-muted-foreground" />;
  }
};

export default function GateVisionDashboard() {
  const [cameras, setCameras] = useState<CameraRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [newCam, setNewCam] = useState({ name: '', location_kind: 'classroom', class_key: '' });
  const [loading, setLoading] = useState(false);

  const reload = async () => {
    setLoading(true);
    const [c, e, s] = await Promise.all([
      supabase.from('gv_cameras').select('*').order('created_at', { ascending: false }),
      supabase.from('gv_events').select('*').order('occurred_at', { ascending: false }).limit(200),
      supabase
        .from('gv_class_sessions')
        .select('*')
        .eq('day_key', new Date().toISOString().slice(0, 10)),
    ]);
    if (c.data) setCameras(c.data as CameraRow[]);
    if (e.data) setEvents(e.data as EventRow[]);
    if (s.data) setSessions(s.data as SessionRow[]);
    setLoading(false);
  };

  useEffect(() => {
    reload();
    const ch = supabase
      .channel('gv-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gv_events' }, () => reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gv_cameras' }, () => reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gv_class_sessions' }, () => reload())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const addCamera = async () => {
    if (!newCam.name.trim()) return toast.error('Give the camera a name');
    const { error } = await supabase.from('gv_cameras').insert({
      name: newCam.name.trim(),
      location_kind: newCam.location_kind,
      class_key: newCam.class_key.trim() || null,
    });
    if (error) return toast.error(error.message);
    setNewCam({ name: '', location_kind: 'classroom', class_key: '' });
    toast.success('Camera registered');
    reload();
  };

  const deleteCamera = async (id: string) => {
    if (!confirm('Delete this camera and all its events?')) return;
    const { error } = await supabase.from('gv_cameras').delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Deleted');
    reload();
  };

  const alerts = useMemo(
    () => events.filter((e) => e.event_type === 'concurrent_exit_alert').slice(0, 10),
    [events],
  );

  const classGroups = useMemo(() => {
    const g: Record<string, SessionRow[]> = {};
    for (const s of sessions) {
      (g[s.class_key] ??= []).push(s);
    }
    return g;
  }, [sessions]);

  return (
    <div className="space-y-4">
      <Card className="border-blue-200/60 bg-gradient-to-br from-blue-50/60 via-white to-cyan-50/60 dark:from-blue-950/40 dark:via-slate-900 dark:to-cyan-950/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-blue-600" />
            Gate Mode 2.0 — AI Vision Surveillance
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            CCTV-fed person tracking. Face recognition binds identity; short-term
            body tracking keeps identifying people after they turn away. Every
            enter, exit, and seat change is logged and tied to the timetable.
          </p>
        </CardHeader>
      </Card>

      <Tabs defaultValue="live" className="w-full">
        <TabsList className="grid grid-cols-4 w-full max-w-lg">
          <TabsTrigger value="live">Live</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="cameras">Cameras</TabsTrigger>
          <TabsTrigger value="bridge">Bridge</TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="space-y-4 mt-4">
          {alerts.length > 0 && (
            <Card className="border-red-200 bg-red-50/60 dark:bg-red-950/30">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-red-600 text-base">
                  <AlertTriangle className="w-4 h-4" /> Concurrent-exit alerts
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {alerts.map((a) => (
                  <div key={a.id} className="flex justify-between">
                    <span>
                      Class <b>{a.class_key ?? '—'}</b> — {a.meta?.count ?? '?'} exits in{' '}
                      {a.meta?.window_s ?? 60}s
                    </span>
                    <span className="text-muted-foreground">
                      {format(new Date(a.occurred_at), 'HH:mm:ss')}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {Object.entries(classGroups).length === 0 && (
              <Card className="col-span-full">
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No class sessions today yet. Register a classroom camera and
                  connect a bridge worker to start receiving events.
                </CardContent>
              </Card>
            )}
            {Object.entries(classGroups).map(([classKey, rows]) => (
              <Card key={classKey}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>{classKey}</span>
                    <Badge variant={rows.some((r) => r.teacher_confirmed) ? 'default' : 'outline'}>
                      {rows.some((r) => r.teacher_confirmed) ? 'Teacher confirmed' : 'Awaiting teacher'}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {rows.map((r) => (
                    <div key={r.id} className="border rounded-md p-2 bg-background/60">
                      <div className="flex justify-between font-medium">
                        <span>Period {r.period_key}</span>
                        <span className="text-muted-foreground">
                          {r.teacher_scheduled ?? '—'}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-1 text-xs">
                        <span className="flex items-center gap-1">
                          <LogIn className="w-3 h-3" />
                          {r.teacher_entered_at
                            ? format(new Date(r.teacher_entered_at), 'HH:mm')
                            : '—'}
                        </span>
                        <span className="flex items-center gap-1">
                          <LogOut className="w-3 h-3" />
                          {r.teacher_exited_at
                            ? format(new Date(r.teacher_exited_at), 'HH:mm')
                            : '—'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {r.student_count_peak}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Left during class: <b>{r.students_left_during}</b> · after:{' '}
                        <b>{r.students_left_after}</b>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4" /> Recent events
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[70vh] overflow-y-auto divide-y">
                {events.length === 0 && (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    No events yet.
                  </div>
                )}
                {events.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                    {eventIcon(e.event_type)}
                    <span className="w-16 text-xs text-muted-foreground tabular-nums">
                      {format(new Date(e.occurred_at), 'HH:mm:ss')}
                    </span>
                    <span className="flex-1">
                      <b className="capitalize">{e.event_type.replace('_', ' ')}</b>{' '}
                      {e.subject_name && (
                        <span className="text-muted-foreground">— {e.subject_name}</span>
                      )}
                      {e.class_key && (
                        <span className="text-muted-foreground"> · {e.class_key}</span>
                      )}
                      {e.zone && (
                        <span className="text-muted-foreground"> · zone {e.zone}</span>
                      )}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {e.subject_type}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cameras" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Camera className="w-4 h-4" /> Register camera
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-4">
              <div className="md:col-span-1">
                <Label>Name</Label>
                <Input
                  value={newCam.name}
                  onChange={(ev) => setNewCam({ ...newCam, name: ev.target.value })}
                  placeholder="Main Gate"
                />
              </div>
              <div>
                <Label>Location</Label>
                <Select
                  value={newCam.location_kind}
                  onValueChange={(v) => setNewCam({ ...newCam, location_kind: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCATION_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {k}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Class key (optional)</Label>
                <Input
                  value={newCam.class_key}
                  onChange={(ev) => setNewCam({ ...newCam, class_key: ev.target.value })}
                  placeholder="Class-6-A"
                />
              </div>
              <div className="flex items-end">
                <Button onClick={addCamera} disabled={loading} className="w-full">
                  Register
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 md:grid-cols-2">
            {cameras.map((c) => (
              <Card key={c.id}>
                <CardContent className="pt-4 flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Camera className="w-4 h-4 text-blue-600" />
                      <span className="font-semibold">{c.name}</span>
                      <Badge variant={c.status === 'online' ? 'default' : 'outline'}>
                        {c.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {c.location_kind}
                      {c.class_key ? ` · ${c.class_key}` : ''}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Camera ID: <code className="bg-muted px-1 rounded">{c.id}</code>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Last seen:{' '}
                      {c.last_seen_at
                        ? format(new Date(c.last_seen_at), 'HH:mm:ss')
                        : 'never'}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteCamera(c.id)}
                    aria-label="Delete"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="bridge" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <DoorOpen className="w-4 h-4" /> Camera Bridge worker
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                Browsers can't read RTSP directly. Run the reference bridge on an
                always-on machine (mini-PC / NVR) to decode CCTV feeds, run person
                detection + tracking + face recognition locally, and forward
                events here.
              </p>
              <div>
                <div className="font-semibold mb-1">Ingest endpoint</div>
                <code className="block bg-muted p-2 rounded text-xs break-all">
                  POST {SUPABASE_URL}/functions/v1/gv-ingest
                </code>
                <div className="text-xs text-muted-foreground mt-1">
                  Send header <code>x-bridge-secret: &lt;GV_INGEST_SECRET&gt;</code> (stored in
                  Cloud secrets).
                </div>
              </div>
              <div>
                <div className="font-semibold mb-1">Payload shape</div>
                <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">{`{
  "camera_id": "<uuid from Cameras tab>",
  "tracks": [
    { "local_track_id": "t42", "subject_type": "student",
      "subject_id": "STU-101", "subject_name": "Alice",
      "confidence": 0.92, "last_zone": "seat_front" }
  ],
  "events": [
    { "local_track_id": "t42", "event_type": "enter",
      "subject_type": "student", "subject_id": "STU-101",
      "subject_name": "Alice", "class_key": "Class-6-A",
      "period_key": "P2", "zone": "doorway" }
  ]
}`}</pre>
              </div>
              <p className="text-xs text-muted-foreground">
                Full reference implementation (Python + YOLOv8 + ByteTrack +
                face embeddings) ships in the project under{' '}
                <code>bridge/</code>.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
