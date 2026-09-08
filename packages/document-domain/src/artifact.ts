export type DocumentArtifact = {
  id: string; payslipId: string; employeeId: string; payRunId: string;
  relativePath: string; sha256: string; bytes: number;
  mime: 'application/pdf'; encryption: 'AES-256'; passwordVersionId: string;
};
