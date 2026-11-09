// La clínica elegida no se puede usar. Es un único error para un vínculo ajeno, inexistente, ya no
// vigente o una sesión que ya no es válida: distinguirlos le diría a quien consulta qué existe (spec FR-022).
export class ClinicUnavailableError extends Error {
  constructor() {
    super("La clínica no está disponible para esta persona.");
    this.name = "ClinicUnavailableError";
  }
}
