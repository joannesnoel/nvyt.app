-- Add 'green' to the enum (must be done outside transaction or committed first)
ALTER TYPE "public"."event_color_template" ADD VALUE IF NOT EXISTS 'green' BEFORE 'lime';
