// IRS text is often ALL CAPS; show it in sentence case.
export function readable(line: string) {
  const letters = line.replace(/[^A-Za-z]/g, "");
  const caps = letters.length > 0 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.7;
  return caps ? line.charAt(0) + line.slice(1).toLowerCase() : line;
}

export function titleCase(s: string) {
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}
