-- Restricciones CHECK que reemplazan la validación de hoja del legado
-- (Setup.js exigía 0..100 con validación de datos; ahora la garantiza la BD)

-- Notas de calificaciones: enteras 0..100 o NULL (sin registrar)
ALTER TABLE grade_records
  ADD CONSTRAINT chk_gr_notas_c CHECK
    (c1 BETWEEN 0 AND 100 OR c1 IS NULL),
  ADD CONSTRAINT chk_gr_notas_r CHECK
    (r1 BETWEEN 0 AND 100 OR r1 IS NULL),
  ADD CONSTRAINT chk_gr_nota_etapa CHECK
    (nota_etapa BETWEEN 0 AND 100 OR nota_etapa IS NULL);

-- La recuperación nunca puede ser inferior a la nota original del período (regla del motor)
ALTER TABLE grade_records
  ADD CONSTRAINT chk_gr_recuperacion_mayor_igual CHECK
    ((r1 IS NULL OR c1 IS NULL) OR (r1 IS NOT NULL AND c1 IS NOT NULL AND r1 >= c1));

-- Asistencia: 0..100
ALTER TABLE attendance
  ADD CONSTRAINT chk_att_porcentaje CHECK (porcentaje BETWEEN 0 AND 100);

-- Calificación final y de etapas: 0..100
ALTER TABLE result_summaries
  ADD CONSTRAINT chk_res_cf CHECK (cf BETWEEN 0 AND 100 OR cf IS NULL),
  ADD CONSTRAINT chk_res_etapas CHECK (
    (cec BETWEEN 0 AND 100 OR cec IS NULL)
    AND (ccf BETWEEN 0 AND 100 OR ccf IS NULL)
    AND (ceex BETWEEN 0 AND 100 OR ceex IS NULL)
    AND (cexf BETWEEN 0 AND 100 OR cexf IS NULL)
    AND (cesp BETWEEN 0 AND 100 OR cesp IS NULL)
  ),
  ADD CONSTRAINT chk_res_notas_ar CHECK (
    (nota_a BETWEEN 0 AND 100 OR nota_a IS NULL)
    AND (nota_r BETWEEN 0 AND 100 OR nota_r IS NULL)
  );

-- Un período REGULAR no lleva etapa; un período ETAPA siempre la lleva
ALTER TABLE periods
  ADD CONSTRAINT chk_per_etapa_coherente CHECK (
    (tipo = 'REGULAR' AND etapa IS NULL) OR (tipo = 'ETAPA' AND etapa IS NOT NULL)
  );
