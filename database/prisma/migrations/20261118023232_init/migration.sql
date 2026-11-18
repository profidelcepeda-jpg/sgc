-- CreateEnum
CREATE TYPE "TipoPeriodo" AS ENUM ('REGULAR', 'ETAPA');

-- CreateEnum
CREATE TYPE "Etapa" AS ENUM ('COMPLETIVA', 'EXTRAORDINARIA', 'ESPECIAL');

-- CreateTable
CREATE TABLE "config" (
    "clave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "descripcion" TEXT,
    "fecha_modificacion" TEXT,

    CONSTRAINT "config_pkey" PRIMARY KEY ("clave")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "esSistema" BOOLEAN NOT NULL DEFAULT false,
    "estado" TEXT NOT NULL DEFAULT 'ACTIVO',
    "creado" TIMESTAMP(3),
    "modificado" TIMESTAMP(3),

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permisos" (
    "id" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,

    CONSTRAINT "permisos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rol_permisos" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,

    CONSTRAINT "rol_permisos_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "correo" TEXT,
    "usuario" TEXT NOT NULL,
    "rol_id" TEXT NOT NULL,
    "teacher_id" TEXT,
    "permisos_extra" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "permisos_denegados" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estado" TEXT NOT NULL DEFAULT 'ACTIVO',
    "creado" TIMESTAMP(3),
    "modificado" TIMESTAMP(3),
    "ultimo_acceso" TIMESTAMP(3),
    "sesiones_revocadas" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credenciales" (
    "user_id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 2,
    "debe_cambiar" BOOLEAN NOT NULL DEFAULT false,
    "intentos_fallidos" INTEGER NOT NULL DEFAULT 0,
    "bloqueado_hasta" TIMESTAMP(3),
    "fecha_cambio" TIMESTAMP(3)
);

