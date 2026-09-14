import { requireUser } from "@/lib/session";
import { getHome, getOrganisation } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { Gateway } from "@/components/gateway";
import { routes } from "@/lib/routes";

export const dynamic = "force-dynamic";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Three ways in, and nothing else.
 *
 * Earlier versions of this page reported: nine figures, then four, then three
 * per door plus a worklist. All of it was true and none of it was the first
 * thing anyone needed. What a person wants on opening the app is to know which
 * of the three places they are going, and whether it can wait.
 *
 * Everything that used to be here now lives one click in, where there is room
 * for it and where it is what you came to look at.
 */
export default async function HomePage() {
  const user = await requireUser();
  const [home, org] = await Promise.all([getHome(user.tenantId), getOrganisation(user.tenantId)]);

  const firstName = user.name.split(" ")[0];
  const orgLabel = [org?.name, org?.siteName].filter(Boolean).join(" · ") || "Your organisation";
  const { induction, training, improve } = home;

  const inductionOutstanding = induction.inducting + induction.notStarted;
  const improvements =
    improve.singlePoints + improve.noTrainer + improve.documentsDue +
    improve.pendingAck + improve.reviewsDue;

  return (
    <>
      <PageHeader
        eyebrow={orgLabel}
        title={`Good ${greeting()}, ${firstName}`}
        description="Three things happen here. Pick the one you came for."
      />

      {/*
        Centred in what is left of the window, and capped in width. Three cards
        pinned to the top of a tall screen leave a field of empty canvas under
        them; stretched across an ultrawide one they stop being cards.
      */}
      <div className="p-5 sm:p-7 lg:flex lg:min-h-[calc(100vh-9.5rem)] lg:items-center">
        <div className="mx-auto grid w-full max-w-6xl gap-5 lg:grid-cols-3">
          <Gateway
            href={routes.induction}
            section="induction"
            title="Induction"
            purpose="Bringing someone onto site for the first time, and the checklist they sign before they touch anything."
            value={induction.inducted}
            unit={`of ${induction.people} inducted`}
            bar={induction.people > 0 ? induction.inducted / induction.people : 0}
            status={
              inductionOutstanding === 0
                ? "Everyone is through"
                : `${inductionOutstanding} still to complete`
            }
          />

          <Gateway
            href={routes.training}
            section="training"
            title="Training"
            purpose="Who can run what, who is learning it, and the evidence behind every sign-off."
            value={training.competent}
            unit="competences signed off"
            bar={training.machines > 0 ? training.machinesCovered / training.machines : 0}
            status={`${training.machinesCovered} of ${training.machines} machines have cover`}
          />

          <Gateway
            href={routes.improve}
            section="improve"
            title="Continuous improvement"
            purpose="Where the gaps are: cover that rests on one person, procedures past review, changes nobody has read."
            value={improvements}
            unit={plural(improvements, "thing to put right", "things to put right")}
            status={improvements === 0 ? "Nothing outstanding" : "Most costly first"}
          />
        </div>
      </div>
    </>
  );
}
