/** Initiales lisibles d'un nom complet, pour un avatar textuel. */
export function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter((part) => /\p{L}/u.test(part))
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}
