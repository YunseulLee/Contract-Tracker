import { supabase } from "./supabase";
import { auditFields } from "./constants";

export const fromDB = (row) => ({
  id: row.id, vendor: row.vendor, name: row.name, type: row.type,
  start_date: row.start_date, end_date: row.end_date,
  renewal_date: row.renewal_date, auto_renew: row.auto_renew,
  auto_renew_notice_days: row.auto_renew_notice_days,
  annual_cost: row.annual_cost, currency: row.currency,
  status: row.status, notes: row.notes, studio: row.studio,
  owner_name: row.owner_name, owner_email: row.owner_email,
  wiki_url: row.wiki_url, supplier: row.supplier,
  installment_enabled: row.installment_enabled || false,
  installment_schedule: row.installment_schedule
    ? (typeof row.installment_schedule === "string"
      ? JSON.parse(row.installment_schedule) : row.installment_schedule)
    : [],
  renewal_status: row.renewal_status || "none",
  renewal_count: row.renewal_count || 0,
  renewal_decided_at: row.renewal_decided_at || null,
  renewal_decided_by: row.renewal_decided_by || "",
  renewal_notes: row.renewal_notes || "",
  is_deleted: row.is_deleted || false,
  deleted_at: row.deleted_at || null,
});

export const toDB = (c) => ({
  vendor: c.vendor, name: c.name, type: c.type,
  start_date: c.start_date || null, end_date: c.end_date,
  renewal_date: c.renewal_date || null,
  auto_renew: c.auto_renew || false,
  auto_renew_notice_days: c.auto_renew_notice_days || 30,
  annual_cost: c.annual_cost || 0, currency: c.currency || "USD",
  status: c.status || "active", notes: c.notes || "",
  studio: c.studio || "KRAFTON", owner_name: c.owner_name || "",
  owner_email: c.owner_email || "", wiki_url: c.wiki_url || "",
  supplier: c.supplier || "",
  installment_enabled: c.installment_enabled || false,
  installment_schedule: c.installment_schedule
    ? JSON.stringify(c.installment_schedule) : "[]",
  renewal_status: c.renewal_status || "none",
  renewal_count: c.renewal_count || 0,
  renewal_notes: c.renewal_notes || "",
});

export const writeAuditLog = async (contractId, action, changes = [], changedBy = "") => {
  if (action === "create" || action === "delete" || action === "restore") {
    await supabase.from("audit_log").insert({
      contract_id: contractId, action,
      field_name: null, old_value: null, new_value: null,
      changed_by: changedBy,
    });
    return;
  }
  if (changes.length > 0) {
    const rows = changes.map((ch) => ({
      contract_id: contractId, action,
      field_name: ch.field_name, old_value: ch.old_value,
      new_value: ch.new_value, changed_by: changedBy,
    }));
    await supabase.from("audit_log").insert(rows);
  }
};

export const diffContract = (oldC, newC) => {
  const changes = [];
  auditFields.forEach((f) => {
    let ov = oldC[f], nv = newC[f];
    if (f === "installment_schedule") {
      ov = JSON.stringify(ov || []);
      nv = JSON.stringify(nv || []);
    }
    const ovs = String(ov ?? "");
    const nvs = String(nv ?? "");
    if (ovs !== nvs) changes.push({ field_name: f, old_value: ovs, new_value: nvs });
  });
  return changes;
};
