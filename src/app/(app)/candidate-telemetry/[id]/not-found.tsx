import EmptyState from "@/components/layout/EmptyState";
import Button from "@/components/ui/Button";
import { ROUTES } from "@/lib/routes";
import { T } from "@/lib/i18n";

export default function CandidateNotFound() {
  return (
    <div className="w-full px-gutter-lg py-12">
      <div className="max-w-2xl mx-auto">
        <EmptyState
          icon="search_off"
          title="Candidate not found"
          actions={
            <Button href={ROUTES.candidateTelemetry} icon="arrow_back">
              Back to Candidate Telemetry
            </Button>
          }
        >
          <T>This candidate ID isn&rsquo;t part of run #EXP-LDK-8042. It may have been pruned from the Pareto front.</T>
        </EmptyState>
      </div>
    </div>
  );
}
