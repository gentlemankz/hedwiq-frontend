"use client";

import { useState } from "react";
import {
  Clock,
  Plus,
  Trash2,
  Loader2,
  CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SCHEDULE_TYPE_LABELS,
  AGENT_LIMITS,
  type AgentSchedule,
  type AgentScheduleType,
  type CreateAgentScheduleRequest,
} from "@/types/agent";
import { describeSchedule, WEEKDAY_NAMES } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

interface ScheduleConfigProps {
  agentId: string;
  schedules: AgentSchedule[];
  isLoading?: boolean;
  onCreateSchedule: (data: CreateAgentScheduleRequest) => Promise<void>;
  onUpdateSchedule: (scheduleId: string, updates: Partial<AgentSchedule>) => Promise<void>;
  onDeleteSchedule: (scheduleId: string) => Promise<void>;
}

// Days of week for weekly schedules (derived from shared WEEKDAY_NAMES)
const DAYS_OF_WEEK = WEEKDAY_NAMES.map((label, value) => ({ value, label }));

// Common timezones
const TIMEZONES = [
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "Europe/London", label: "London (GMT)" },
  { value: "Europe/Paris", label: "Paris (CET)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Asia/Shanghai", label: "Shanghai (CST)" },
  { value: "Australia/Sydney", label: "Sydney (AEDT)" },
];

// ============================================================================
// Schedule Form Component
// ============================================================================

interface ScheduleFormProps {
  onSubmit: (data: CreateAgentScheduleRequest) => Promise<void>;
  onClose: () => void;
  isSubmitting: boolean;
}

