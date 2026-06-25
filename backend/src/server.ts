import cors from "cors";
import ExcelJS from "exceljs";
import express from "express";
import multer from "multer";
import { config } from "./config.js";
import { pool, migrate } from "./db.js";
import { requireAuth, requirePermission, type AuthUser } from "./auth.js";
import { parseNfeXml } from "./nfe.js";
import { mapItem } from "./pricing.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

app.use(cors({ origin: config.corsOrigin === "*" ? true : config.corsOrigin, credentials: true }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/api/config", (_req, res) => {
  res.json({
    issuer: config.oidcIssuer,
    clientId: config.oidcClientId,
    scope: "openid profile email",
    portalUrl: config.portalUrl
  });
});

app.use("/api", requireAuth);

app.get("/api/me", (req, res) => {
  const user = res.locals.user as AuthUser;
  res.json({
    user: {
      sub: user.sub,
      name: user.name,
      email: user.email,
      permissions: user.permissions
    }
  });
});

app.get("/api/imports", requirePermission("precificacao:view"), async (req, res) => {
  const supplier = String(req.query.supplier || "").trim();
  const number = String(req.query.number || "").trim();
  const { rows } = await pool.query(
    `SELECT
       b.*,
       COALESCE(string_agg(DISTINCT n.supplier, ' / '), '') AS supplier,
       COALESCE(string_agg(DISTINCT n.supplier_tax_id, ' / '), '') AS supplier_tax_id,
       COALESCE(string_agg(DISTINCT n.number, ', '), '') AS note_number,
       COALESCE(string_agg(DISTINCT n.access_key, ', '), '') AS access_key,
       min(n.issue_date) AS issue_date
     FROM import_batches b
     LEFT JOIN nfe_notes n ON n.batch_id = b.id
     WHERE (
       $1 = '' OR EXISTS (
         SELECT 1 FROM nfe_notes ns
         WHERE ns.batch_id = b.id
           AND (ns.supplier ILIKE '%' || $1 || '%' OR ns.supplier_tax_id ILIKE '%' || $1 || '%')
       )
     )
     AND (
       $2 = '' OR EXISTS (
         SELECT 1 FROM nfe_notes nn
         WHERE nn.batch_id = b.id AND nn.number ILIKE '%' || $2 || '%'
       )
     )
     GROUP BY b.id
     ORDER BY b.created_at DESC
     LIMIT 100`,
    [supplier, number]
  );
  res.json(rows);
});

