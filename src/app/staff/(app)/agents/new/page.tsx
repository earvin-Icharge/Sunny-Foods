import { getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { fieldOn } from "@/lib/perms";
import { PageHeader } from "@/components/ui/PageHeader";
import { AgentForm } from "../AgentForm";

export default async function NewAgent() {
  const user = await requirePerm("internal", "agents", 5);
  const t = await getTranslations("agents");
  const { roles, teams } = await readAs(user, async (tx) => ({
    roles: await tx`select key, name from app.roles where is_agent_role and active and deleted_at is null order by sort`,
    teams: await tx`select id, name from app.teams where deleted_at is null order by name`,
  }));
  return (
    <>
      <PageHeader title={t("add")} back="/staff/agents" />
      <AgentForm agent={null} showRates={fieldOn(user.perms, "commission_rates")}
        roles={roles.map((r) => ({ key: String(r.key), name: String(r.name) }))}
        teams={teams.map((r) => ({ id: String(r.id), name: String(r.name) }))} />
    </>
  );
}
