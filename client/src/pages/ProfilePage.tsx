import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { User, Calendar, Clock, Briefcase, MapPin, Plus, Trash2, Save, Bell, Mail, MessageSquare, Smartphone, Link2, Unlink, Edit, PenLine, Send } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import RichTextEditor from "@/components/RichTextEditor";
import { loadCompanyDetails, loadCustomLogo } from "@/lib/proposalStore";
import { FileText, ClipboardPaste } from "lucide-react";
import { sanitiseSignatureHtml, detectSignatureSource } from "@/lib/signatureHtmlSanitiser";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function nylasRedirectUri() {
  return `${window.location.origin}/api/nylas/callback`;
}

function nylasProviderFromState(state: string | null) {
  if (!state) return undefined;
  try {
    const parsed = JSON.parse(state);
    return typeof parsed.provider === "string" ? parsed.provider : undefined;
  } catch {
    return undefined;
  }
}

type ScheduleBlock = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

export default function ProfilePage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // Calendar connection (Nylas) — available to all users (multi-grant)
  const { data: calendarGrants, refetch: refetchGrants } = trpc.nylas.getMyGrants.useQuery();
  const [isConnectingCalendar, setIsConnectingCalendar] = useState(false);
  const exchangeCode = trpc.nylas.exchangeCode.useMutation();
  const disconnectCalendar = trpc.nylas.disconnect.useMutation();

  // Handle OAuth callback from Nylas
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const error = params.get("error");
    const errorDescription = params.get("error_description");
    const provider = nylasProviderFromState(params.get("state"));

    if (error) {
      // Nylas/provider returned an error during OAuth
      const msg = errorDescription
        ? decodeURIComponent(errorDescription.replace(/\+/g, " "))
        : `Calendar connection failed: ${error}`;
      toast.error(msg, { duration: 10000 });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (code) {
      setIsConnectingCalendar(true);
      const redirectUri = nylasRedirectUri();
      exchangeCode.mutateAsync({ code, redirectUri, provider })
        .then((res) => {
          toast.success(`Calendar connected: ${res.email}`);
          refetchGrants();
        })
        .catch((err) => {
          toast.error(err.message || "Failed to connect calendar");
        })
        .finally(() => setIsConnectingCalendar(false));
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleConnectCalendar = async (provider?: string, loginHint?: string) => {
    setIsConnectingCalendar(true);
    try {
      const redirectUri = nylasRedirectUri();
      const result = await utils.client.nylas.getAuthUrl.query({ redirectUri, provider, loginHint });
      window.location.href = result.url;
    } catch (err: any) {
      toast.error(err.message || "Failed to get calendar auth URL");
      setIsConnectingCalendar(false);
    }
  };

  const handleDisconnectCalendar = async (grantId?: number) => {
    try {
      await disconnectCalendar.mutateAsync(grantId ? { grantId } : undefined);
      toast.success("Calendar disconnected");
      refetchGrants();
    } catch (err: any) {
      toast.error(err.message || "Failed to disconnect calendar");
    }
  };

  // Notification preferences
  const { data: notifPrefs } = trpc.profile.notifications.list.useQuery();
  const updateNotifPref = trpc.profile.notifications.update.useMutation({
    onSuccess: () => utils.profile.notifications.list.invalidate(),
    onError: (err) => toast.error(err.message || "Failed to update preference"),
  });

  // Profile data
  const { data: profile, isLoading: profileLoading } = trpc.profile.getMyProfile.useQuery();
  const updateProfile = trpc.profile.updateMyProfile.useMutation({
    onSuccess: () => {
      toast.success("Profile updated");
      utils.profile.getMyProfile.invalidate();
    },
    onError: (err) => toast.error(err.message || "Update failed"),
  });

  // Schedule data
  const { data: scheduleBlocks } = trpc.profile.schedule.list.useQuery();
  const setSchedule = trpc.profile.schedule.set.useMutation({
    onSuccess: () => {
      toast.success("Schedule saved");
      utils.profile.schedule.list.invalidate();
    },
    onError: (err) => toast.error(err.message || "Save failed"),
  });

  // Time off data
  const { data: timeOffList } = trpc.profile.timeOff.list.useQuery();
  const createTimeOff = trpc.profile.timeOff.create.useMutation({
    onSuccess: () => {
      toast.success("Time off added");
      utils.profile.timeOff.list.invalidate();
      setNewTimeOff({ date: "", endDate: "", reason: "" });
    },
    onError: (err) => toast.error(err.message || "Failed to add"),
  });
  const deleteTimeOff = trpc.profile.timeOff.delete.useMutation({
    onSuccess: () => {
      toast.success("Time off removed");
      utils.profile.timeOff.list.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to remove"),
  });

  // Assignments (construction roles)
  const isConstructionRole = user?.role === "construction_user";
  const { data: assignments } = trpc.profile.myAssignments.useQuery(undefined, {
    enabled: isConstructionRole,
  });

  // Local state
  const [nameEdit, setNameEdit] = useState<string | null>(null);
  const [localSchedule, setLocalSchedule] = useState<ScheduleBlock[] | null>(null);
  const [newTimeOff, setNewTimeOff] = useState({ date: "", endDate: "", reason: "" });

  // Initialize local schedule from server data
  const schedule = localSchedule ?? (scheduleBlocks?.map(b => ({
    dayOfWeek: b.dayOfWeek,
    startTime: b.startTime,
    endTime: b.endTime,
  })) || []);

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-muted border-t-foreground"></div>
      </div>
    );
  }

  const editingName = nameEdit ?? profile?.name ?? "";

  const handleSaveName = () => {
    if (!editingName.trim()) return;
    updateProfile.mutate({ name: editingName.trim() });
    setNameEdit(null);
  };

  const addScheduleBlock = () => {
    setLocalSchedule([...schedule, { dayOfWeek: 1, startTime: "07:00", endTime: "15:30" }]);
  };

  const removeScheduleBlock = (idx: number) => {
    const updated = [...schedule];
    updated.splice(idx, 1);
    setLocalSchedule(updated);
  };

  const updateScheduleBlock = (idx: number, field: keyof ScheduleBlock, value: any) => {
    const updated = [...schedule];
    updated[idx] = { ...updated[idx], [field]: value };
    setLocalSchedule(updated);
  };

  const handleSaveSchedule = () => {
    setSchedule.mutate({ blocks: schedule });
  };

  return (
    <div className="container max-w-4xl py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
          <User className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">My Profile</h1>
          <p className="text-sm text-muted-foreground">Manage your personal details and preferences</p>
        </div>
      </div>

      {/* Personal Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="h-4 w-4" /> Personal Details
          </CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Name</Label>
              <div className="flex gap-2">
                <Input
                  value={editingName}
                  onChange={(e) => setNameEdit(e.target.value)}
                  className="h-9 text-sm"
                />
                <Button
                  size="sm"
                  className="h-9 px-3"
                  onClick={handleSaveName}
                  disabled={updateProfile.isPending || editingName === profile?.name}
                >
                  <Save className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Email</Label>
              <Input value={profile?.email || ""} disabled className="h-9 text-sm bg-muted/50" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Role</Label>
              <div className="pt-1">
                <Badge variant="secondary" className="text-xs">
                  {profile?.role?.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                </Badge>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Last Sign In</Label>
              <p className="text-sm text-muted-foreground pt-1">
                {profile?.lastSignedIn ? new Date(profile.lastSignedIn).toLocaleString() : "—"}
              </p>
            </div>
          </div>

          {/* Linked DA Record */}
          {profile?.linkedDa && (
            <div className="mt-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
              <p className="text-xs font-medium text-blue-700 dark:text-blue-300">
                Linked Design Advisor: <span className="font-semibold">{profile.linkedDa.name}</span> (ID: {profile.linkedDa.id})
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Calendar Connection — available to all users (multi-grant) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="h-4 w-4" /> Calendar Connections
          </CardTitle>
          <CardDescription>Connect your Microsoft or Google calendars to sync appointments and check availability.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {calendarGrants && calendarGrants.length > 0 ? (
            <>
              {calendarGrants.map((grant) => (
                <div key={grant.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                      <Link2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{grant.email || "Unknown"}</p>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                          {grant.provider === "microsoft" ? "Microsoft" : grant.provider === "google" ? "Google" : grant.provider || "Calendar"}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          Connected {new Date(grant.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] gap-1 text-destructive hover:text-destructive"
                    onClick={() => handleDisconnectCalendar(grant.id)}
                    disabled={disconnectCalendar.isPending}
                  >
                    <Unlink className="h-3 w-3" /> Disconnect
                  </Button>
                </div>
              ))}
              <div className="flex gap-2 mt-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={() => handleConnectCalendar("microsoft")}
                  disabled={isConnectingCalendar}
                >
                  <Plus className="h-3 w-3" /> {isConnectingCalendar ? "Connecting..." : "Microsoft"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={() => handleConnectCalendar("google")}
                  disabled={isConnectingCalendar}
                >
                  <Plus className="h-3 w-3" /> {isConnectingCalendar ? "Connecting..." : "Google"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={() => handleConnectCalendar()}
                  disabled={isConnectingCalendar}
                >
                  <Plus className="h-3 w-3" /> Other
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">No calendars connected. Connect to sync appointments automatically.</p>
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={() => handleConnectCalendar("microsoft")}
                  disabled={isConnectingCalendar}
                >
                  <Link2 className="h-3 w-3" /> {isConnectingCalendar ? "Connecting..." : "Connect Microsoft"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1"
                  onClick={() => handleConnectCalendar("google")}
                  disabled={isConnectingCalendar}
                >
                  <Link2 className="h-3 w-3" /> {isConnectingCalendar ? "Connecting..." : "Connect Google"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Availability / Schedule — visible to construction users */}
      {(isConstructionRole || user?.role === "admin" || user?.role === "super_admin") && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-4 w-4" /> Availability Schedule
            </CardTitle>
            <CardDescription>Set your regular working hours. Construction managers will see this when scheduling jobs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {schedule.length === 0 && (
              <p className="text-sm text-muted-foreground italic">No schedule blocks set. Add your regular working hours below.</p>
            )}
            {schedule.map((block, idx) => (
              <div key={idx} className="flex items-center gap-2 flex-wrap">
                <Select
                  value={String(block.dayOfWeek)}
                  onValueChange={(v) => updateScheduleBlock(idx, "dayOfWeek", parseInt(v))}
                >
                  <SelectTrigger className="w-[130px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAY_NAMES.map((name, i) => (
                      <SelectItem key={i} value={String(i)}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="time"
                  value={block.startTime}
                  onChange={(e) => updateScheduleBlock(idx, "startTime", e.target.value)}
                  className="w-[110px] h-8 text-xs"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="time"
                  value={block.endTime}
                  onChange={(e) => updateScheduleBlock(idx, "endTime", e.target.value)}
                  className="w-[110px] h-8 text-xs"
                />
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => removeScheduleBlock(idx)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={addScheduleBlock}>
                <Plus className="h-3 w-3" /> Add Block
              </Button>
              <Button size="sm" className="h-8 text-xs gap-1" onClick={handleSaveSchedule} disabled={setSchedule.isPending}>
                <Save className="h-3 w-3" /> Save Schedule
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Time Off */}
      {(isConstructionRole || user?.role === "admin" || user?.role === "super_admin") && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calendar className="h-4 w-4" /> Time Off
            </CardTitle>
            <CardDescription>Record leave, sick days, or holidays.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Existing time off */}
            {timeOffList && timeOffList.length > 0 && (
              <div className="space-y-2">
                {timeOffList.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between p-2 rounded border bg-muted/30">
                    <div className="text-sm">
                      <span className="font-medium">{entry.date}</span>
                      {entry.endDate && <span className="text-muted-foreground"> → {entry.endDate}</span>}
                      {entry.reason && <span className="text-muted-foreground ml-2">({entry.reason})</span>}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => deleteTimeOff.mutate({ id: entry.id })}
                      disabled={deleteTimeOff.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new time off */}
            <div className="flex items-end gap-2 flex-wrap">
              <div className="space-y-1">
                <Label className="text-[10px]">Start Date</Label>
                <Input
                  type="date"
                  value={newTimeOff.date}
                  onChange={(e) => setNewTimeOff({ ...newTimeOff, date: e.target.value })}
                  className="h-8 text-xs w-[140px]"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">End Date (optional)</Label>
                <Input
                  type="date"
                  value={newTimeOff.endDate}
                  onChange={(e) => setNewTimeOff({ ...newTimeOff, endDate: e.target.value })}
                  className="h-8 text-xs w-[140px]"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Reason</Label>
                <Input
                  value={newTimeOff.reason}
                  onChange={(e) => setNewTimeOff({ ...newTimeOff, reason: e.target.value })}
                  placeholder="e.g. Annual leave"
                  className="h-8 text-xs w-[160px]"
                />
              </div>
              <Button
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={() => {
                  if (!newTimeOff.date) { toast.error("Start date required"); return; }
                  createTimeOff.mutate({
                    date: newTimeOff.date,
                    endDate: newTimeOff.endDate || undefined,
                    reason: newTimeOff.reason || undefined,
                  });
                }}
                disabled={createTimeOff.isPending}
              >
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upcoming Assignments — construction users */}
      {isConstructionRole && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Briefcase className="h-4 w-4" /> My Upcoming Jobs
            </CardTitle>
            <CardDescription>Active construction jobs you're assigned to.</CardDescription>
          </CardHeader>
          <CardContent>
            {!assignments || assignments.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No active assignments found.</p>
            ) : (
              <div className="space-y-2">
                {assignments.map((job) => (
                  <div key={job.jobId} className="flex items-center justify-between p-3 rounded border">
                    <div>
                      <p className="text-sm font-medium">{job.jobNumber} — {job.clientName}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {job.siteAddress || "No address"}
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge variant="outline" className="text-[10px]">{job.status}</Badge>
                      {job.scheduledStart && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Start: {new Date(job.scheduledStart).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {/* ─── Email Signature ─── */}
      <EmailSignatureSection />

      {/* ─── Notification Preferences ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" /> Notification Preferences
          </CardTitle>
          <CardDescription>Choose how you'd like to be notified for each event type.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {/* Header row */}
            <div className="grid grid-cols-[1fr_60px_60px_60px] gap-2 pb-2 border-b text-xs font-medium text-muted-foreground">
              <span>Event</span>
              <span className="text-center flex flex-col items-center gap-0.5"><Mail className="h-3.5 w-3.5" />Email</span>
              <span className="text-center flex flex-col items-center gap-0.5"><MessageSquare className="h-3.5 w-3.5" />SMS</span>
              <span className="text-center flex flex-col items-center gap-0.5"><Smartphone className="h-3.5 w-3.5" />Push</span>
            </div>
            {/* Preference rows */}
            {notifPrefs?.map((pref) => (
              <div key={pref.eventType} className="grid grid-cols-[1fr_60px_60px_60px] gap-2 py-2.5 border-b last:border-0 items-center">
                <div>
                  <p className="text-sm font-medium">{pref.label}</p>
                  <p className="text-xs text-muted-foreground">{pref.description}</p>
                </div>
                <div className="flex justify-center">
                  <Switch
                    checked={pref.channelEmail}
                    onCheckedChange={(checked) => updateNotifPref.mutate({
                      eventType: pref.eventType,
                      channelEmail: checked,
                      channelSms: pref.channelSms,
                      channelPush: pref.channelPush,
                    })}
                  />
                </div>
                <div className="flex justify-center">
                  <Switch
                    checked={pref.channelSms}
                    onCheckedChange={(checked) => updateNotifPref.mutate({
                      eventType: pref.eventType,
                      channelEmail: pref.channelEmail,
                      channelSms: checked,
                      channelPush: pref.channelPush,
                    })}
                  />
                </div>
                <div className="flex justify-center">
                  <Switch
                    checked={pref.channelPush}
                    onCheckedChange={(checked) => updateNotifPref.mutate({
                      eventType: pref.eventType,
                      channelEmail: pref.channelEmail,
                      channelSms: pref.channelSms,
                      channelPush: checked,
                    })}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Signature Template Presets ──────────────────────────────────────────────
function getSignatureTemplates(userName: string | null | undefined) {
  const company = loadCompanyDetails();
  const logo = loadCustomLogo();
  const displayName = userName || "Your Name";
  const companyName = company.companyName || "AltaSpan";
  const phone = company.phone || "1300 000 000";
  const email = company.email || "info@altaspan.com.au";
  const website = company.website || "www.altaspan.com.au";
  const logoImg = logo?.dataUrl
    ? `<img src="${logo.dataUrl}" alt="${companyName}" style="max-width:180px;height:auto;margin-bottom:8px;" /><br/>`
    : "";

  return [
    {
      id: "standard",
      label: "Standard",
      description: "Name, title, phone & email",
      html: `<p><strong>${displayName}</strong><br/>Design Adviser<br/>${companyName}<br/>Ph: ${phone}<br/>Email: ${email}</p>`,
    },
    {
      id: "with-logo",
      label: "With Logo",
      description: "Company logo + contact details",
      html: `<p>${logoImg}<strong>${displayName}</strong><br/>Design Adviser<br/>${companyName}<br/>Ph: ${phone} | ${email}<br/>${website}</p>`,
    },
    {
      id: "minimal",
      label: "Minimal",
      description: "Name and phone only",
      html: `<p><strong>${displayName}</strong> | ${companyName}<br/>Ph: ${phone}</p>`,
    },
    {
      id: "full-branded",
      label: "Full Branded",
      description: "Logo, name, title, all contact info & licences",
      html: `<p>${logoImg}<strong>${displayName}</strong><br/>Design Adviser<br/>${companyName}</p><p>Ph: ${phone}<br/>Email: ${email}<br/>Web: ${website}</p>${company.licenceNSW ? `<p style="font-size:11px;color:#666;">Lic NSW: ${company.licenceNSW}${company.licenceACT ? " | Lic ACT: " + company.licenceACT : ""}</p>` : ""}`,
    },
  ];
}

// ─── Email Signature Section ─────────────────────────────────────────────────
function EmailSignatureSection() {
  const { user } = useAuth();
  const { data: signatures, refetch } = trpc.inbox.signatures.list.useQuery();
  const { data: activeSig } = trpc.inbox.signatures.getDefault.useQuery();
  const createMut = trpc.inbox.signatures.create.useMutation({
    onSuccess: () => { toast.success("Signature created"); refetch(); setDialogOpen(false); resetForm(); },
    onError: (err) => toast.error(err.message),
  });
  const updateMut = trpc.inbox.signatures.update.useMutation({
    onSuccess: () => { toast.success("Signature updated"); refetch(); setDialogOpen(false); },
    onError: (err) => toast.error(err.message),
  });
  const deleteMut = trpc.inbox.signatures.delete.useMutation({
    onSuccess: () => { toast.success("Signature deleted"); refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const sendTestMut = trpc.inbox.signatures.sendTestEmail.useMutation({
    onSuccess: (data) => toast.success(`Test email sent to ${data.sentTo}`),
    onError: (err) => toast.error(err.message),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [schedule, setSchedule] = useState<"always" | "business_hours" | "out_of_office">("always");
  const [showTemplates, setShowTemplates] = useState(false);

  const templates = getSignatureTemplates(user?.name);

  function resetForm() {
    setEditId(null);
    setName("");
    setHtmlContent("");
    setIsDefault(false);
    setSchedule("always");
    setShowTemplates(false);
  }

  function applyTemplate(template: { id: string; label: string; html: string }) {
    setName(template.label + " Signature");
    setHtmlContent(template.html);
    setShowTemplates(false);
    toast.success(`"${template.label}" template applied — customise as needed`);
  }

  function openEdit(sig: any) {
    setEditId(sig.id);
    setName(sig.name);
    setHtmlContent(sig.htmlContent);
    setIsDefault(sig.isDefault);
    setSchedule(sig.schedule || "always");
    setShowTemplates(false);
    setDialogOpen(true);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <PenLine className="h-4 w-4" /> Email Signature
          </CardTitle>
          <CardDescription>Your email signature is automatically appended when you send emails from the inbox.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </CardHeader>
      <CardContent>
        {(!signatures || signatures.length === 0) ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm text-muted-foreground">
              No personal signatures created yet. Add a signature to include in your outbound emails.
            </p>
            {(activeSig as any)?.isCompanyDefault && (
              <div className="border rounded-lg p-4 bg-amber-50 dark:bg-amber-950/20">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-2">Currently using company-wide default signature:</p>
                <p className="text-xs text-muted-foreground mb-1">{activeSig?.name}</p>
                <div className="text-xs border rounded p-2 bg-white dark:bg-background" dangerouslySetInnerHTML={{ __html: activeSig?.htmlContent || "" }} />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {signatures.map((sig: any) => (
              <div key={sig.id} className="p-4 rounded-lg border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{sig.name}</p>
                    {sig.isDefault && <Badge className="text-xs">Default</Badge>}
                    {sig.schedule === "business_hours" && <Badge variant="outline" className="text-xs">Business Hours</Badge>}
                    {sig.schedule === "out_of_office" && <Badge variant="outline" className="text-xs">Out of Office</Badge>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Send test email" onClick={() => sendTestMut.mutate({ signatureId: sig.id })}>
                      <Send className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(sig)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => {
                      if (confirm("Delete this signature?")) deleteMut.mutate({ id: sig.id });
                    }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground border rounded p-2" dangerouslySetInnerHTML={{ __html: sig.htmlContent }} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[600px] max-h-[90dvh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editId ? "Edit Signature" : "Create Signature"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 pr-1 overflow-y-auto flex-1 min-h-0">
            <div>
              <Label>Signature Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Work Signature" />
            </div>
            {/* Template Presets */}
            {!editId && (
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Start from a template</Label>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowTemplates(!showTemplates)}>
                    <FileText className="h-3 w-3 mr-1" /> {showTemplates ? "Hide" : "Show"} Templates
                  </Button>
                </div>
                {showTemplates && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {templates.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => applyTemplate(t)}
                        className="text-left p-3 rounded-lg border hover:border-primary hover:bg-accent/50 transition-colors"
                      >
                        <p className="text-sm font-medium">{t.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div>
              <div className="flex items-center justify-between">
                <Label>Signature Content</Label>
                <ImportSignatureButton onImport={(html) => { setHtmlContent(html); }} />
              </div>
              <div className="border rounded-md mt-1">
                <RichTextEditor
                  content={htmlContent}
                  onChange={setHtmlContent}
                  placeholder="Type your signature here..."
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={isDefault} onCheckedChange={setIsDefault} id="profile-sig-default" />
              <Label htmlFor="profile-sig-default">Set as default signature</Label>
            </div>
            <div>
              <Label>Schedule</Label>
              <select
                value={schedule}
                onChange={(e) => setSchedule(e.target.value as any)}
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="always">Always (use anytime)</option>
                <option value="business_hours">Business Hours Only (Mon-Fri 8am-6pm AEST)</option>
                <option value="out_of_office">Out of Office (evenings & weekends)</option>
              </select>
              <p className="text-xs text-muted-foreground mt-1">The system automatically selects the right signature based on the time of day.</p>
            </div>
          </div>
          <DialogFooter className="flex justify-between sm:justify-between shrink-0 border-t pt-3">
            <Button variant="ghost" size="sm" className="text-xs" disabled={!htmlContent || sendTestMut.isPending} onClick={() => sendTestMut.mutate({ signatureHtml: htmlContent })}>
              <Send className="h-3 w-3 mr-1" /> {sendTestMut.isPending ? "Sending..." : "Send test email"}
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => {
                if (editId) {
                  updateMut.mutate({ id: editId, name, htmlContent, isDefault, schedule });
                } else {
                  createMut.mutate({ name, htmlContent, isDefault, schedule });
                }
              }} disabled={!name || !htmlContent || createMut.isPending || updateMut.isPending}>
                {editId ? "Update" : "Create"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ImportSignatureButton({ onImport }: { onImport: (html: string) => void }) {
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [rawHtml, setRawHtml] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);

  function handlePaste() {
    if (!rawHtml.trim()) {
      toast.error("Please paste your signature HTML first");
      return;
    }
    const cleaned = sanitiseSignatureHtml(rawHtml);
    const detected = detectSignatureSource(rawHtml);
    setPreview(cleaned);
    setSource(detected);
  }

  function handleImport() {
    if (preview) {
      onImport(preview);
      toast.success(`Signature imported and cleaned${source ? ` (detected: ${source})` : ""}`);
      setImportDialogOpen(false);
      setRawHtml("");
      setPreview(null);
      setSource(null);
    }
  }

  async function handleClipboardPaste() {
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        if (item.types.includes("text/html")) {
          const blob = await item.getType("text/html");
          const html = await blob.text();
          setRawHtml(html);
          // Auto-preview
          const cleaned = sanitiseSignatureHtml(html);
          const detected = detectSignatureSource(html);
          setPreview(cleaned);
          setSource(detected);
          toast.success("Pasted from clipboard");
          return;
        }
      }
      // Fallback to plain text
      const text = await navigator.clipboard.readText();
      if (text) {
        setRawHtml(text);
        toast.info("Pasted as plain text — paste HTML for best results");
      }
    } catch {
      toast.error("Could not read clipboard. Please paste manually into the text area below.");
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setImportDialogOpen(true)}>
        <ClipboardPaste className="h-3 w-3 mr-1" /> Import from Outlook/Gmail
      </Button>
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-[650px]">
          <DialogHeader>
            <DialogTitle>Import Signature from Email Client</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Paste your existing email signature HTML below. The system will automatically clean and normalise it,
              removing proprietary Outlook/Gmail markup for consistent rendering.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleClipboardPaste}>
                <ClipboardPaste className="h-4 w-4 mr-1" /> Paste from Clipboard
              </Button>
              {source && (
                <span className="text-xs bg-muted px-2 py-1 rounded-full self-center">
                  Detected: {source}
                </span>
              )}
            </div>
            <div>
              <Label>Raw HTML (paste here)</Label>
              <Textarea
                value={rawHtml}
                onChange={(e) => setRawHtml(e.target.value)}
                placeholder="Paste your signature HTML here..."
                className="font-mono text-xs h-32 mt-1"
              />
            </div>
            {!preview && (
              <Button variant="outline" onClick={handlePaste} disabled={!rawHtml.trim()}>
                Preview Cleaned Signature
              </Button>
            )}
            {preview && (
              <div>
                <Label>Cleaned Preview</Label>
                <div className="border rounded-md p-4 mt-1 bg-white dark:bg-background">
                  <div dangerouslySetInnerHTML={{ __html: preview }} />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  This is how your signature will appear after cleaning. Proprietary styles and unsafe elements have been removed.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setImportDialogOpen(false); setRawHtml(""); setPreview(null); setSource(null); }}>
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={!preview}>
              Import Signature
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
