// Heuristic prompt-injection detector for untrusted text (emails, token names,
// memos). It does not need to be perfect: a hit never *authorises* anything, it
// only makes the engine stricter about values that came from that text.

export interface InjectionFinding {
  rule: string;
  excerpt: string;
}

const RULES: { rule: string; re: RegExp }[] = [
  { rule: "override-instructions", re: /\b(ignore|disregard|forget|override)\b[^.]{0,40}\b(previous|prior|above|earlier|all|your)\b[^.]{0,20}\b(instructions?|rules?|prompts?|guidelines?)/i },
  { rule: "role-hijack", re: /\byou are now\b|\b(maintenance|developer|admin|god|debug) mode\b|\bact as (the )?(system|admin)/i },
  { rule: "fake-system-message", re: /\[?\s*(system|assistant|developer)\s*(message|prompt|notice|instruction)?\s*(for|to)?\s*(the )?(ai|assistant|agent|model)?\s*[:\]]|<\/?(system|instructions?)>/i },
  { rule: "conceal-from-user", re: /\b(do not|don't|never)\b[^.]{0,20}\b(tell|inform|notify|mention|show|alert)\b[^.]{0,20}\b(the )?(user|owner|human)/i },
  { rule: "drain-funds", re: /\b(send|transfer|move|withdraw)\b[^.]{0,20}\b(all|entire|every|whole|max(imum)?|full)\b[^.]{0,20}\b(funds?|balance|usdc|money|tokens?|eth)/i },
  { rule: "disable-safety", re: /\b(bypass|disable|turn off|skip|circumvent)\b[^.]{0,25}\b(policy|limits?|security|safety|checks?|approval|guard)/i },
  { rule: "verify-by-sending", re: /\b(verify|validate|activate|unlock|claim)\b[^.]{0,40}\b(by )?(send|transfer)(ing)?\b|\b(send|transfer)\b[^.]{0,60}\bto (verify|validate|activate|unlock|claim)/i },
];

export function detectInjection(text: string): InjectionFinding[] {
  const findings: InjectionFinding[] = [];
  for (const { rule, re } of RULES) {
    const m = re.exec(text);
    if (m) {
      const start = Math.max(0, m.index - 20);
      findings.push({ rule, excerpt: text.slice(start, m.index + m[0].length + 20).trim() });
    }
  }
  return findings;
}
