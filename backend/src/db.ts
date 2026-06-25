import pg from "pg";
import { config } from "./config.js";

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

export async function migrate() {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS import_batches (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      created_by text NOT NULL DEFAULT 'Usuario nao identificado',
      updated_by text NOT NULL DEFAULT 'Usuario nao identificado',
      created_by_sub text NOT NULL DEFAULT '',
      created_by_name text NOT NULL DEFAULT 'Usuario nao identificado',
      updated_by_sub text NOT NULL DEFAULT '',
      updated_by_name text NOT NULL DEFAULT 'Usuario nao identificado',
      parent_batch_id uuid REFERENCES import_batches(id) ON DELETE SET NULL,
      version_no integer NOT NULL DEFAULT 1,
      parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
      file_count integer NOT NULL DEFAULT 0,
      summary jsonb NOT NULL DEFAULT '{}'::jsonb
    );

    CREATE TABLE IF NOT EXISTS nfe_xmls (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      batch_id uuid NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
      filename text NOT NULL,
      xml_text text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS nfe_notes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      batch_id uuid NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
      access_key text,
      number text,
      issue_date timestamptz,
      supplier text,
      supplier_tax_id text,
      total numeric(14,2) NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS pricing_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      batch_id uuid NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
      sku text NOT NULL,
      description text NOT NULL,
      ncm text,
      category text NOT NULL DEFAULT '',
      quantity numeric(14,4) NOT NULL,
      purchase_unit numeric(14,4) NOT NULL,
      total_purchase numeric(14,4) NOT NULL,
      freight_unit numeric(14,4) NOT NULL DEFAULT 0,
      other_unit numeric(14,4) NOT NULL DEFAULT 0,
      icms_percent numeric(8,4) NOT NULL DEFAULT 0,
      sales_tax_percent numeric(8,4) NOT NULL DEFAULT 0,
      margin_percent numeric(8,4) NOT NULL DEFAULT 0,
      market_price numeric(14,4) NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(batch_id, sku)
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      batch_id uuid REFERENCES import_batches(id) ON DELETE SET NULL,
      item_id uuid REFERENCES pricing_items(id) ON DELETE SET NULL,
      action text NOT NULL,
      user_sub text NOT NULL,
      user_name text NOT NULL,
      details jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    ALTER TABLE pricing_items
      ADD COLUMN IF NOT EXISTS market_price numeric(14,4) NOT NULL DEFAULT 0;

    ALTER TABLE import_batches
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS created_by text NOT NULL DEFAULT 'Usuario nao identificado',
      ADD COLUMN IF NOT EXISTS updated_by text NOT NULL DEFAULT 'Usuario nao identificado',
      ADD COLUMN IF NOT EXISTS created_by_sub text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS created_by_name text NOT NULL DEFAULT 'Usuario nao identificado',
      ADD COLUMN IF NOT EXISTS updated_by_sub text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS updated_by_name text NOT NULL DEFAULT 'Usuario nao identificado',
      ADD COLUMN IF NOT EXISTS parent_batch_id uuid REFERENCES import_batches(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS version_no integer NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS parameters jsonb NOT NULL DEFAULT '{}'::jsonb;

    ALTER TABLE nfe_notes
      ADD COLUMN IF NOT EXISTS supplier_tax_id text;

    CREATE INDEX IF NOT EXISTS idx_nfe_notes_access_key ON nfe_notes(access_key);
    CREATE INDEX IF NOT EXISTS idx_nfe_notes_supplier ON nfe_notes(lower(supplier));
    CREATE INDEX IF NOT EXISTS idx_nfe_notes_number ON nfe_notes(number);
    CREATE INDEX IF NOT EXISTS idx_import_batches_parent ON import_batches(parent_batch_id);
    CREATE INDEX IF NOT EXISTS idx_audit_events_batch ON audit_events(batch_id, created_at DESC);
  `);

  await pool.query(`
    UPDATE import_batches
    SET created_by_name = created_by,
        updated_by_name = updated_by
    WHERE created_by_name = 'Usuario nao identificado'
       OR updated_by_name = 'Usuario nao identificado'
  `);
}
