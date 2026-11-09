// El correo se compara sin distinguir mayúsculas: la base lo guarda en minúsculas y exige que lo esté.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
