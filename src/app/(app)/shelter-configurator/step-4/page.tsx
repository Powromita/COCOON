"use client";

import ConfiguratorStepper from "@/components/configurator/ConfiguratorStepper";
import DerivedPanel from "@/components/configurator/DerivedPanel";
import WizardFooter from "@/components/configurator/WizardFooter";
import { useWizard } from "@/components/configurator/WizardProvider";
import { Field, RadioCards, SectionCard } from "@/components/configurator/fields";
import { ECONOMIC_ASSUMPTION_SETS } from "@/lib/configurator/requirements";

export default function ConfiguratorStep4Page() {
  const { draft, update, errors } = useWizard();
  const e = errors.economics;

  return (
    <div className="flex flex-col w-full">
      <ConfiguratorStepper current={4} title="Economic Assumptions" />

      <div className="w-full px-gutter-lg mt-6">
        <div className="max-w-[1720px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 flex flex-col gap-5">
            <SectionCard title="Assumption set" contractKey="economic_assumption_set_id" icon="payments">
              <Field
                label="Price scenario for lifecycle costing"
                error={e.economic_assumption_set_id}
                hint="Each scenario is a versioned assumption set; the exact set ID is stored with the run for audit"
              >
                <RadioCards<string>
                  name="economic_assumption_set_id"
                  value={draft.economic_assumption_set_id}
                  onChange={(v) => update("economic_assumption_set_id", v)}
                  options={ECONOMIC_ASSUMPTION_SETS.map((s) => ({ value: s.id, label: s.label, hint: s.hint }))}
                />
              </Field>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                <span className="font-data text-on-surface">{draft.economic_assumption_set_id}</span>
              </p>
            </SectionCard>
          </div>

          <div className="lg:col-span-4">
            <DerivedPanel
              module="M7 · ECONOMICS"
              items={[
                "Capital cost of each candidate from material and assembly costs",
                "Fuel demand from the conditioned simulation",
                "Airlift and logistics cost for fuel resupply",
                "Lifecycle cost and payback against the legacy baseline",
              ]}
            />
          </div>
        </div>
      </div>

      <WizardFooter step={4} canProceed={Object.keys(e).length === 0} />
    </div>
  );
}
