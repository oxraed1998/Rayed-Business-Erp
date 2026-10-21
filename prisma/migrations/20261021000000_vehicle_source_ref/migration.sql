-- Additive: link vehicles to the external listing they were imported from.
ALTER TABLE "Vehicle" ADD COLUMN "sourceRef" TEXT;
CREATE INDEX "Vehicle_companyId_sourceRef_idx" ON "Vehicle"("companyId", "sourceRef");
