// Types for progress-read.mjs.
export type Progress = { pct?: number; done?: number; total?: number; unit?: string; stage?: string };
export function readProgress(text: string): Progress | null;
export function checklist(lines: string[]): { got: Progress; at: number } | null;
export function endedTasks(text: string): { taskId: string; toolUseId: string; status: string }[];
export function outputPathOf(text: string | undefined): string;
export function clock(ms: number): string;
export type Sample = { value: number; max: number; at: number };
export function figure(p: Progress | null, elapsedMs: number, pace?: { rate: number; leftMs: number } | null): string;
export function paceOf(first: Sample | null | undefined, value: number, max: number, nowMs: number): { rate: number; leftMs: number } | null;
export function sampleOf(first: Sample | null | undefined, value: number, max: number, nowMs: number): Sample;
export function lastLine(text: string): string;
export function fill(p: Progress | null): { value: number; max: number } | null;
export function shorten(text: unknown, max?: number): string;
export function buildStep(plan: unknown): { title: string; done: number; total: number; step: string } | null;
export function parsePlan(text: unknown): unknown;
