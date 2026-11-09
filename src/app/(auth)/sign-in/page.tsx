import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { FormMessage } from "@/components/form/form-message";
import { getSafeRedirectPath } from "@/shared/utils/safe-redirect";

import { getAccessContext } from "../../_lib/access";
import { SIGN_IN_NOTICES, isSignInNoticeKey } from "../../_lib/auth-messages";
import { SignInForm } from "../_components/sign-in-form";

export const metadata: Metadata = { title: "Ingresar" };

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <>
      <h1 className="text-[28px] font-semibold leading-tight sm:text-4xl">Ingresar</h1>
      {/* Leer los parámetros de la URL ocurre en cada solicitud, así que va dentro de Suspense. */}
      <Suspense fallback={null}>
        <SignInContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function SignInContent({ searchParams }: { searchParams: PageProps<"/sign-in">["searchParams"] }) {
  const params = await searchParams;
  const noticeKey = isSignInNoticeKey(params.notice) ? params.notice : null;
  const next = getSafeRedirectPath(typeof params.next === "string" ? params.next : undefined);

  // Quien ya tiene una sesión vigente no necesita volver a ingresar.
  const context = await getAccessContext();

  if (context.status === "ready") {
    redirect(next);
  }

  if (context.status === "no-clinic") {
    redirect("/select-clinic");
  }

  return (
    <>
      {noticeKey ? <FormMessage tone="success">{SIGN_IN_NOTICES[noticeKey]}</FormMessage> : null}
      <SignInForm next={next} />
    </>
  );
}
