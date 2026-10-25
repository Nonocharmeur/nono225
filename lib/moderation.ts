const blockedPatterns = [
  /\b(?:kill|murder|massacre|torture|behead|rape|school shooting|bomb making)\b/i,
  /\b(?:tuer|meurtre|massacre|torturer|décapiter|viol|fusillade|fabriquer une bombe)\b/i,
  /\b(?:explicit sex|sexual intercourse|porn(?:ographic)?|nude sex|child porn|bestiality)\b/i,
  /\b(?:sexe explicite|rapport sexuel|pornographie|porno|pédopornographie|bestialité)\b/i
];

export function moderatePrompt(prompt: string): boolean {
  return !blockedPatterns.some((pattern) => pattern.test(prompt));
}
