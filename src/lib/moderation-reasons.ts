export const REPORT_REASONS = [
  { id: "malware", label: "Malware or a virus", hint: "The download is harmful or does something it shouldn't" },
  { id: "stolen", label: "Stolen / reuploaded without permission", hint: "Someone else's work posted without credit or permission" },
  { id: "inappropriate", label: "Inappropriate content", hint: "Hateful, sexual, violent or illegal content" },
  { id: "spam", label: "Spam or misleading", hint: "Fake, clickbait, or not what it claims to be" },
  { id: "broken", label: "Broken / doesn't work", hint: "Downloads fail or the content doesn't work at all" },
  { id: "other", label: "Something else", hint: "Tell us below" },
] as const;

export const reasonLabel = (id: string) => REPORT_REASONS.find((r) => r.id === id)?.label ?? id;
