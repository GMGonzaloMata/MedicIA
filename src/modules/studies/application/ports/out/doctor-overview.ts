import type { DoctorOverviewSummary } from "../../../domain/doctor-overview";

export interface DoctorOverviewReader {
  read(input: { tenantId: string; membershipId: string; recentLimit: number }): Promise<DoctorOverviewSummary>;
}
