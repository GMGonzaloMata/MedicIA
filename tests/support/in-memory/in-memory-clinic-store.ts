import type {
  AcceptInvitationResult,
  InvitationRepository,
} from "@/modules/tenants/application/ports/out/invitation-repository";
import type { StaffMember, StaffRepository, TenantSummary } from "@/modules/tenants/application/ports/out/staff-repository";
import { decideDeactivation } from "@/modules/tenants/domain/member-lifecycle";
import { normalizeEmail, type NormalizedEmail } from "@/modules/tenants/domain/normalized-values";
import { decideAcceptance, type StaffInvitation } from "@/modules/tenants/domain/staff-invitation";
import type { DoctorProfile } from "@/modules/tenants/domain/doctor-profile";
import type { StaffRoles } from "@/modules/tenants/domain/staff-roles";

interface UserRow {
  id: string;
  email: NormalizedEmail;
  fullName: string;
}

interface MembershipRow {
  id: string;
  tenantId: string;
  userId: string;
  roles: StaffRoles;
  doctor: DoctorProfile | null;
  status: "ACTIVE" | "DEACTIVATED";
  deactivatedAt?: Date | null;
  deactivatedByUserId?: string | null;
}

interface InvitationRow extends StaffInvitation {
  tokenHash: string;
  createdByUserId: string;
  revokedByUserId?: string;
  acceptedByUserId?: string;
}

function required<T>(value: T | null): T {
  if (value === null) {
    throw new Error("Valor de prueba inválido.");
  }

  return value;
}

