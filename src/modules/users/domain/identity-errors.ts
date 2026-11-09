export type IdentityErrorCode =
  | "INVALID_CREDENTIALS"
  | "INVALID_CODE"
  | "INVALID_PASSWORD"
  | "UNAVAILABLE";

// El código es lo único que sale del proveedor de identidad: no se conserva su mensaje original,
// que podría revelar si un correo tiene cuenta o incluir datos de la persona.
export class IdentityError extends Error {
  readonly code: IdentityErrorCode;

  constructor(code: IdentityErrorCode) {
    super(code);
    this.name = "IdentityError";
    this.code = code;
  }
}

// El correo de una identidad verificada ya pertenece a otra cuenta propia. No debería ocurrir
// si el proveedor exige correos únicos; se trata como una falla de ingreso.
export class AccountConflictError extends Error {
  constructor() {
    super("ACCOUNT_CONFLICT");
    this.name = "AccountConflictError";
  }
}
