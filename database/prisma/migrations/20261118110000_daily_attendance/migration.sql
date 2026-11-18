-- Registro diario de asistencia. Los porcentajes mensuales Legacy permanecen intactos.
CREATE TABLE "attendance_sessions" (
    "id" TEXT NOT NULL,
    "school_year_id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "registrado_por_id" TEXT NOT NULL,
    "modificado_por_id" TEXT,
    "creado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modificado" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "attendance_sessions_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "attendance_sessions_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "attendance_sessions_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "attendance_sessions_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "attendance_sessions_modificado_por_id_fkey" FOREIGN KEY ("modificado_por_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "attendance_marks" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "observacion" VARCHAR(300),
    "creado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modificado" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "attendance_marks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "attendance_marks_estado_check" CHECK ("estado" IN ('PRESENTE', 'AUSENTE', 'TARDANZA', 'EXCUSADO')),
    CONSTRAINT "attendance_marks_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "attendance_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "attendance_marks_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "attendance_sessions_school_year_id_section_id_fecha_key" ON "attendance_sessions"("school_year_id", "section_id", "fecha");
CREATE INDEX "attendance_sessions_school_year_id_fecha_idx" ON "attendance_sessions"("school_year_id", "fecha");
CREATE UNIQUE INDEX "attendance_marks_session_id_enrollment_id_key" ON "attendance_marks"("session_id", "enrollment_id");
CREATE INDEX "attendance_marks_enrollment_id_session_id_idx" ON "attendance_marks"("enrollment_id", "session_id");