app.post("/api/imports", requirePermission("precificacao:import"), upload.array("files"), async (req, res) => {
  const files = (req.files || []) as Express.Multer.File[];
  if (!files.length) return res.status(400).json({ error: "Envie ao menos um XML" });

  const params = {
    freight: Number(req.body.freight || 0),
    freightMode: req.body.freightMode === "unit" ? "unit" : "total",
    otherCosts: Number(req.body.otherCosts || 0),
    otherCostsMode: req.body.otherCostsMode === "unit" ? "unit" : "total",
    icmsPercent: Number(req.body.icmsPercent || 0),
    salesTaxPercent: Number(req.body.salesTaxPercent || 0),
    marginPercent: Number(req.body.marginPercent || 0)
  } as const;
  const duplicateAction = req.body.duplicateAction === "version" ? "version" : "guard";
  const parsedFiles: Array<{ file: Express.Multer.File; parsed: ReturnType<typeof parseNfeXml> }> = [];
  const parseErrors: string[] = [];
  for (const file of files) {
    try {
      parsedFiles.push({ file, parsed: parseNfeXml(file.buffer.toString("utf8"), params) });
    } catch (error) {
      parseErrors.push(`${file.originalname}: ${(error as Error).message}`);
    }
  }
  if (!parsedFiles.length) return res.status(400).json({ error: parseErrors.join(" | ") || "Nenhuma NF-e valida" });

  const accessKeys = parsedFiles.map(({ parsed }) => parsed.accessKey).filter(Boolean);
  const duplicateResult = accessKeys.length
    ? await pool.query(
        `SELECT DISTINCT ON (n.access_key)
           n.access_key, n.number, n.supplier, n.supplier_tax_id,
           b.id AS batch_id, b.parent_batch_id, b.version_no, b.created_at, b.created_by
         FROM nfe_notes n
         JOIN import_batches b ON b.id = n.batch_id
         WHERE n.access_key = ANY($1::text[])
         ORDER BY n.access_key, b.version_no DESC, b.created_at DESC`,
        [accessKeys]
      )
    : { rows: [] };

  if (duplicateResult.rows.length && duplicateAction !== "version") {
    return res.status(409).json({
      code: "DUPLICATE_NFE",
      error: "Esta NF-e ja foi utilizada em uma precificacao",
      duplicates: duplicateResult.rows.map((row) => ({
        accessKey: row.access_key,
        number: row.number,
        supplier: row.supplier,
        supplierTaxId: row.supplier_tax_id,
        batchId: row.batch_id,
        versionNo: row.version_no,
        createdAt: row.created_at,
        createdBy: row.created_by
      }))
    });
  }

  let parentBatchId: string | null = null;
  let versionNo = 1;
  if (duplicateResult.rows.length && duplicateAction === "version") {
    const duplicate = duplicateResult.rows[0];
    parentBatchId = duplicate.parent_batch_id || duplicate.batch_id;
    const versionResult = await pool.query(
      `SELECT COALESCE(max(version_no), 1) + 1 AS next_version
       FROM import_batches
       WHERE id=$1 OR parent_batch_id=$1`,
      [parentBatchId]
    );
    versionNo = Number(versionResult.rows[0].next_version);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const user = res.locals.user as AuthUser;
    const userName = user.name;
    const batch = await client.query(
      `INSERT INTO import_batches(
         file_count, created_by, updated_by,
         created_by_sub, created_by_name, updated_by_sub, updated_by_name,
         parent_batch_id, version_no, parameters
       ) VALUES($1,$2,$2,$3,$2,$3,$2,$4,$5,$6) RETURNING id, created_at`,
      [parsedFiles.length, userName, user.sub, parentBatchId, versionNo, JSON.stringify(params)]
    );
    const batchId = batch.rows[0].id;
    const errors: string[] = [...parseErrors];

    for (const { file, parsed } of parsedFiles) {
      const xml = file.buffer.toString("utf8");
      try {
        await client.query("INSERT INTO nfe_xmls(batch_id, filename, xml_text) VALUES($1,$2,$3)", [
          batchId,
          file.originalname,
          xml
        ]);
        await client.query(
          `INSERT INTO nfe_notes(
             batch_id, access_key, number, issue_date, supplier, supplier_tax_id, total
           ) VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [batchId, parsed.accessKey, parsed.number, parsed.issueDate, parsed.supplier, parsed.supplierTaxId, parsed.total]
        );

        for (const item of parsed.products) {
          await client.query(
            `INSERT INTO pricing_items (
              batch_id, sku, description, ncm, quantity, purchase_unit, total_purchase,
              freight_unit, other_unit, icms_percent, sales_tax_percent, margin_percent
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            ON CONFLICT (batch_id, sku) DO UPDATE SET
              description = EXCLUDED.description,
              ncm = EXCLUDED.ncm,
              quantity = pricing_items.quantity + EXCLUDED.quantity,
              total_purchase = pricing_items.total_purchase + EXCLUDED.total_purchase,
              purchase_unit = (pricing_items.total_purchase + EXCLUDED.total_purchase) / NULLIF((pricing_items.quantity + EXCLUDED.quantity), 0),
              freight_unit = ((pricing_items.freight_unit * pricing_items.quantity) + (EXCLUDED.freight_unit * EXCLUDED.quantity)) / NULLIF((pricing_items.quantity + EXCLUDED.quantity), 0),
              other_unit = ((pricing_items.other_unit * pricing_items.quantity) + (EXCLUDED.other_unit * EXCLUDED.quantity)) / NULLIF((pricing_items.quantity + EXCLUDED.quantity), 0),
              updated_at = now()`,
            [
              batchId,
              item.sku,
              item.description,
              item.ncm,
              item.quantity,
              item.unitValue,
              item.totalValue,
              item.freightUnit,
              item.otherUnit,
              item.icmsPercent,
              item.salesTaxPercent,
              item.marginPercent
            ]
          );
        }
      } catch (error) {
        errors.push(`${file.originalname}: ${(error as Error).message}`);
      }
    }

    const items = await getItems(batchId, (text, values) => client.query(text, values));
    const summary = summarize(items);
    await client.query(
      `UPDATE import_batches
       SET summary=$2, updated_at=now(), updated_by=$3,
           updated_by_sub=$4, updated_by_name=$3
       WHERE id=$1`,
      [batchId, JSON.stringify(summary), userName, user.sub]
    );
    await writeAudit(client, {
      batchId,
      action: "import",
      user,
      details: { fileCount: parsedFiles.length, versionNo, accessKeys }
    });
    await client.query("COMMIT");
    res.status(errors.length ? 207 : 201).json({ batchId, versionNo, errors, items, summary });
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: (error as Error).message });
  } finally {
    client.release();
  }
});

app.get("/api/imports/:id/items", requirePermission("precificacao:view"), async (req, res) => {
  const items = await getItems(String(req.params.id));
  res.json({ items, summary: summarize(items) });
});

app.patch("/api/items/:id", requirePermission("precificacao:edit"), async (req, res) => {
  const allowed = [
    "category",
    "freightUnit",
    "otherUnit",
    "icmsPercent",
    "salesTaxPercent",
    "marginPercent",
    "marketPrice"
  ] as const;
  const map: Record<string, string> = {
    category: "category",
    freightUnit: "freight_unit",
    otherUnit: "other_unit",
    icmsPercent: "icms_percent",
    salesTaxPercent: "sales_tax_percent",
    marginPercent: "margin_percent",
    marketPrice: "market_price"
  };
  const entries = allowed.filter((key) => req.body[key] !== undefined);
  if (!entries.length) return res.status(400).json({ error: "Nenhum campo editavel enviado" });

  const set = entries.map((key, index) => `${map[key]}=$${index + 2}`).join(", ");
  const values = entries.map((key) => req.body[key]);
  const { rows } = await pool.query(
    `UPDATE pricing_items SET ${set}, updated_at=now() WHERE id=$1 RETURNING *`,
    [req.params.id, ...values]
  );
  if (!rows[0]) return res.status(404).json({ error: "Item nao encontrado" });
  const updated = mapItem(rows[0]);
  const batchItems = await getItems(updated.batchId);
  const batchSummary = summarize(batchItems);
  const user = res.locals.user as AuthUser;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE import_batches
       SET updated_at=now(), updated_by=$2, updated_by_sub=$3,
           updated_by_name=$2, summary=$4
       WHERE id=$1`,
      [updated.batchId, user.name, user.sub, JSON.stringify(batchSummary)]
    );
    await writeAudit(client, {
      batchId: updated.batchId,
      itemId: updated.id,
      action: "edit",
      user,
      details: Object.fromEntries(entries.map((key) => [key, req.body[key]]))
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  res.json(updated);
});

app.get("/api/imports/:id/export.:format", requirePermission("precificacao:export"), async (req, res) => {
  const batchId = String(req.params.id);
  const format = String(req.params.format);
  const items = await getItems(batchId);
  const user = res.locals.user as AuthUser;
  await writeAudit(pool, {
    batchId,
    action: "export",
    user,
    details: { format }
  });
  const rounded = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  const rows = items.map((item) => ({
    SKU: item.sku,
    Produto: item.description,
    Quantidade: item.quantity,
    "Custo compra unitario": rounded(item.purchaseUnit),
    "Frete unitario": rounded(item.freightUnit),
    "Outros custos unitarios": rounded(item.otherUnit),
    "ICMS %": item.icmsPercent,
    "ICMS R$": rounded(item.icmsValue),
    "Imposto venda %": item.salesTaxPercent,
    "Imposto venda R$": rounded(item.salesTaxValue),
    "Custo de aquisicao": rounded(item.acquisitionCost),
    "Custo antes da venda": rounded(item.costBeforeSale),
    "Preco sugerido": rounded(item.suggestedPrice),
    "Valor de mercado": rounded(item.marketPrice),
    "Custo completo estimado da venda": rounded(item.totalUnitCost),
    "Lucro R$": rounded(item.profitValue),
    "Lucro final %": rounded(item.profitPercent)
  }));

  if (format === "csv") {
    res.header("Content-Type", "text/csv; charset=utf-8");
    res.attachment("precificacao.csv");
    return res.send(toCsv(rows));
  }

  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Precificacao");
  const headers = Object.keys(rows[0] || { SKU: "" });
  sheet.columns = headers.map((key) => ({
    header: key,
    key,
    width: key === "Produto" ? 34 : key === "SKU" ? 18 : 17
  }));
  rows.forEach((row) => sheet.addRow(row));
  sheet.views = [{ state: "frozen", ySplit: 1, xSplit: 2 }];
  sheet.autoFilter = { from: "A1", to: `${sheet.getColumn(headers.length).letter}${rows.length + 1}` };
  sheet.getRow(1).height = 32;
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.alignment = { vertical: "middle" };
    row.eachCell((cell, columnNumber) => {
      if (columnNumber >= 3) cell.alignment = { vertical: "middle", horizontal: "right" };
    });
  });

  const currencyHeaders = new Set([
    "Custo compra unitario",
    "Frete unitario",
    "Outros custos unitarios",
    "ICMS R$",
    "Imposto venda R$",
    "Custo de aquisicao",
    "Custo antes da venda",
    "Preco sugerido",
    "Valor de mercado",
    "Custo completo estimado da venda",
    "Lucro R$"
  ]);
  headers.forEach((header, index) => {
    const column = sheet.getColumn(index + 1);
    if (currencyHeaders.has(header)) column.numFmt = '"R$" #,##0.00';
    if (header.endsWith("%")) column.numFmt = '0.00"%"';
  });

  const analysis = analyzePurchase(items);
  const summaryStart = rows.length + 4;
  const lastColumn = sheet.getColumn(headers.length).letter;
  sheet.mergeCells(`A${summaryStart}:${lastColumn}${summaryStart}`);
  const titleCell = sheet.getCell(`A${summaryStart}`);
  titleCell.value = "Resumo e conclusao da compra";
  titleCell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 14 };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
  titleCell.alignment = { vertical: "middle" };
  sheet.getRow(summaryStart).height = 26;

  const summaryRows: Array<[string, number, string, number]> = [
    ["Compra liquida", analysis.purchaseTotal, "Custo completo", analysis.completeCost],
    ["Frete total", analysis.freightTotal, "Venda projetada", analysis.saleTotal],
    ["ICMS estimado", analysis.icmsTotal, "Lucro potencial", analysis.profit],
    ["Imposto de venda", analysis.salesTaxTotal, "Margem media %", analysis.averageMargin]
  ];
  summaryRows.forEach((values, index) => {
    const row = sheet.getRow(summaryStart + 1 + index);
    row.values = values;
    row.getCell(1).font = { bold: true };
    row.getCell(3).font = { bold: true };
    row.getCell(2).numFmt = '"R$" #,##0.00';
    row.getCell(4).numFmt = index === 3 ? '0.00"%"' : '"R$" #,##0.00';
  });

  const conclusionRow = summaryStart + 6;
  sheet.mergeCells(`A${conclusionRow}:${lastColumn}${conclusionRow + 1}`);
  const conclusionCell = sheet.getCell(`A${conclusionRow}`);
  conclusionCell.value = analysis.conclusion;
  conclusionCell.alignment = { vertical: "middle", wrapText: true };
  conclusionCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: analysis.belowTarget > 0 ? "FFFFE6D5" : "FFDDF7FA" }
  };
  sheet.getRow(conclusionRow).height = 28;
  sheet.getRow(conclusionRow + 1).height = 28;
  const buffer = await book.xlsx.writeBuffer();
  res.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.attachment("precificacao.xlsx");
  res.send(buffer);
});

app.delete("/api/imports/:id", requirePermission("precificacao:admin"), async (req, res) => {
  const user = res.locals.user as AuthUser;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT id, version_no, created_by_name
       FROM import_batches WHERE id=$1 FOR UPDATE`,
      [req.params.id]
    );
    if (!existing.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Precificacao nao encontrada" });
    }
    await writeAudit(client, {
      action: "delete",
      user,
      details: { deletedBatchId: req.params.id, ...existing.rows[0] }
    });
    await client.query("DELETE FROM import_batches WHERE id=$1", [req.params.id]);
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

app.get("/api/imports/:id/audit", requirePermission("precificacao:admin"), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, batch_id, item_id, action, user_sub, user_name, details, created_at
     FROM audit_events WHERE batch_id=$1 ORDER BY created_at DESC`,
    [req.params.id]
  );
  res.json(rows);
});