-- CreateTable
CREATE TABLE "sesiones" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "creada" TIMESTAMP(3) NOT NULL,
    "expira" TIMESTAMP(3) NOT NULL,
    "ultima_actividad" TIMESTAMP(3) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ACTIVA',

    CONSTRAINT "sesiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teachers" (
    "id" TEXT NOT NULL,
    "titulo" TEXT,
    "nombres" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "nombre_completo" TEXT NOT NULL,
    "correo" TEXT,
    "telefono" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'ACTIVO',
    "creado" TIMESTAMP(3),
    "modificado" TIMESTAMP(3),

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_years" (
    "id" TEXT NOT NULL,

    CONSTRAINT "school_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "school_year_id" TEXT NOT NULL,
    "nivel" TEXT NOT NULL,
    "grado" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ACTIVO',
    "creado" TIMESTAMP(3),
    "modificado" TIMESTAMP(3),

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "seccion" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ACTIVO',
    "creado" TIMESTAMP(3),
    "modificado" TIMESTAMP(3),

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "matricula" TEXT,
    "nombres" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "nombre_completo" TEXT NOT NULL,
    "sexo" TEXT,
    "fecha_nacimiento" TIMESTAMP(3),
    "estado" TEXT NOT NULL DEFAULT 'ACTIVO',
    "creado" TIMESTAMP(3),
    "modificado" TIMESTAMP(3),

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" TEXT NOT NULL,
    "school_year_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "num_lista" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ACTIVO',
    "creado" TIMESTAMP(3),
    "modificado" TIMESTAMP(3),

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombre_reporte" TEXT,
    "abrev" TEXT,
    "area" TEXT NOT NULL,
    "grados" TEXT[],
    "orden" INTEGER NOT NULL,
    "orden_boletin" INTEGER NOT NULL,
    "usa_recuperacion" BOOLEAN NOT NULL DEFAULT true,
    "usa_completiva" BOOLEAN NOT NULL DEFAULT true,
    "usa_extraordinaria" BOOLEAN NOT NULL DEFAULT true,
    "usa_especial" BOOLEAN NOT NULL DEFAULT true,
    "nota_minima" INTEGER,
    "estado" TEXT NOT NULL DEFAULT 'ACTIVO',
    "creado" TIMESTAMP(3),
    "modificado" TIMESTAMP(3),

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competences" (
    "id" TEXT NOT NULL,
    "subject_id" TEXT,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "abrev" TEXT,
    "orden" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ACTIVO',

    CONSTRAINT "competences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "periods" (
    "id" TEXT NOT NULL,
    "school_year_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoPeriodo" NOT NULL,
    "etapa" "Etapa",
    "orden" INTEGER NOT NULL,
    "meses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estado" TEXT NOT NULL DEFAULT 'ABIERTO',
    "creado" TIMESTAMP(3),
    "modificado" TIMESTAMP(3),

    CONSTRAINT "periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teaching_assignments" (
    "id" TEXT NOT NULL,
    "school_year_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "period_id" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'ACTIVO',
    "creado" TIMESTAMP(3),
    "modificado" TIMESTAMP(3),

    CONSTRAINT "teaching_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutoring_assignments" (
    "id" TEXT NOT NULL,
    "school_year_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ACTIVA',
    "creado" TIMESTAMP(3),
    "modificado" TIMESTAMP(3),

    CONSTRAINT "tutoring_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_records" (
    "id" TEXT NOT NULL,
    "school_year_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "teacher_id" TEXT,
    "subject_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "c1" INTEGER,
    "c2" INTEGER,
    "c3" INTEGER,
    "c4" INTEGER,
    "r1" INTEGER,
    "r2" INTEGER,
    "r3" INTEGER,
    "r4" INTEGER,
    "nota_etapa" INTEGER,
    "creado" TIMESTAMP(3),
    "modificado" TIMESTAMP(3),
    "modificado_por" TEXT,

    CONSTRAINT "grade_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_summaries" (
    "id" TEXT NOT NULL,
    "school_year_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "pc1" DOUBLE PRECISION,
    "pc2" DOUBLE PRECISION,
    "pc3" DOUBLE PRECISION,
    "pc4" DOUBLE PRECISION,
    "cf_real" DOUBLE PRECISION,
    "cf" INTEGER,
    "cec" INTEGER,
    "ccf" INTEGER,
    "ceex" INTEGER,
    "cexf" INTEGER,
    "cesp" INTEGER,
    "etapa_logro" TEXT,
    "nota_a" INTEGER,
    "nota_r" INTEGER,
    "estado_resultado" TEXT NOT NULL,
    "fecha_modificacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" TEXT NOT NULL,
    "school_year_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "mes" TEXT NOT NULL,
    "porcentaje" INTEGER NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observations" (
    "id" TEXT NOT NULL,
    "school_year_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "subject_id" TEXT,
    "period_id" TEXT,
    "tipo" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "observacion" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ACTIVA',
    "creado" TIMESTAMP(3),
    "modificado" TIMESTAMP(3),
    "creado_por" TEXT NOT NULL,

    CONSTRAINT "observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "fecha" TIMESTAMPTZ(0) NOT NULL,
    "usuario" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "id_registro" TEXT,
    "descripcion" TEXT,
    "valor_anterior" JSONB,
    "valor_nuevo" JSONB,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "error_log" (
    "id" BIGSERIAL NOT NULL,
    "fecha" TIMESTAMPTZ(0) NOT NULL,
    "usuario" TEXT,
    "funcion" TEXT NOT NULL,
    "referencia" TEXT,
    "mensaje" TEXT NOT NULL,
    "detalle" TEXT,

    CONSTRAINT "error_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_usuario_key" ON "users"("usuario");

-- CreateIndex
CREATE UNIQUE INDEX "users_teacher_id_key" ON "users"("teacher_id");

-- CreateIndex
CREATE UNIQUE INDEX "credenciales_user_id_key" ON "credenciales"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sesiones_token_hash_key" ON "sesiones"("token_hash");

-- CreateIndex
CREATE INDEX "sesiones_user_id_idx" ON "sesiones"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "courses_school_year_id_grado_key" ON "courses"("school_year_id", "grado");

-- CreateIndex
CREATE UNIQUE INDEX "sections_course_id_seccion_key" ON "sections"("course_id", "seccion");

-- CreateIndex
CREATE UNIQUE INDEX "students_nombre_completo_key" ON "students"("nombre_completo");

-- CreateIndex
CREATE INDEX "enrollments_student_id_idx" ON "enrollments"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_school_year_id_section_id_num_lista_key" ON "enrollments"("school_year_id", "section_id", "num_lista");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_codigo_key" ON "subjects"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "competences_subject_id_codigo_key" ON "competences"("subject_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "periods_school_year_id_codigo_key" ON "periods"("school_year_id", "codigo");

-- CreateIndex
CREATE INDEX "teaching_assignments_school_year_id_teacher_id_idx" ON "teaching_assignments"("school_year_id", "teacher_id");

-- CreateIndex
CREATE UNIQUE INDEX "tutoring_assignments_school_year_id_section_id_estado_key" ON "tutoring_assignments"("school_year_id", "section_id", "estado");

-- CreateIndex
CREATE INDEX "grade_records_school_year_id_section_id_subject_id_idx" ON "grade_records"("school_year_id", "section_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_records_school_year_id_section_id_subject_id_student__key" ON "grade_records"("school_year_id", "section_id", "subject_id", "student_id", "period_id");

-- CreateIndex
CREATE INDEX "result_summaries_school_year_id_section_id_subject_id_idx" ON "result_summaries"("school_year_id", "section_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_summaries_school_year_id_section_id_subject_id_stude_key" ON "result_summaries"("school_year_id", "section_id", "subject_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_school_year_id_section_id_subject_id_student_id__key" ON "attendance"("school_year_id", "section_id", "subject_id", "student_id", "mes");

-- CreateIndex
CREATE INDEX "observations_school_year_id_section_id_idx" ON "observations"("school_year_id", "section_id");

-- CreateIndex
CREATE INDEX "audit_log_fecha_idx" ON "audit_log"("fecha");

-- CreateIndex
CREATE INDEX "audit_log_modulo_id_registro_idx" ON "audit_log"("modulo", "id_registro");

-- AddForeignKey
ALTER TABLE "rol_permisos" ADD CONSTRAINT "rol_permisos_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_permisos" ADD CONSTRAINT "rol_permisos_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permisos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credenciales" ADD CONSTRAINT "credenciales_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competences" ADD CONSTRAINT "competences_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periods" ADD CONSTRAINT "periods_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutoring_assignments" ADD CONSTRAINT "tutoring_assignments_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutoring_assignments" ADD CONSTRAINT "tutoring_assignments_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutoring_assignments" ADD CONSTRAINT "tutoring_assignments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutoring_assignments" ADD CONSTRAINT "tutoring_assignments_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_records" ADD CONSTRAINT "grade_records_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_records" ADD CONSTRAINT "grade_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_records" ADD CONSTRAINT "grade_records_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_records" ADD CONSTRAINT "grade_records_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_records" ADD CONSTRAINT "grade_records_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_records" ADD CONSTRAINT "grade_records_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_records" ADD CONSTRAINT "grade_records_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_summaries" ADD CONSTRAINT "result_summaries_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_summaries" ADD CONSTRAINT "result_summaries_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_summaries" ADD CONSTRAINT "result_summaries_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_summaries" ADD CONSTRAINT "result_summaries_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
