import { supabase } from "./supabase";
import { writeAuditLog } from "./audit";

/**
 * 갱신 승인 처리
 * - renewal_history에 기록
 * - contracts 테이블 업데이트 (새 종료일, 갱신 차수 증가, 상태 리셋)
 */
export const approveRenewal = async (contract, { newEndDate, newCost, notes, decidedBy }) => {
  const renewalNumber = (contract.renewal_count || 0) + 1;

  // 1. renewal_history 기록
  const { error: histError } = await supabase.from("renewal_history").insert({
    contract_id: contract.id,
    renewal_number: renewalNumber,
    decision: "approved",
    previous_end_date: contract.end_date,
    new_end_date: newEndDate,
    new_annual_cost: newCost || contract.annual_cost,
    decided_by: decidedBy || "",
    notes: notes || "",
  });
  if (histError) return { error: histError };

  // 2. contracts 업데이트
  const updates = {
    end_date: newEndDate,
    renewal_status: "approved",
    renewal_count: renewalNumber,
    renewal_decided_at: new Date().toISOString(),
    renewal_decided_by: decidedBy || "",
    renewal_notes: notes || "",
    updated_at: new Date().toISOString(),
  };
  if (newCost && newCost !== contract.annual_cost) {
    updates.annual_cost = newCost;
  }

  const { error: upError } = await supabase
    .from("contracts")
    .update(updates)
    .eq("id", contract.id);
  if (upError) return { error: upError };

  // 3. audit log
  const changes = [
    { field_name: "renewal_status", old_value: contract.renewal_status, new_value: "approved" },
    { field_name: "end_date", old_value: contract.end_date, new_value: newEndDate },
    { field_name: "renewal_count", old_value: String(contract.renewal_count || 0), new_value: String(renewalNumber) },
  ];
  if (newCost && newCost !== contract.annual_cost) {
    changes.push({ field_name: "annual_cost", old_value: String(contract.annual_cost), new_value: String(newCost) });
  }
  await writeAuditLog(contract.id, "update", changes, decidedBy || "");

  return { error: null, renewalNumber };
};

/**
 * 갱신 해지(거절) 처리
 * - renewal_history에 기록
 * - contracts 테이블 갱신 상태 업데이트
 */
export const cancelRenewal = async (contract, { notes, decidedBy }) => {
  const renewalNumber = (contract.renewal_count || 0) + 1;

  // 1. renewal_history 기록
  const { error: histError } = await supabase.from("renewal_history").insert({
    contract_id: contract.id,
    renewal_number: renewalNumber,
    decision: "cancelled",
    previous_end_date: contract.end_date,
    new_end_date: null,
    new_annual_cost: null,
    decided_by: decidedBy || "",
    notes: notes || "",
  });
  if (histError) return { error: histError };

  // 2. contracts 업데이트
  const { error: upError } = await supabase
    .from("contracts")
    .update({
      renewal_status: "cancelled",
      renewal_count: renewalNumber,
      renewal_decided_at: new Date().toISOString(),
      renewal_decided_by: decidedBy || "",
      renewal_notes: notes || "",
      updated_at: new Date().toISOString(),
    })
    .eq("id", contract.id);
  if (upError) return { error: upError };

  // 3. audit log
  await writeAuditLog(contract.id, "update", [
    { field_name: "renewal_status", old_value: contract.renewal_status, new_value: "cancelled" },
  ], decidedBy || "");

  return { error: null };
};

/**
 * 갱신 검토 상태로 전환 (Cron에서 호출)
 */
export const markPendingReview = async (contractId) => {
  const { error } = await supabase
    .from("contracts")
    .update({
      renewal_status: "pending_review",
      updated_at: new Date().toISOString(),
    })
    .eq("id", contractId);
  return { error };
};

/**
 * 갱신 이력 조회
 */
export const loadRenewalHistory = async (contractId) => {
  const { data, error } = await supabase
    .from("renewal_history")
    .select("*")
    .eq("contract_id", contractId)
    .order("created_at", { ascending: false });
  return { data: data || [], error };
};

/**
 * 갱신 상태 리셋 (승인 후 다음 주기를 위해)
 */
export const resetRenewalStatus = async (contractId) => {
  const { error } = await supabase
    .from("contracts")
    .update({
      renewal_status: "none",
      renewal_decided_at: null,
      renewal_decided_by: "",
      renewal_notes: "",
      updated_at: new Date().toISOString(),
    })
    .eq("id", contractId);
  return { error };
};
