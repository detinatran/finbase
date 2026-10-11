import { proposeTransfer } from "./pipeline";
import { getSession, type Step } from "./session";
import { getSchedules, saveSchedules } from "./store";

/** Runs schedules due on `date`. Each run goes through the full policy pipeline again. */
export async function runDueSchedules(date = new Date()): Promise<Step[]> {
  const month = date.toISOString().slice(0, 7);
  const schedules = getSchedules();
  const session = getSession("scheduler");
  const steps: Step[] = [];
  for (const s of schedules) {
    if (s.lastRun === month || date.getUTCDate() < s.dayOfMonth) continue;
    const step = await proposeTransfer(session, { token: s.token, to: s.to, amount: s.amount, reason: `scheduled: ${s.reason}` }, "scheduler");
    if (step.decision?.verdict !== "block") s.lastRun = month;
    steps.push(step);
  }
  saveSchedules(schedules);
  return steps;
}