function ScheduleForm({ onSubmit, onClose, isSubmitting }: ScheduleFormProps) {
  const [scheduleType, setScheduleType] = useState<AgentScheduleType>("daily");
  const [scheduledAt, setScheduledAt] = useState("");
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [timezone, setTimezone] = useState("UTC");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const data: CreateAgentScheduleRequest = {
      scheduleType,
      timezone,
    };

    if (scheduleType === "once") {
      data.scheduledAt = scheduledAt;
    } else if (scheduleType === "hourly") {
      data.minute = minute;
    } else if (scheduleType === "daily") {
      data.hour = hour;
      data.minute = minute;
    } else if (scheduleType === "weekly") {
      data.hour = hour;
      data.minute = minute;
      data.dayOfWeek = dayOfWeek;
    } else if (scheduleType === "monthly") {
      data.hour = hour;
      data.minute = minute;
      data.dayOfMonth = dayOfMonth;
    }

    await onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Schedule Type */}
      <div className="space-y-2">
        <Label>Schedule Type</Label>
        <Select value={scheduleType} onValueChange={(v) => setScheduleType(v as AgentScheduleType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SCHEDULE_TYPE_LABELS) as AgentScheduleType[]).map((type) => (
              <SelectItem key={type} value={type}>
                {SCHEDULE_TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Once - DateTime Picker */}
      {scheduleType === "once" && (
        <div className="space-y-2">
          <Label>Date & Time</Label>
          <Input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            required
          />
        </div>
      )}

      {/* Hourly - Minute */}
      {scheduleType === "hourly" && (
        <div className="space-y-2">
          <Label>At minute</Label>
          <Select value={minute.toString()} onValueChange={(v) => setMinute(parseInt(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[0, 15, 30, 45].map((m) => (
                <SelectItem key={m} value={m.toString()}>
                  :{m.toString().padStart(2, "0")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Daily/Weekly/Monthly - Time */}
      {(scheduleType === "daily" || scheduleType === "weekly" || scheduleType === "monthly") && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Hour</Label>
            <Select value={hour.toString()} onValueChange={(v) => setHour(parseInt(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 24 }, (_, i) => (
                  <SelectItem key={i} value={i.toString()}>
                    {i.toString().padStart(2, "0")}:00
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Minute</Label>
            <Select value={minute.toString()} onValueChange={(v) => setMinute(parseInt(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[0, 15, 30, 45].map((m) => (
                  <SelectItem key={m} value={m.toString()}>
                    :{m.toString().padStart(2, "0")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Weekly - Day of Week */}
      {scheduleType === "weekly" && (
        <div className="space-y-2">
          <Label>Day of Week</Label>
          <Select value={dayOfWeek.toString()} onValueChange={(v) => setDayOfWeek(parseInt(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAYS_OF_WEEK.map((day) => (
                <SelectItem key={day.value} value={day.value.toString()}>
                  {day.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Monthly - Day of Month */}
      {scheduleType === "monthly" && (
        <div className="space-y-2">
          <Label>Day of Month</Label>
          <Select value={dayOfMonth.toString()} onValueChange={(v) => setDayOfMonth(parseInt(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 31 }, (_, i) => (
                <SelectItem key={i + 1} value={(i + 1).toString()}>
                  {i + 1}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Timezone */}
      <div className="space-y-2">
        <Label>Timezone</Label>
        <Select value={timezone} onValueChange={setTimezone}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIMEZONES.map((tz) => (
              <SelectItem key={tz.value} value={tz.value}>
                {tz.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Creating...
            </>
          ) : (
            "Create Schedule"
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ============================================================================
// Schedule Item Component
// ============================================================================

interface ScheduleItemProps {
  schedule: AgentSchedule;
  onToggle: (isEnabled: boolean) => Promise<void>;
  onDelete: () => Promise<void>;
}

function ScheduleItem({ schedule, onToggle, onDelete }: ScheduleItemProps) {
  const [isToggling, setIsToggling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleToggle = async (checked: boolean) => {
    setIsToggling(true);
    try {
      await onToggle(checked);
    } finally {
      setIsToggling(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete();
    } finally {
      setIsDeleting(false);
    }
  };

  // Use shared schedule description utility
  const scheduleDescription = describeSchedule(schedule);

  // Format next run time
  const getNextRunDisplay = (): string | null => {
    if (!schedule.nextRunAt) return null;
    const nextRun = new Date(schedule.nextRunAt);
    const now = new Date();
    const diffMs = nextRun.getTime() - now.getTime();

    if (diffMs < 0) return "Overdue";
    if (diffMs < 60000) return "< 1 min";
    if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)} min`;
    if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)} hr`;
    return `${Math.floor(diffMs / 86400000)} days`;
  };

  return (
    <div className="flex items-center justify-between rounded-lg border px-3 py-2.5 group">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Clock className="size-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{scheduleDescription}</span>
            {schedule.isEnabled && schedule.nextRunAt && (
              <Badge variant="outline" className="text-[10px] shrink-0">
                <CalendarClock className="size-3 mr-1" />
                {getNextRunDisplay()}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {schedule.timezone}
            {schedule.lastRunAt && (
              <>
                {" · "}
                Last run: {new Date(schedule.lastRunAt).toLocaleString()}
              </>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Switch
          checked={schedule.isEnabled}
          onCheckedChange={handleToggle}
          disabled={isToggling}
          className="data-[state=checked]:bg-green-500"
        />
        <Button
          variant="ghost"
          size="icon"
          className="size-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
          onClick={handleDelete}
          disabled={isDeleting}
        >
          {isDeleting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Trash2 className="size-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ScheduleConfig({
  agentId: _agentId,
  schedules,
  isLoading,
  onCreateSchedule,
  onUpdateSchedule,
  onDeleteSchedule,
}: ScheduleConfigProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateSchedule = async (data: CreateAgentScheduleRequest) => {
    setIsCreating(true);
    try {
      await onCreateSchedule(data);
      setIsDialogOpen(false);
    } finally {
      setIsCreating(false);
    }
  };

  const canAddMore = schedules.length < AGENT_LIMITS.MAX_SCHEDULES_PER_AGENT;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Schedules</h3>
        {schedules.length > 0 && (
          <Badge variant="secondary" className="text-[10px]">
            {schedules.length}/{AGENT_LIMITS.MAX_SCHEDULES_PER_AGENT}
          </Badge>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {schedules.length > 0 && (
            <div className="space-y-2">
              {schedules.map((schedule) => (
                <ScheduleItem
                  key={schedule.id}
                  schedule={schedule}
                  onToggle={(isEnabled) => onUpdateSchedule(schedule.id, { isEnabled })}
                  onDelete={() => onDeleteSchedule(schedule.id)}
                />
              ))}
            </div>
          )}

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-muted-foreground"
                disabled={!canAddMore}
              >
                <Plus className="size-4 mr-2" />
                {canAddMore
                  ? "Add schedule"
                  : `Maximum ${AGENT_LIMITS.MAX_SCHEDULES_PER_AGENT} schedules reached`}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Schedule</DialogTitle>
                <DialogDescription>
                  Configure when this agent should run automatically.
                </DialogDescription>
              </DialogHeader>
              <ScheduleForm
                onSubmit={handleCreateSchedule}
                onClose={() => setIsDialogOpen(false)}
                isSubmitting={isCreating}
              />
            </DialogContent>
          </Dialog>
        </>
      )}
    </section>
  );
}
