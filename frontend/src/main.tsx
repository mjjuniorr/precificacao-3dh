import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Download, FileUp, History, LogIn, LogOut, RefreshCw, Save, Search, X } from "lucide-react";
import { ApiError, api, downloadExport, setAccessToken, type ImportBatch, type PricingItem, type SessionUser, type Summary } from "./lib/api";
import { login, logout, restoreUser } from "./lib/auth";
import "./style.css";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
type NumericInput = number | "";

function App() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    restoreUser()
      .then(async (oidcUser) => {
        if (!oidcUser || oidcUser.expired) return;
        setAccessToken(oidcUser.access_token);
        const result = await api<{ user: SessionUser }>("/api/me");
        setSession(result.user);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <main className="login-shell"><RefreshCw className="spin" /> Carregando acesso...</main>;
  }

  if (!session) {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <div className="brand">3DH</div>
          <h1>Sistema Precificacao</h1>
          <p>Use sua conta corporativa do Portal 3DH.</p>
          {error && <p className="error">{error}</p>}
          <button className="primary" onClick={() => login()}>
            <LogIn size={18} /> Entrar com Portal 3DH
          </button>
        </section>
      </main>
    );
  }

  if (!session.permissions.includes("precificacao:view")) {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <div className="brand">3DH</div>
          <h1>Acesso nao autorizado</h1>
          <p>Seu usuario nao possui permissao para visualizar o Sistema de Precificacao.</p>
          <button className="ghost" onClick={() => logout()}><LogOut size={18} /> Sair</button>
        </section>
      </main>
    );
  }

  return <Workspace session={session} onLogout={() => logout()} />;
}

