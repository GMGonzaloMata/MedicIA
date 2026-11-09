import { secondaryButtonClassName } from "@/components/form/button-styles";

import { signOut } from "../_actions/sign-out";

// Cierra la sesión de este navegador. Es un formulario común: funciona también sin JavaScript.
export function SignOutButton() {
  return (
    <form action={signOut}>
      <button type="submit" className={secondaryButtonClassName}>
        Cerrar sesión
      </button>
    </form>
  );
}
