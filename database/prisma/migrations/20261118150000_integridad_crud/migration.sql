-- Integridad del motor CRUD y de las notas (auditoría técnica, bloque 1)
-- 1) Secuencias de IDs atómicas (reemplaza el MAX en memoria de generadorId_).
-- 2) Índices únicos que el esquema Prisma no puede expresar (COALESCE / parciales).
-- 3) CHECK 0..100 completos para TODAS las competencias y recuperaciones.

-- ───────────────────────── 1. Secuencias de IDs ─────────────────────────

CREATE TABLE "id_counters" (
    "prefijo" TEXT NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "id_counters_pkey" PRIMARY KEY ("prefijo")
);

-- Sembrar cada contador por encima del máximo histórico (los IDs con sufijo
-- no numérico, como SES-<hex>, se ignoran: el contador arranca en 0).
INSERT INTO "id_counters" ("prefijo", "ultimo")
SELECT split_part(id, '-', 1), MAX(CAST(split_part(id, '-', 2) AS INTEGER))
FROM (
    SELECT id FROM users
    UNION ALL SELECT id FROM teachers
    UNION ALL SELECT id FROM subjects
    UNION ALL SELECT id FROM competences
    UNION ALL SELECT id FROM teaching_assignments
    UNION ALL SELECT id FROM tutoring_assignments
    UNION ALL SELECT id FROM periods
    UNION ALL SELECT id FROM courses
    UNION ALL SELECT id FROM sections
    UNION ALL SELECT id FROM students
    UNION ALL SELECT id FROM enrollments
    UNION ALL SELECT id FROM grade_records
    UNION ALL SELECT id FROM result_summaries
    UNION ALL SELECT id FROM observations
    UNION ALL SELECT id FROM sesiones
) t
WHERE split_part(id, '-', 2) ~ '^[0-9]+$'
GROUP BY 1
ON CONFLICT ("prefijo") DO NOTHING;

-- ───────────────────────── 2. Índices únicos ─────────────────────────

-- Tutorías: una sola ACTIVA por sección/año; las INACTIVAS históricas no chocan.
DROP INDEX IF EXISTS "tutoring_assignments_school_year_id_section_id_estado_key";
CREATE UNIQUE INDEX "tutoring_assignments_activa_key"
    ON "tutoring_assignments" ("school_year_id", "section_id")
    WHERE "estado" = 'ACTIVA';
CREATE INDEX "tutoring_assignments_school_year_id_section_id_idx"
    ON "tutoring_assignments" ("school_year_id", "section_id");

-- Asignaciones: unicidad legado (año, sección, asignatura, docente, período).
-- period_id NULL representa "todo el año" (el '*' del legacy): COALESCE lo iguala.
CREATE UNIQUE INDEX "teaching_assignments_unica_key"
    ON "teaching_assignments" (
        "school_year_id", "section_id", "subject_id", "teacher_id", COALESCE("period_id", '*')
    );

-- Competencias generales (subject_id NULL): un solo registro por código.
CREATE UNIQUE INDEX "competences_general_codigo_key"
    ON "competences" ("codigo")
    WHERE "subject_id" IS NULL;

-- Inscripciones: un estudiante, una vez por año escolar.
CREATE UNIQUE INDEX "enrollments_school_year_id_student_id_key"
    ON "enrollments" ("school_year_id", "student_id");

-- ───────────────────────── 3. CHECK completos de notas ─────────────────────────

ALTER TABLE grade_records
    DROP CONSTRAINT IF EXISTS chk_gr_notas_c,
    DROP CONSTRAINT IF EXISTS chk_gr_notas_r,
    DROP CONSTRAINT IF EXISTS chk_gr_recuperacion_mayor_igual;

ALTER TABLE grade_records
    ADD CONSTRAINT chk_gr_notas_c CHECK (
        (c1 BETWEEN 0 AND 100 OR c1 IS NULL) AND
        (c2 BETWEEN 0 AND 100 OR c2 IS NULL) AND
        (c3 BETWEEN 0 AND 100 OR c3 IS NULL) AND
        (c4 BETWEEN 0 AND 100 OR c4 IS NULL)
    ),
    ADD CONSTRAINT chk_gr_notas_r CHECK (
        (r1 BETWEEN 0 AND 100 OR r1 IS NULL) AND
        (r2 BETWEEN 0 AND 100 OR r2 IS NULL) AND
        (r3 BETWEEN 0 AND 100 OR r3 IS NULL) AND
        (r4 BETWEEN 0 AND 100 OR r4 IS NULL)
    ),
    ADD CONSTRAINT chk_gr_recuperacion_mayor_igual CHECK (
        (r1 IS NULL OR c1 IS NULL OR r1 >= c1) AND
        (r2 IS NULL OR c2 IS NULL OR r2 >= c2) AND
        (r3 IS NULL OR c3 IS NULL OR r3 >= c3) AND
        (r4 IS NULL OR c4 IS NULL OR r4 >= c4)
    );

ALTER TABLE result_summaries
    ADD CONSTRAINT chk_res_pc CHECK (
        (pc1 BETWEEN 0 AND 100 OR pc1 IS NULL) AND
        (pc2 BETWEEN 0 AND 100 OR pc2 IS NULL) AND
        (pc3 BETWEEN 0 AND 100 OR pc3 IS NULL) AND
        (pc4 BETWEEN 0 AND 100 OR pc4 IS NULL)
    ),
    ADD CONSTRAINT chk_res_cf_real CHECK (cf_real BETWEEN 0 AND 100 OR cf_real IS NULL);
