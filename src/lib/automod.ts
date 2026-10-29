/**
 * Jace's auto moderation matching (the same as Jace's and Jace Social's lib/automod.ts):
 * blocked words and phrases as whole words, also through disguises (l33t letters,
 * s.p.a.c.e.d letters, reeepeated letters), a link limit, and blocked usernames inside names.
 */
import type { AutomodRules } from "./jace";

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", "$": "s", "!": "i", "|": "i" };

function normalize(text: string, symbols = true): string {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(symbols ? /[0134578@$!|]/g : /[0134578]/g, (c) => LEET[c] ?? c)
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const squeezeRepeats = (text: string) => text.replace(/(\p{L})\1{2,}/gu, "$1");

function spacedOutRuns(normalizedText: string): string[] {
  const runs: string[] = [];
  let run = "";
  for (const token of normalizedText.split(" ")) {
    if ([...token].length === 1) run += token;
    else { if (run.length > 1) runs.push(run); run = ""; }
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

function matchesTerm(normalizedText: string, runs: string[], term: string): boolean {
  const t = normalize(term);
  if (!t) return false;
  if (` ${normalizedText} `.includes(` ${t} `)) return true;
  if (` ${squeezeRepeats(normalizedText)} `.includes(` ${t} `)) return true;
  const squashed = t.replace(/ /g, "");
  return runs.some((run) => run === squashed || squeezeRepeats(run) === squashed || (run.includes(squashed) && squashed.length >= 4));
}

const countLinks = (text: string) => (text.match(/\bhttps?:\/\/|\bwww\.[^\s]/gi) ?? []).length;

export interface Problem { matched: string; message: string }

/** What's wrong with this text under these rules, or null. */
export function textProblem(rules: AutomodRules, text: string, maxLinks = rules.max_links): Problem | null {
  if (!rules.enabled || !text) return null;
  if (maxLinks > 0 && countLinks(text) > maxLinks) {
    return { matched: `more than ${maxLinks} link${maxLinks === 1 ? "" : "s"}`, message: `That has too many links (at most ${maxLinks}).` };
  }
  if (!rules.blocked_terms.length) return null;
  // Read symbols as letters (b@dword) and also as punctuation (badword!), so neither hides a word.
  for (const normalized of new Set([normalize(text), normalize(text, false)])) {
    const runs = spacedOutRuns(normalized);
    for (const term of rules.blocked_terms) {
      if (matchesTerm(normalized, runs, term)) return { matched: term, message: "That contains words that aren't allowed on Jace Store." };
    }
  }
  return null;
}

/** A name (username, display name, project or collection title): blocked words and blocked usernames. */
export function nameProblem(rules: AutomodRules, name: string): Problem | null {
  if (!rules.enabled || !name) return null;
  const words = textProblem(rules, name.replace(/[_.-]/g, " "), 0);
  if (words) return { matched: words.matched, message: "That name isn't allowed on Jace Store." };
  const squashed = normalize(name.replace(/[_.-]/g, " ")).replace(/ /g, "");
  for (const term of rules.blocked_usernames) {
    const t = normalize(term).replace(/ /g, "");
    if (t && squashed.includes(t)) return { matched: term, message: "That name isn't allowed on Jace Store." };
  }
  return null;
}