// Almacén en memoria de personal e invitaciones para las pruebas unitarias. Comparte un solo estado porque aceptar
// una invitación crea una membresía. Aplica las mismas reglas que el repositorio real (`decideAcceptance`).
export function createInMemoryClinicStore() {
  const tenants = new Map<string, TenantSummary>();
  const users = new Map<string, UserRow>();
  const memberships: MembershipRow[] = [];
  const invitationRows: InvitationRow[] = [];
  let sequence = 0;

  const nextId = (prefix: string) => `${prefix}-${(sequence += 1)}`;

  const toMember = (row: MembershipRow): StaffMember => {
    const user = required(users.get(row.userId) ?? null);

    return {
      membershipId: row.id,
      userId: user.id,
      fullName: user.fullName,
      email: user.email,
      roles: row.roles,
      doctor: row.doctor,
      status: row.status,
    };
  };

  // Devuelve solo lo que expone el puerto: nunca el hash del token.
  const toInvitation = (row: InvitationRow): StaffInvitation => ({
    id: row.id,
    tenantId: row.tenantId,
    email: row.email,
    roles: row.roles,
    doctor: row.doctor,
    status: row.status,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  });

  const staff: StaffRepository = {
    async findTenant(tenantId) {
      return tenants.get(tenantId) ?? null;
    },

    async findMemberByEmail({ tenantId, email }) {
      const user = [...users.values()].find((candidate) => candidate.email === email);
      const row = user ? memberships.find((candidate) => candidate.tenantId === tenantId && candidate.userId === user.id) : undefined;

      return row ? toMember(row) : null;
    },

    async listMembers(tenantId) {
      return memberships.filter((row) => row.tenantId === tenantId).map(toMember);
    },

    async isLicenseTaken({ tenantId, licenseNumber, exceptEmail }) {
      const ofMember = memberships.some((row) => row.tenantId === tenantId && row.doctor?.licenseNumber === licenseNumber);
      const ofInvitation = invitationRows.some(
        (row) =>
          row.tenantId === tenantId &&
          row.status === "PENDING" &&
          row.doctor?.licenseNumber === licenseNumber &&
          row.email !== exceptEmail,
      );

      return ofMember || ofInvitation;
    },

    async deactivate({ tenantId, membershipId, deactivatedByUserId, now }) {
      const row = memberships.find((candidate) => candidate.id === membershipId && candidate.tenantId === tenantId);

      if (!row) {
        return { kind: "not-found" };
      }

      const activeAdminCount = memberships.filter(
        (candidate) => candidate.tenantId === tenantId && candidate.roles.isClinicAdmin && candidate.status === "ACTIVE",
      ).length;
      const decision = decideDeactivation({ member: row, activeAdminCount });

      if (decision !== "ok") {
        return { kind: decision };
      }

      row.status = "DEACTIVATED";
      row.deactivatedAt = now;
      row.deactivatedByUserId = deactivatedByUserId;

      return { kind: "deactivated" };
    },

    async reactivate({ tenantId, membershipId }) {
      const row = memberships.find((candidate) => candidate.id === membershipId && candidate.tenantId === tenantId);

      if (!row) {
        return { kind: "not-found" };
      }

      if (row.status === "ACTIVE") {
        return { kind: "already-active" };
      }

      row.status = "ACTIVE";
      row.deactivatedAt = null;
      row.deactivatedByUserId = null;

      return { kind: "reactivated" };
    },
  };

  const invitations: InvitationRepository = {
    async createReplacingPending(input) {
      for (const row of invitationRows) {
        if (row.tenantId === input.tenantId && row.email === input.email && row.status === "PENDING") {
          row.status = "REVOKED";
          row.revokedByUserId = input.createdByUserId;
        }
      }

      const row: InvitationRow = {
        id: nextId("invitation"),
        tenantId: input.tenantId,
        email: input.email,
        roles: input.roles,
        doctor: input.doctor,
        status: "PENDING",
        expiresAt: input.expiresAt,
        createdAt: input.now,
        tokenHash: input.tokenHash,
        createdByUserId: input.createdByUserId,
      };
      invitationRows.push(row);

      return toInvitation(row);
    },

    async listPending(tenantId) {
      return invitationRows
        .filter((row) => row.tenantId === tenantId && row.status === "PENDING")
        .map(toInvitation)
        .reverse();
    },

    async findById({ tenantId, invitationId }) {
      const row = invitationRows.find((candidate) => candidate.id === invitationId && candidate.tenantId === tenantId);

      return row ? toInvitation(row) : null;
    },

    async revoke({ tenantId, invitationId, revokedByUserId }) {
      const row = invitationRows.find((candidate) => candidate.id === invitationId && candidate.tenantId === tenantId);

      if (!row || row.status !== "PENDING") {
        return false;
      }

      row.status = "REVOKED";
      row.revokedByUserId = revokedByUserId;

      return true;
    },

    async accept({ tokenHash, user, now }): Promise<AcceptInvitationResult> {
      const row = invitationRows.find((candidate) => candidate.tokenHash === tokenHash);
      const tenant = row ? tenants.get(row.tenantId) : undefined;

      if (!row || !tenant) {
        return { kind: "rejected" };
      }

      const existing = memberships.find((candidate) => candidate.tenantId === row.tenantId && candidate.userId === user.id);
      const decision = decideAcceptance({
        invitation: row,
        tenantStatus: tenant.status,
        membership: existing ? { membershipId: existing.id, roles: existing.roles, status: existing.status } : null,
        userEmail: user.email,
        now,
      });

      if (decision.kind === "reject") {
        return { kind: "rejected" };
      }

      row.status = "ACCEPTED";
      row.acceptedByUserId = user.id;

      if (decision.kind === "merge" && existing) {
        existing.roles = decision.roles;
        existing.doctor = decision.doctor ?? existing.doctor;

        return { kind: "accepted", tenantId: row.tenantId, membershipId: existing.id };
      }

      const created: MembershipRow = {
        id: nextId("membership"),
        tenantId: row.tenantId,
        userId: user.id,
        roles: decision.roles,
        doctor: decision.doctor,
        status: "ACTIVE",
      };
      memberships.push(created);

      return { kind: "accepted", tenantId: row.tenantId, membershipId: created.id };
    },
  };

  return {
    staff,
    invitations,
    memberships,
    invitationRows,

    addTenant(input: { id: string; name: string; status?: "ACTIVE" | "SUSPENDED" }) {
      tenants.set(input.id, { name: input.name, status: input.status ?? "ACTIVE" });
    },

    addUser(input: { id: string; email: string; fullName?: string }) {
      users.set(input.id, {
        id: input.id,
        email: required(normalizeEmail(input.email)),
        fullName: input.fullName ?? input.id,
      });
    },

    addMembership(input: {
      tenantId: string;
      userId: string;
      roles: StaffRoles;
      doctor?: DoctorProfile | null;
      status?: "ACTIVE" | "DEACTIVATED";
    }) {
      const row: MembershipRow = {
        id: nextId("membership"),
        tenantId: input.tenantId,
        userId: input.userId,
        roles: input.roles,
        // Como en la base: un médico siempre tiene sus datos.
        doctor: input.doctor ?? (input.roles.isDoctor ? { specialty: "Cardiología", licenseNumber: `MP-${nextId("lic")}` } : null),
        status: input.status ?? "ACTIVE",
      };
      memberships.push(row);

      return row;
    },
  };
}
