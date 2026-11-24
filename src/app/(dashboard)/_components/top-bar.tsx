import { Suspense } from "react";

import { getAccessContext } from "../../_lib/access";
import { initialsOf } from "../_lib/initials";
import { describeRelationship } from "../_lib/relationship-labels";
import { ClinicalIcon } from "./clinical-icon";

// Barra superior de las pantallas protegidas: quién ingresó y, en pantallas chicas, en qué clínica. En escritorio la
// clínica activa ya está en la barra lateral. Solo muestra datos de la sesión: nada en vivo ni de otras personas.
export function TopBar() {
  return (
    <div className="clinical-topbar">
      {/* Leer la sesión ocurre en cada solicitud, así que va dentro de Suspense. */}
      <Suspense fallback={null}>
        <TopBarContent />
      </Suspense>
    </div>
  );
}

async function TopBarContent() {
  const context = await getAccessContext();

  if (context.status === "anonymous") {
    return null;
  }

  const { user } = context;
  const clinic = context.status === "ready" ? context.clinic : null;

  return (
    <>
      {clinic ? (
        <p className="clinical-topbar-clinic">
          <ClinicalIcon name="clinic" />
          <span>{clinic.tenantName}</span>
        </p>
      ) : null}
      <div className="clinical-topbar-user">
        <span aria-hidden="true" className="clinical-topbar-avatar">
          {initialsOf(user.fullName)}
        </span>
        <div className="clinical-topbar-identity">
          <p className="clinical-topbar-name">{user.fullName}</p>
          {clinic ? <p className="clinical-topbar-role">{describeRelationship(clinic.relationship)}</p> : null}
        </div>
      </div>
    </>
  );
}
