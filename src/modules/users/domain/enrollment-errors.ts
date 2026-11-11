export class EnrollmentTenantInactiveError extends Error {
  constructor() {
    super("La clínica no está activa.");
    this.name = "EnrollmentTenantInactiveError";
  }
}
