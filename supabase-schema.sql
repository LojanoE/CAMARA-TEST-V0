-- ============================================
-- SQL COMPLETO PARA SUPABASE - CAMARA-APP v20
-- Ejecutar en: SQL Editor → New query
-- ============================================

-- 1. CREAR TABLAS
-- Tabla de Frentes de Trabajo
create table if not exists frentes (
  id uuid default gen_random_uuid() primary key,
  nombre text not null unique,
  activo boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Tabla de Actividades
create table if not exists actividades (
  id uuid default gen_random_uuid() primary key,
  nombre text not null unique,
  activo boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- 2. HABILITAR ROW LEVEL SECURITY (RLS)
alter table frentes enable row level security;
alter table actividades enable row level security;

-- 3. CREAR POLÍTICAS DE SEGURIDAD
-- Lectura pública para todos (la app necesita ver frentes/actividades)
create policy "Frentes visibles para todos" 
  on frentes for select using (true);

create policy "Actividades visibles para todos" 
  on actividades for select using (true);

-- Escritura permitida (la app valida admin localmente con usuario GDR)
-- Nota: En producción real, considerar usar una API key de servicio
create policy "Permitir insercion frentes" on frentes for insert with check (true);
create policy "Permitir insercion actividades" on actividades for insert with check (true);
create policy "Permitir actualizacion frentes" on frentes for update using (true);
create policy "Permitir actualizacion actividades" on actividades for update using (true);
create policy "Permitir eliminacion frentes" on frentes for delete using (true);
create policy "Permitir eliminacion actividades" on actividades for delete using (true);

-- 4. FUNCIÓN PARA AUTO-ACTUALIZAR updated_at
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 5. TRIGGERS PARA updated_at
drop trigger if exists update_frentes_updated_at on frentes;
create trigger update_frentes_updated_at
  before update on frentes
  for each row execute function update_updated_at_column();

drop trigger if exists update_actividades_updated_at on actividades;
create trigger update_actividades_updated_at
  before update on actividades
  for each row execute function update_updated_at_column();

-- 6. INSERTAR DATOS INICIALES (solo si las tablas están vacías)
-- Frentes de trabajo
do $$
begin
  if not exists (select 1 from frentes limit 1) then
    insert into frentes (nombre, activo) values
      ('FBC 6', true),
      ('FBC 4', true),
      ('DRQ', true),
      ('Dren Basal', true),
      ('Dren Inclinado', true),
      ('Dren de Derivación D-VC', true),
      ('Dren de Derivación D-08', true),
      ('Dren de Derivación D-08B', true),
      ('Dren de Derivación D-11', true),
      ('Dren de Derivación D-18', true),
      ('Dren de Derivación D-32', true),
      ('Dren de Derivación D-37', true),
      ('Dren de Derivación D-980', true),
      ('Dren de Derivación D-980B', true),
      ('Canal 980A', true),
      ('Quebrada #3', true),
      ('Quebrada #4', true),
      ('P795 (C980 Subsec 3)', true),
      ('P833 (C980 Subsec 3)', true),
      ('P980 (C980 Subsec 3)', true),
      ('P845 EI (C980 Subsec 3)', true),
      ('P920 EI (C980 Subsec 2)', true),
      ('P950 EI (C980 Subsec 2)', true),
      ('P965 EI (C980 Subsec 3)', true),
      ('P980 EI (C980 Subsec 3)', true),
      ('P835 (C990 Subsec 3)', true),
      ('P845 (C990 Subsec 1)', true),
      ('P860 (C990 Subsec 2)', true),
      ('P880 (C990 Subsec 2)', true),
      ('P900 (C990 Subsec 1)', true),
      ('P940 (C990 Subsec 2)', true),
      ('P965 (C990 Subsec 1)', true),
      ('Vaso del DRT', true),
      ('Subembalse 1', true),
      ('Subembalse 2', true),
      ('Instituto Yangtsé', true),
      ('Escombrera del hombro derecho', true),
      ('Escombrera del hombro izquierdo', true),
      ('Cuenco disipador', true),
      ('Acceso al tajo de mina', true),
      ('Via al Cóndor', true),
      ('Pozos de drenaje', true),
      ('Acceso cota 1000 msnm', true);
  end if;
end $$;

-- Actividades
do $$
begin
  if not exists (select 1 from actividades limit 1) then
    insert into actividades (nombre, activo) values
      ('Z1 Descarga', true),
      ('Z1 Descarga en zona de acopio', true),
      ('Z1 Tendido y compactación', true),
      ('Z2', true),
      ('Z3', true),
      ('Z6', true),
      ('Z6 Esclerómetro ', true),
      ('GTI', true),
      ('GTS', true),
      ('Perfilado talud aguas abajo', true),
      ('Perfilado talud aguas arriba', true),
      ('Descarga de relaves', true),
      ('Descarga de material saturado', true),
      ('Preparación de Fundación', true),
      ('Aforo', true),
      ('Conformación de Accesos DRQ', true),
      ('Capa de sacrificio de relleno', true),
      ('Bombeo de agua', true),
      ('Relleno con arcilla', true);
  end if;
end $$;

-- 7. CREAR TABLA CORONAMIENTOS
create table if not exists coronamientos (
  id uuid default gen_random_uuid() primary key,
  nombre text not null unique,
  activo boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- 8. HABILITAR RLS PARA CORONAMIENTOS
alter table coronamientos enable row level security;

-- 9. CREAR POLÍTICAS PARA CORONAMIENTOS
create policy "Coronamientos visibles para todos" 
  on coronamientos for select using (true);

create policy "Permitir insercion coronamientos" on coronamientos for insert with check (true);
create policy "Permitir actualizacion coronamientos" on coronamientos for update using (true);
create policy "Permitir eliminacion coronamientos" on coronamientos for delete using (true);

-- 10. TRIGGER PARA updated_at DE CORONAMIENTOS
drop trigger if exists update_coronamientos_updated_at on coronamientos;
create trigger update_coronamientos_updated_at
  before update on coronamientos
  for each row execute function update_updated_at_column();

-- 11. INSERTAR DATOS INICIALES DE CORONAMIENTOS (migración automática)
do $$
begin
  if not exists (select 1 from coronamientos limit 1) then
    insert into coronamientos (nombre, activo) values
      ('C980', true),
      ('C990', true),
      ('DRQ', true);
  end if;
end $$;

-- ============================================
-- VERIFICACIÓN
-- ============================================
select 'Tabla frentes creada' as status, count(*) as registros from frentes
union all
select 'Tabla actividades creada' as status, count(*) as registros from actividades
union all
select 'Tabla coronamientos creada' as status, count(*) as registros from coronamientos;
