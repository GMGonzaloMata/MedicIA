"use server";

import { redirect } from "next/navigation";

import { clearInvitationCookie } from "../../../_lib/invitation-cookie";

// «Ir al inicio» desde la pantalla de la invitación: la persona ya leyó el resultado (link consumido, invalidado o no
// válido), así que se olvida la invitación pendiente. Se borra acá y no al mostrar el resultado, porque cambiar la
// cookie vuelve a renderizar la pantalla y taparía el mensaje con el genérico.
export async function dismissInvitation(): Promise<never> {
  await clearInvitationCookie();
  redirect("/");
}
