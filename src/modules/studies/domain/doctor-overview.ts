export interface RecentDoctorStudy {
  id: string;
  number: number;
  uploadedAt: Date;
  patientName: string | null;
}

export interface DoctorOverviewSummary {
  assignedPatientCount: number;
  studyCount: number;
  recentStudies: RecentDoctorStudy[];
}
