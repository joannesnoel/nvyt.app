CREATE TABLE IF NOT EXISTS "psgc_barangays" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"city_mun_name" text NOT NULL,
	"province_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "psgc_barangays_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "psgc_cities_municipalities" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"province_name" text NOT NULL,
	"is_city" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "psgc_provinces" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"region_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "psgc_provinces_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "psgc_regions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"designation" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "psgc_regions_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "psgc_barangays_city_mun_province_idx" ON "psgc_barangays" USING btree ("city_mun_name","province_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "psgc_cities_province_idx" ON "psgc_cities_municipalities" USING btree ("province_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "psgc_provinces_region_idx" ON "psgc_provinces" USING btree ("region_name");