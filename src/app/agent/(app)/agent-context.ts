import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { requireArea, type SessionUser } from "@/lib/auth";
import { asUser } from "@/lib/db";

export type AgentCtx = {
  user: SessionUser;
  agent: { id: string; name: string; type: string; status: string; referral_code: string; referral_active: boolean; last_working_day: string | null; portal_locked_at: string | null } | null;
  readOnly: boolean;   // resigned and past last working day: statements only (Spec 7.13)
  canOrder: boolean;
  canRefer: boolean;
};

/** The logged-in agent (Spec 7.14). Locked agents see only the "locked" page. */
export const getAgentCtx = cache(async (): Promise<AgentCtx> => {
  const user = await requireArea("agent");
  const [a] = await asUser(user.id, (tx) => tx`
    select a.id, a.name, a.type, a.status, a.referral_code, a.referral_active, a.last_working_day::text as last_working_day,
           a.portal_locked_at, (a.status = 'resigned' and a.last_working_day < app.today()) as read_only
    from app.agent_me() a where a.id is not null`);
  if (!a) return { user, agent: null, readOnly: true, canOrder: false, canRefer: false };
  const readOnly = Boolean(a.read_only) || a.status === "inactive";
  return {
    user,
    agent: { id: String(a.id), name: String(a.name), type: String(a.type), status: String(a.status), referral_code: String(a.referral_code),
      referral_active: Boolean(a.referral_active), last_working_day: (a.last_working_day as string) ?? null, portal_locked_at: (a.portal_locked_at as string) ?? null },
    readOnly,
    canOrder: a.status === "active" && user.perms.fields.ag_act_order === "on",
    canRefer: a.status === "active" && Boolean(a.referral_active) && user.perms.fields.ag_act_refer === "on",
  };
});

export async function requireAgent(opts: { order?: boolean; refer?: boolean } = {}) {
  const ctx = await getAgentCtx();
  if (!ctx.agent || ctx.agent.portal_locked_at) redirect("/agent");
  if (opts.order && !ctx.canOrder) redirect("/agent");
  if (opts.refer && !ctx.canRefer) redirect("/agent");
  return ctx as AgentCtx & { agent: NonNullable<AgentCtx["agent"]> };
}
