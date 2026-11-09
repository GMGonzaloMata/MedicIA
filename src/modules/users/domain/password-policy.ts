// Política de contraseñas al elegir una nueva (specs/002-ingreso-sesion/research.md R13). Debe
// coincidir con la del grupo de usuarios de Cognito: si no, Cognito la rechaza después de consumir
// el código de verificación. Una contraseña existente no se revalida con esta política al ingresar.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

// Ayuda que se muestra junto a los campos de contraseña nueva, antes de enviar el formulario.
export const PASSWORD_POLICY_HINT = `Entre ${PASSWORD_MIN_LENGTH} y ${PASSWORD_MAX_LENGTH} caracteres, con al menos una mayúscula.`;

// Solo cuentan las letras A a Z sin acentos, como las cuenta Cognito.
export function hasUppercaseLetter(password: string): boolean {
  return /[A-Z]/.test(password);
}

export function meetsPasswordPolicy(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH &&
    hasUppercaseLetter(password)
  );
}
