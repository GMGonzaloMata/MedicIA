import "server-only";

import { createAcceptStaffInvitation } from "./application/use-cases/accept-staff-invitation";
import { createAssignPatient } from "./application/use-cases/assign-patient";
import { createDeactivateMember } from "./application/use-cases/deactivate-member";
import { createEndAssignment } from "./application/use-cases/end-assignment";
import { createGetAttendingDoctorAvailability } from "./application/use-cases/get-attending-doctor-availability";
import { createInviteStaff } from "./application/use-cases/invite-staff";
import { createLinkPatientAccount } from "./application/use-cases/link-patient-account";
import { createListClinicPatients } from "./application/use-cases/list-clinic-patients";
import { createListStaff } from "./application/use-cases/list-staff";
import { createReactivateMember } from "./application/use-cases/reactivate-member";
import { createRegeneratePatientLinkCode } from "./application/use-cases/regenerate-patient-link-code";
import { createRegisterPatient } from "./application/use-cases/register-patient";
import { createResendInvitation } from "./application/use-cases/resend-invitation";
import { createRevokeInvitation } from "./application/use-cases/revoke-invitation";
import { createInvitationMailer } from "./infrastructure/adapters/create-invitation-mailer";
import { nodeSecretGenerator } from "./infrastructure/adapters/node-secret-generator";
import { prismaAssignmentRepository } from "./infrastructure/repositories/prisma-assignment-repository";
import { prismaInvitationRepository } from "./infrastructure/repositories/prisma-invitation-repository";
import { prismaLinkAttemptRepository } from "./infrastructure/repositories/prisma-link-attempt-repository";
import { prismaPatientRegistryRepository } from "./infrastructure/repositories/prisma-patient-registry-repository";
import { prismaStaffRepository } from "./infrastructure/repositories/prisma-staff-repository";

const APP_BASE_URL_VARIABLE = "APP_BASE_URL";

// Origen público con el que se arman los enlaces de los correos. Sin él no hay forma de armar un enlace válido.
function readAppBaseUrl(env: Record<string, string | undefined>): string {
  const value = env[APP_BASE_URL_VARIABLE];

  if (!value) {
    throw new Error(`Falta la variable de entorno ${APP_BASE_URL_VARIABLE}.`);
  }

  return value;
}

// Casos de uso del módulo de administración de la clínica. Cada historia agrega los suyos.
function buildTenantsModule() {
  const now = () => new Date();
  const secrets = nodeSecretGenerator;
  const staff = prismaStaffRepository;
  const invitations = prismaInvitationRepository;
  const patients = prismaPatientRegistryRepository;
  const assignments = prismaAssignmentRepository;
  // El correo y el origen de los enlaces solo hacen falta al invitar. Se arman recién en el primer uso, para que
  // el resto de los casos de uso (vincular, asignar, listar, desactivar, consultar la disponibilidad) no dependan de
  // la configuración del correo: si falta, falla invitar y nada más.
  let inviteStaffUseCase: ReturnType<typeof createInviteStaff> | undefined;
  const inviteStaff: ReturnType<typeof createInviteStaff> = (input) => {
    inviteStaffUseCase ??= createInviteStaff({
      staff,
      invitations,
      mailer: createInvitationMailer(process.env),
      secrets,
      now,
      appBaseUrl: readAppBaseUrl(process.env),
    });

    return inviteStaffUseCase(input);
  };

  return {
    inviteStaff,
    listStaff: createListStaff({ staff, invitations, now }),
    revokeInvitation: createRevokeInvitation({ invitations, now }),
    resendInvitation: createResendInvitation({ invitations, inviteStaff }),
    acceptStaffInvitation: createAcceptStaffInvitation({ invitations, secrets, now }),
    registerPatient: createRegisterPatient({ patients, staff, secrets, now }),
    listClinicPatients: createListClinicPatients({ patients, now }),
    regeneratePatientLinkCode: createRegeneratePatientLinkCode({ patients, secrets, now }),
    assignPatient: createAssignPatient({ assignments }),
    endAssignment: createEndAssignment({ assignments, now }),
    deactivateMember: createDeactivateMember({ staff, now }),
    reactivateMember: createReactivateMember({ staff }),
    getAttendingDoctorAvailability: createGetAttendingDoctorAvailability({ assignments }),
    linkPatientAccount: createLinkPatientAccount({ patients, attempts: prismaLinkAttemptRepository, secrets, now }),
  };
}

type TenantsModule = ReturnType<typeof buildTenantsModule>;

// El módulo se arma la primera vez que se usa, no al importar el archivo, para que `next build` no falle si
// faltan variables de entorno. Se guarda en `globalThis` porque Next puede cargar este archivo más de una vez
// (una por ruta o por recarga), y el correo simulado y los repositorios en memoria no deben duplicarse.
// El `as unknown as` solo declara esa propiedad extra; el valor guardado siempre es un TenantsModule.
const globalForTenants = globalThis as unknown as { tenantsModule?: TenantsModule };

export function getTenantsModule(): TenantsModule {
  globalForTenants.tenantsModule ??= buildTenantsModule();

  return globalForTenants.tenantsModule;
}