function Workspace({ session, onLogout }: { session: SessionUser; onLogout: () => void }) {
  const [files, setFiles] = useState<FileList | null>(null);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [batchId, setBatchId] = useState("");
  const [items, setItems] = useState<PricingItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [noteSearch, setNoteSearch] = useState("");
  const [duplicate, setDuplicate] = useState<{
    accessKey: string;
    number: string;
    supplier: string;
    supplierTaxId: string;
    batchId: string;
    versionNo: number;
    createdAt: string;
    createdBy: string;
  } | null>(null);
  const [params, setParams] = useState<{
    freight: NumericInput;
    freightMode: string;
    otherCosts: NumericInput;
    otherCostsMode: string;
    icmsPercent: NumericInput;
    salesTaxPercent: NumericInput;
    marginPercent: NumericInput;
  }>({
    freight: "",
    freightMode: "total",
    otherCosts: "",
    otherCostsMode: "total",
    icmsPercent: "",
    salesTaxPercent: "",
    marginPercent: 30
  });
  const canImport = session.permissions.includes("precificacao:import");
  const canEdit = session.permissions.includes("precificacao:edit");
  const canExport = session.permissions.includes("precificacao:export");

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory(filters = { supplier: supplierSearch, number: noteSearch }) {
    const query = new URLSearchParams();
    if (filters.supplier.trim()) query.set("supplier", filters.supplier.trim());
    if (filters.number.trim()) query.set("number", filters.number.trim());
    const result = await api<ImportBatch[]>(`/api/imports${query.size ? `?${query}` : ""}`);
    setBatches(result);
    if (!batchId && result[0]) loadItems(result[0].id);
  }

  async function loadItems(id: string) {
    const result = await api<{ items: PricingItem[]; summary: Summary }>(`/api/imports/${id}/items`);
    setBatchId(id);
    setItems(result.items);
    setSummary(result.summary);
  }

  async function processUpload(duplicateAction?: "version") {
    if (!files?.length) return setMessage("Selecione um ou mais XMLs.");
    setLoading(true);
    setMessage("");
    const form = new FormData();
    Array.from(files).forEach((file) => form.append("files", file));
    Object.entries(params).forEach(([key, value]) => form.append(key, String(value === "" ? 0 : value)));
    if (duplicateAction) form.append("duplicateAction", duplicateAction);
    try {
      const result = await api<{ batchId: string; items: PricingItem[]; summary: Summary; errors: string[] }>("/api/imports", {
        method: "POST",
        body: form
      });
      setBatchId(result.batchId);
      setItems(result.items);
      setSummary(result.summary);
      setMessage(result.errors.length ? result.errors.join(" | ") : "XML importado com sucesso.");
      setDuplicate(null);
      await loadHistory();
    } catch (err) {
      if (err instanceof ApiError && err.body.code === "DUPLICATE_NFE" && err.body.duplicates?.[0]) {
        setDuplicate(err.body.duplicates[0]);
        setMessage("");
      } else {
        setMessage((err as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function uploadXml(event: React.FormEvent) {
    event.preventDefault();
    await processUpload();
  }

  async function updateItem(id: string, patch: Partial<PricingItem>) {
    const updated = await api<PricingItem>(`/api/items/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    });
    const next = items.map((item) => (item.id === id ? updated : item));
    setItems(next);
    setSummary(makeSummary(next));
    await loadHistory();
  }

  const selectedBatch = useMemo(() => batches.find((batch) => batch.id === batchId), [batches, batchId]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <span className="brand-small">3DH Manaus</span>
          <h1>Precificacao de Produtos por NF-e</h1>
          <small className="current-user">{session.name}{session.email ? ` · ${session.email}` : ""}</small>
        </div>
        <button className="ghost" onClick={onLogout}>
          <LogOut size={18} /> Sair
        </button>
      </header>

      <section className="work-grid">
        {canImport && <form className="panel upload-panel" onSubmit={uploadXml}>
          <div className="panel-title">
            <FileUp size={20} /> Importar XML
          </div>
          <input className="file-input" type="file" accept=".xml,text/xml" multiple onChange={(event) => setFiles(event.target.files)} />
          <div className="param-grid">
            <NumberField label="Frete" value={params.freight} onChange={(freight) => setParams({ ...params, freight })} />
            <SelectField label="Tipo frete" value={params.freightMode} onChange={(freightMode) => setParams({ ...params, freightMode })} />
            <NumberField label="Outros custos" value={params.otherCosts} onChange={(otherCosts) => setParams({ ...params, otherCosts })} />
            <SelectField label="Tipo custos" value={params.otherCostsMode} onChange={(otherCostsMode) => setParams({ ...params, otherCostsMode })} />
            <NumberField label="ICMS estimado %" value={params.icmsPercent} onChange={(icmsPercent) => setParams({ ...params, icmsPercent })} />
            <NumberField label="Imposto venda %" value={params.salesTaxPercent} onChange={(salesTaxPercent) => setParams({ ...params, salesTaxPercent })} />
            <NumberField label="Margem desejada %" value={params.marginPercent} onChange={(marginPercent) => setParams({ ...params, marginPercent })} />
          </div>
          <button className="primary" disabled={loading}>
            {loading ? <RefreshCw className="spin" size={18} /> : <FileUp size={18} />} Processar NF-e
          </button>
          {message && <p className="notice">{message}</p>}
        </form>}

        <aside className="panel history-panel">
          <div className="panel-title">
            <History size={20} /> Historico
          </div>
          <div className="history-search">
            <label>
              Fornecedor ou CNPJ
              <input value={supplierSearch} onChange={(event) => setSupplierSearch(event.target.value)} />
            </label>
            <label>
              Numero da NF-e
              <input value={noteSearch} onChange={(event) => setNoteSearch(event.target.value)} />
            </label>
            <div className="history-search-actions">
              <button className="ghost" onClick={() => loadHistory()}>
                <Search size={16} /> Consultar
              </button>
              <button
                className="icon-button neutral"
                title="Limpar filtros"
                onClick={() => {
                  setSupplierSearch("");
                  setNoteSearch("");
                  loadHistory({ supplier: "", number: "" });
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="history-list">
            {batches.map((batch) => (
              <button key={batch.id} className={batch.id === batchId ? "history active" : "history"} onClick={() => loadItems(batch.id)}>
                <strong>{batch.supplier || "Fornecedor nao identificado"}</strong>
                <span>NF {batch.note_number || "-"} · Versao {batch.version_no}</span>
                <small>{new Date(batch.created_at).toLocaleString("pt-BR")} · {batch.created_by}</small>
              </button>
            ))}
            {!batches.length && <p className="history-empty">Nenhuma precificacao encontrada.</p>}
          </div>
        </aside>
      </section>

      <SummaryBar summary={summary} />

      <section className="table-section">
        <div className="table-actions">
          <div>
            <h2>Tabela de precificacao</h2>
            {selectedBatch && (
              <span>
                {selectedBatch.supplier} · NF {selectedBatch.note_number} · Versao {selectedBatch.version_no}
                {" · "}Criada por {selectedBatch.created_by} em {new Date(selectedBatch.created_at).toLocaleString("pt-BR")}
                {" · "}Ultima alteracao por {selectedBatch.updated_by} em {new Date(selectedBatch.updated_at).toLocaleString("pt-BR")}
              </span>
            )}
          </div>
          <div className="export-actions">
            {canExport && <ExportButton batchId={batchId} format="csv" />}
            {canExport && <ExportButton batchId={batchId} format="xlsx" />}
          </div>
        </div>
        <PricingTable items={items} onUpdate={updateItem} canEdit={canEdit} />
        <PurchaseAnalysis items={items} />
      </section>
      {duplicate && (
        <DuplicateDialog
          duplicate={duplicate}
          onOpen={() => {
            loadItems(duplicate.batchId);
            setDuplicate(null);
            setMessage("Precificacao existente aberta para alteracao.");
          }}
          onVersion={() => processUpload("version")}
          onCancel={() => setDuplicate(null)}
        />
      )}
    </main>
  );
}

function DuplicateDialog({
  duplicate,
  onOpen,
  onVersion,
  onCancel
}: {
  duplicate: {
    number: string;
    supplier: string;
    batchId: string;
    versionNo: number;
    createdAt: string;
    createdBy: string;
  };
  onOpen: () => void;
  onVersion: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="duplicate-dialog" role="dialog" aria-modal="true" aria-labelledby="duplicate-title">
        <span className="dialog-eyebrow">NF-e ja utilizada</span>
        <h2 id="duplicate-title">Esta nota ja possui uma precificacao</h2>
        <p>
          {duplicate.supplier} · NF {duplicate.number} · Versao {duplicate.versionNo}
        </p>
        <small>
          Criada por {duplicate.createdBy} em {new Date(duplicate.createdAt).toLocaleString("pt-BR")}
        </small>
        <div className="dialog-actions">
          <button className="ghost" onClick={onCancel}>Cancelar</button>
          <button className="ghost" onClick={onOpen}>Abrir e alterar existente</button>
          <button className="primary compact" onClick={onVersion}>Criar nova versao</button>
        </div>
      </section>
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: NumericInput; onChange: (value: NumericInput) => void }) {
  return (
    <label>
      {label}
      <input
        type="number"
        min="0"
        step="0.01"
        value={value}
        placeholder="0,00"
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))}
      />
    </label>
  );
}

function SelectField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="total">Total da nota</option>
        <option value="unit">Unitario por produto</option>
      </select>
    </label>
  );
}

function SummaryBar({ summary }: { summary: Summary | null }) {
  const cards = [
    ["SKUs", summary?.totalSkus ?? 0],
    ["Qtd. comprada", number.format(summary?.totalQuantity ?? 0)],
    ["Custo completo estimado da venda", money.format(summary?.stockCost ?? 0)],
    ["Venda no mercado", money.format(summary?.saleTotal ?? 0)],
    ["Lucro potencial", money.format(summary?.profit ?? 0)],
    ["Margem media", `${number.format(summary?.averageMargin ?? 0)}%`]
  ];
  return (
    <section className="summary-grid">
      {cards.map(([label, value]) => (
        <div className="summary-card" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </section>
  );
}

function PricingTable({ items, onUpdate, canEdit }: { items: PricingItem[]; onUpdate: (id: string, patch: Partial<PricingItem>) => void; canEdit: boolean }) {
  return (
    <div className="table-wrap">
      <table>
        <colgroup>
          <col className="col-sku" />
          <col className="col-product" />
          <col className="col-quantity" />
          <col className="col-money" />
          <col className="col-input" />
          <col className="col-input" />
          <col className="col-percent" />
          <col className="col-percent" />
          <col className="col-input" />
          <col className="col-money" />
          <col className="col-input-wide" />
          <col className="col-money-wide" />
          <col className="col-money" />
          <col className="col-margin" />
          <col className="col-action" />
        </colgroup>
        <thead>
          <tr>
            {["SKU", "Produto", "Qtd", "Compra liquida", "Frete unitario", "Outros", "ICMS % / estimado R$", "Imp. venda % / R$", "Margem desejada", "Preco sugerido", "Valor de mercado", "Custo completo estimado da venda", "Lucro", "Margem real", ""].map((head) => (
              <th key={head}>{head}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <EditableRow key={item.id} item={item} onUpdate={onUpdate} canEdit={canEdit} />
          ))}
        </tbody>
      </table>
      {!items.length && <div className="empty">Importe um XML de NF-e para iniciar.</div>}
    </div>
  );
}

function EditableRow({ item, onUpdate, canEdit }: { item: PricingItem; onUpdate: (id: string, patch: Partial<PricingItem>) => void; canEdit: boolean }) {
  const [draft, setDraft] = useState(item);
  useEffect(() => setDraft(item), [item]);

  function change<K extends keyof PricingItem>(key: K, value: PricingItem[K]) {
    setDraft({ ...draft, [key]: value });
  }

  return (
    <tr>
      <td>{item.sku}</td>
      <td className="product-cell">{item.description}<small>NCM {item.ncm || "-"}</small></td>
      <td className="num-cell">{number.format(item.quantity)}</td>
      <td className="num-cell">{money.format(item.purchaseUnit)}</td>
      <td><input className="table-number" disabled={!canEdit} type="number" step="0.01" value={draft.freightUnit} onFocus={(event) => event.currentTarget.select()} onChange={(event) => change("freightUnit", Number(event.target.value))} /></td>
      <td><input className="table-number" disabled={!canEdit} type="number" step="0.01" value={draft.otherUnit} onFocus={(event) => event.currentTarget.select()} onChange={(event) => change("otherUnit", Number(event.target.value))} /></td>
      <td><PercentInput disabled={!canEdit} value={draft.icmsPercent} onChange={(value) => change("icmsPercent", value)} detail={item.icmsValue} /></td>
      <td><PercentInput disabled={!canEdit} value={draft.salesTaxPercent} onChange={(value) => change("salesTaxPercent", value)} detail={item.salesTaxValue} /></td>
      <td><input className="table-number" disabled={!canEdit} type="number" step="0.01" value={draft.marginPercent} onFocus={(event) => event.currentTarget.select()} onChange={(event) => change("marginPercent", Number(event.target.value))} /></td>
      <td className="num-cell price">{money.format(item.suggestedPrice)}</td>
      <td><input className="table-number market-input" disabled={!canEdit} type="number" step="0.01" value={draft.marketPrice} onFocus={(event) => event.currentTarget.select()} onChange={(event) => change("marketPrice", Number(event.target.value))} /></td>
      <td className="num-cell">{money.format(item.totalUnitCost)}</td>
      <td className="num-cell">{money.format(item.profitValue)}</td>
      <td className="num-cell">{number.format(item.profitPercent)}%</td>
      <td>
        <button className="icon-button" disabled={!canEdit} title={canEdit ? "Salvar item" : "Sem permissao para editar"} onClick={() => onUpdate(item.id, draft)}>
          <Save size={16} />
        </button>
      </td>
    </tr>
  );
}

function PercentInput({ value, detail, onChange, disabled }: { value: number; detail: number; onChange: (value: number) => void; disabled?: boolean }) {
  return (
    <div className="percent-field">
      <input className="table-number" disabled={disabled} type="number" step="0.01" value={value} onFocus={(event) => event.currentTarget.select()} onChange={(event) => onChange(Number(event.target.value))} />
      <small>{money.format(detail)}</small>
    </div>
  );
}

function PurchaseAnalysis({ items }: { items: PricingItem[] }) {
  if (!items.length) return null;
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
    ? `${belowTarget} de ${items.length} produto(s) ficaram abaixo da margem desejada. Revise o valor de mercado desses itens antes da compra.`
    : `A compra atende à margem desejada: margem média de ${number.format(averageMargin)}% para uma meta ponderada de ${number.format(targetMargin)}%.`;

  const metrics = [
    ["Compra liquida", money.format(purchaseTotal)],
    ["Frete total", money.format(freightTotal)],
    ["ICMS estimado", money.format(icmsTotal)],
    ["Imposto de venda", money.format(salesTaxTotal)],
    ["Custo completo", money.format(completeCost)],
    ["Venda projetada", money.format(saleTotal)],
    ["Lucro potencial", money.format(profit)],
    ["Peso do frete", `${number.format(freightShare)}%`]
  ];

  return (
    <section className="purchase-analysis">
      <div className="analysis-heading">
        <div>
          <span>Resumo da compra</span>
          <h3>Conclusao da precificacao</h3>
        </div>
        <strong>{number.format(averageMargin)}% de margem media</strong>
      </div>
      <dl className="analysis-grid">
        {metrics.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className={belowTarget > 0 ? "analysis-conclusion warning" : "analysis-conclusion"}>
        {conclusion} O frete representa {number.format(freightShare)}% do valor líquido dos produtos.
      </p>
    </section>
  );
}

function ExportButton({ batchId, format }: { batchId: string; format: "csv" | "xlsx" }) {
  if (!batchId) {
    return <button className="ghost" disabled><Download size={16} /> {format.toUpperCase()}</button>;
  }
  return (
    <button className="ghost" onClick={() => downloadExport(batchId, format)}>
      <Download size={16} /> {format.toUpperCase()}
    </button>
  );
}

function makeSummary(items: PricingItem[]): Summary {
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

createRoot(document.getElementById("root")!).render(<App />);
