"use server";

import { redirect } from "next/navigation";

import { getUsersModule } from "@/modules/users/composition";

import { clearSessionCookie, readSessionToken } from "../../_lib/session-cookie";

// Cierra la sesión de este navegador. Funciona aunque la sesión ya no sea vigente o no exista:
// siempre borra la cookie y lleva a la pantalla de ingreso.
export async function signOut(): Promise<void> {
  try {
    await getUsersModule().signOut(await readSessionToken());
  } catch (error) {
    // Aun si la base falla, la cookie se borra; se registra solo el nombre del error.
    console.error(`[acceso] error al cerrar sesión: ${error instanceof Error ? error.name : "UnknownError"}`);
  }

  await clearSessionCookie();
  redirect("/sign-in");
}
