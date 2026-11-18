-- AlterTable
ALTER TABLE "students" ALTER COLUMN "nombres" DROP NOT NULL,
ALTER COLUMN "apellidos" DROP NOT NULL;

-- AlterTable
ALTER TABLE "teachers" ALTER COLUMN "apellidos" DROP NOT NULL;
