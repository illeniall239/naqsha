// What naqsha's hooks module keeps in the session's state.

// One line of the progress row above the prompt.
export type NaqshaProgressRow = {
  key: string;
  label: string;
  // Absent while the end isn't known: the bar shows the work running.
  value?: number;
  max?: number;
  valueText: string;
  // The build's line shows only while Claude is working.
  isBuild?: boolean;
};

// A background command still running, kept so a reload of the module finds it.
export type NaqshaBackgroundJob = {
  key: string;
  label: string;
  agentId?: string;
  startedAt: number;
  taskId?: string;
  toolUseId?: string;
  output?: string;
};

declare module 'claude-code' {
  interface PluginState {
    naqsha: { progress: NaqshaProgressRow[]; background: NaqshaBackgroundJob[] };
  }
}
