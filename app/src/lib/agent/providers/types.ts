import type { Step } from "../../session";

export interface TurnResult {
  reply: string;
  steps: Step[];
}