async function getItems(
  batchId: string,
  query: (text: string, values: unknown[]) => Promise<{ rows: any[] }> = (text, values) =>
    pool.query(text, values)
) {
  const { rows } = await query("SELECT * FROM pricing_items WHERE batch_id=$1 ORDER BY description", [batchId]);
  return rows.map(mapItem);
}

function summarize(items: ReturnType<typeof mapItem>[]) {
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const stockCost = items.reduce((sum, item) => sum + item.totalUnitCost * item.quantity, 0);
  const saleTotal = items.reduce((sum, item) => sum + item.marketPrice * item.quantity, 0);
  const profit = items.reduce((sum, item) => sum + item.profitValue * item.quantity, 0);
  return {
    totalSkus: items.length,
    totalQuantity,
    stockCost,
    saleTotal,
    profit,
    averageMargin: saleTotal > 0 ? (profit / saleTotal) * 100 : 0
  };
}

function analyzePurchase(items: ReturnType<typeof mapItem>[]) {
  const purchaseTotal = items.reduce((sum, item) => sum + item.purchaseUnit * item.quantity, 0);
  const freightTotal = items.reduce((sum, item) => sum + item.freightUnit * item.quantity, 0);
  const icmsTotal = items.reduce((sum, item) => sum + item.icmsValue * item.quantity, 0);
  const salesTaxTotal = items.reduce((sum, item) => sum + item.salesTaxValue * item.quantity, 0);
  const completeCost = items.reduce((sum, item) => sum + item.totalUnitCost * item.quantity, 0);
  const saleTotal = items.reduce((sum, item) => sum + item.marketPrice * item.quantity, 0);
  const profit = saleTotal - completeCost;
  const averageMargin = saleTotal > 0 ? (profit / saleTotal) * 100 : 0;
  const targetMargin = saleTotal > 0
    ? items.reduce((sum, item) => sum + item.marginPercent * item.marketPrice * item.quantity, 0) / saleTotal
    : 0;
  const belowTarget = items.filter((item) => item.profitPercent + 0.05 < item.marginPercent).length;
  const freightShare = purchaseTotal > 0 ? (freightTotal / purchaseTotal) * 100 : 0;
  const conclusion = belowTarget > 0
    ? `${belowTarget} de ${items.length} produto(s) ficaram abaixo da margem desejada. Revise o valor de mercado desses itens antes da compra. O frete representa ${freightShare.toFixed(2)}% do valor liquido dos produtos.`
    : `A compra atende a margem desejada: margem media de ${averageMargin.toFixed(2)}% para uma meta ponderada de ${targetMargin.toFixed(2)}%. O frete representa ${freightShare.toFixed(2)}% do valor liquido dos produtos.`;

  return {
    purchaseTotal,
    freightTotal,
    icmsTotal,
    salesTaxTotal,
    completeCost,
    saleTotal,
    profit,
    averageMargin,
    belowTarget,
    conclusion
  };
}

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const text = String(value ?? "");
    return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers.join(";"), ...rows.map((row) => headers.map((header) => escape(row[header])).join(";"))].join("\n");
}

type AuditWriter = {
  query: (text: string, values?: unknown[]) => Promise<unknown>;
};

async function writeAudit(
  queryable: AuditWriter,
  event: {
    batchId?: string;
    itemId?: string;
    action: "import" | "edit" | "export" | "delete";
    user: AuthUser;
    details?: Record<string, unknown>;
  }
) {
  await queryable.query(
    `INSERT INTO audit_events(batch_id, item_id, action, user_sub, user_name, details)
     VALUES($1,$2,$3,$4,$5,$6)`,
    [
      event.batchId || null,
      event.itemId || null,
      event.action,
      event.user.sub,
      event.user.name,
      JSON.stringify(event.details || {})
    ]
  );
}

migrate().then(() => {
  app.listen(config.port, () => console.log(`Precificacao API on ${config.port}`));
});
