// What naqsha's hooks module keeps in the session's state.

// One line of the progress row above the prompt.
export type NaqshaProgressRow = {
  key: string;
  label: string;
  // Absent while the end isn't known: the bar shows the work running.
  value?: number;
  max?: number;
  valueText: string;
  // What it is: command, tool call, monitor, workflow, agent (counted as
  // running), or build, plan, tasks, context, limit, wakeup, schedule, compaction.
  kind: string;
  // Shown only while Claude is working (the build, the plan, the task list,
  // context and limits); the rest show whenever they run.
  whileWorking?: boolean;
};

// A background command, monitor or workflow still running, kept so a reload of
// the module finds it.
export type NaqshaBackgroundJob = {
  key: string;
  label: string;
  agentId?: string;
  startedAt: number;
  taskId?: string;
  toolUseId?: string;
  output?: string;
  // A monitor: its tool, its time limit (0 when it has none) and the events so far.
  tool?: string;
  timeoutMs?: number;
  events?: number;
  line?: string;
};

// Claude's task list per loop ("main" or an agent's id), and what is scheduled.
export type NaqshaTask = { id: string; subject: string; status: string; activeForm?: string };
export type NaqshaExtras = {
  tasks: Record<string, NaqshaTask[]>;
  // The next ScheduleWakeup: when it was set, when it fires (epoch ms), why.
  wakeup: { setAt: number; at: number; reason: string } | null;
  // CronCreate jobs: their schedule in words and next run (epoch ms).
  crons: { id: string; schedule: string; setAt: number; at: number; recurring: boolean }[];
};

declare module 'claude-code' {
  interface PluginState {
    naqsha: { progress: NaqshaProgressRow[]; background: NaqshaBackgroundJob[]; extras: NaqshaExtras };
  }
}
