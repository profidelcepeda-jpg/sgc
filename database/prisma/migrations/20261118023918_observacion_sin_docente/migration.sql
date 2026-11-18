-- DropForeignKey
ALTER TABLE "observations" DROP CONSTRAINT "observations_teacher_id_fkey";

-- AlterTable
ALTER TABLE "observations" ALTER COLUMN "teacher_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
