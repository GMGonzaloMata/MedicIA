import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { FormMessage } from "@/components/form/form-message";
import { getSafeRedirectPath } from "@/shared/utils/safe-redirect";

import { getAccessContext } from "../../_lib/access";
import { SIGN_IN_NOTICES, isSignInNoticeKey } from "../../_lib/auth-messages";
import { SignInForm } from "../_components/sign-in-form";
import { EcgPaper } from "./ecg-paper";
import "./sign-in.css";

export const metadata: Metadata = { title: "Ingresar" };

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <section className="medicia-login-page medicia-enter-screen">
      <div className="medicia-login-access">
        <p className="medicia-login-brand">Medic<span>IA</span></p>
        <div className="medicia-login-inner">
          <header className="medicia-login-heading">
            <p className="medicia-login-section-label">Área de trabajo</p>
            <h1 className="medicia-login-title">Ingresar</h1>
            <p className="medicia-login-intro">Usá el correo asociado a tu cuenta.</p>
          </header>
          <Suspense fallback={null}>
            <SignInContent searchParams={searchParams} />
          </Suspense>
        </div>
      </div>
      <aside className="medicia-login-plate" aria-label="Ilustración de electrocardiograma">
        <p className="medicia-login-statement">La práctica clínica,<br /><em>en el centro.</em></p>
        <EcgPaper />
      </aside>
    </section>
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
