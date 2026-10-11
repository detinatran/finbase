import { detectInjection, type InjectionFinding } from "./injection";

// Provenance (taint) tracking. Every piece of text the agent sees is labelled:
//   trusted   — typed by the user in this session
//   untrusted — anything from the outside world (emails, token metadata, memos)
// When the agent proposes a payment, the engine asks where the recipient
// address came from. An LLM can be talked into anything; it cannot fake where
// a string first appeared.

export type Origin = "contact" | "user" | "untrusted" | "unknown";

export interface OriginResult {
  origin: Origin;
  sources: string[];
  injectedSource: boolean;
}

interface Segment {
  source: string;
  text: string;
  findings: InjectionFinding[];
}

export class ProvenanceTracker {
  private trusted: Segment[] = [];
  private untrusted: Segment[] = [];

  addTrusted(source: string, text: string) {
    this.trusted.push({ source, text: text.toLowerCase(), findings: [] });
  }

  /** Returns injection findings so callers can surface them. */
  addUntrusted(source: string, text: string): InjectionFinding[] {
    const findings = detectInjection(text);
    this.untrusted.push({ source, text: text.toLowerCase(), findings });
    return findings;
  }

  get injectionAttempts(): { source: string; findings: InjectionFinding[] }[] {
    return this.untrusted.filter((s) => s.findings.length > 0).map(({ source, findings }) => ({ source, findings }));
  }

  /** Where did this address first come from? */
  originOf(address: string, contactAddresses: string[]): OriginResult {
    const a = address.toLowerCase();
    if (contactAddresses.some((c) => c.toLowerCase() === a)) {
      return { origin: "contact", sources: ["contact book"], injectedSource: false };
    }
    const userHits = this.trusted.filter((s) => s.text.includes(a));
    if (userHits.length) return { origin: "user", sources: userHits.map((s) => s.source), injectedSource: false };
    const extHits = this.untrusted.filter((s) => s.text.includes(a));
    if (extHits.length) {
      return {
        origin: "untrusted",
        sources: extHits.map((s) => s.source),
        injectedSource: extHits.some((s) => s.findings.length > 0),
      };
    }
    return { origin: "unknown", sources: [], injectedSource: false };
  }
}
