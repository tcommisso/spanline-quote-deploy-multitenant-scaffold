import { useState, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, ArrowRight, Lock, Unlock, CheckCircle2, Clock, AlertTriangle, Plus, Settings2 } from "lucide-react";
import { toast } from "sonner";

// ─── Default Workflow Templates ─────────────────────────────────────────────
// These are the configurable gate definitions. Each gate has conditions that must be met before advancing.

interface GateDefinition {
  gateNumber: number;
  name: string;
  description: string;
  requiredConditions: string[];
  autoTasks: string[];
}

const DEFAULT_GATES: Record<string, GateDefinition[]> = {
  NSW_DA: [
    {
      gateNumber: 1,
      name: "Pre-Lodgement",
      description: "Prepare all documents and conduct pre-lodgement meeting if required",
      requiredConditions: ["All required documents uploaded", "Pre-lodgement meeting completed (if applicable)", "BASIX certificate obtained"],
      autoTasks: ["Obtain survey plan", "Prepare architectural plans", "Draft Statement of Environmental Effects", "Obtain BASIX certificate", "Schedule pre-lodgement meeting"],
    },
    {
      gateNumber: 2,
      name: "Lodgement",
      description: "Submit DA to Council with all supporting documents",
      requiredConditions: ["DA form completed", "All documents at 'approved' status", "Application fees paid", "Owner consent obtained"],
      autoTasks: ["Complete DA application form", "Pay application fees", "Lodge via NSW Planning Portal", "Confirm receipt from Council"],
    },
    {
      gateNumber: 3,
      name: "Assessment",
      description: "Council assessment period — respond to RFIs and additional information requests",
      requiredConditions: ["All RFIs responded to", "No outstanding additional information requests", "Referral responses received"],
      autoTasks: ["Monitor Council portal for updates", "Respond to RFIs within timeframe", "Coordinate with referral agencies"],
    },
    {
      gateNumber: 4,
      name: "Determination",
      description: "Council issues determination — consent granted or refused",
      requiredConditions: ["Determination notice received", "Conditions of consent reviewed", "Appeal period noted"],
      autoTasks: ["Review determination notice", "Extract conditions of consent", "Note appeal deadline", "Advise client of outcome"],
    },
    {
      gateNumber: 5,
      name: "Post-Consent",
      description: "Satisfy pre-commencement conditions and obtain Construction Certificate",
      requiredConditions: ["Pre-commencement conditions satisfied", "Construction Certificate obtained", "All fees/levies paid"],
      autoTasks: ["Satisfy pre-commencement conditions", "Apply for Construction Certificate", "Pay Section 94 contributions", "Notify Council of CC appointment"],
    },
    {
      gateNumber: 6,
      name: "Construction",
      description: "Construction phase — inspections, ongoing conditions, and final certificate",
      requiredConditions: ["All mandatory inspections passed", "Ongoing conditions maintained", "Occupation Certificate obtained"],
      autoTasks: ["Schedule mandatory inspections", "Maintain site compliance", "Apply for Occupation Certificate", "Final inspection"],
    },
  ],
  NSW_CDC: [
    {
      gateNumber: 1,
      name: "Pre-Lodgement",
      description: "Prepare CDC application and supporting documents",
      requiredConditions: ["All required documents uploaded", "BASIX certificate obtained", "Compliance with all SEPP standards confirmed"],
      autoTasks: ["Obtain survey plan", "Prepare architectural plans", "Obtain BASIX certificate", "Confirm SEPP compliance"],
    },
    {
      gateNumber: 2,
      name: "Lodgement",
      description: "Submit CDC application to Accredited Certifier",
      requiredConditions: ["Application form completed", "All documents at 'approved' status", "Certifier fees paid"],
      autoTasks: ["Complete CDC application form", "Pay certifier fees", "Lodge with Accredited Certifier", "Notify Council of CDC application"],
    },
    {
      gateNumber: 3,
      name: "Assessment",
      description: "Certifier assesses compliance with all relevant standards",
      requiredConditions: ["All RFIs responded to", "Compliance confirmed for all standards"],
      autoTasks: ["Respond to certifier queries", "Provide additional information if requested"],
    },
    {
      gateNumber: 4,
      name: "Determination",
      description: "CDC issued by Accredited Certifier",
      requiredConditions: ["CDC issued", "Conditions noted", "Commencement date set"],
      autoTasks: ["Review CDC conditions", "Note 2-day notification requirement", "Set commencement date"],
    },
    {
      gateNumber: 5,
      name: "Construction",
      description: "Construction phase with mandatory inspections",
      requiredConditions: ["All mandatory inspections passed", "Occupation Certificate obtained"],
      autoTasks: ["Schedule critical stage inspections", "Maintain compliance", "Apply for Occupation Certificate"],
    },
  ],
  ACT_DA_MERIT: [
    {
      gateNumber: 1,
      name: "Pre-Lodgement",
      description: "Prepare DA and conduct pre-application meeting",
      requiredConditions: ["All required documents uploaded", "Pre-application meeting completed (if applicable)"],
      autoTasks: ["Obtain survey plan", "Prepare architectural plans", "Draft planning report", "Schedule pre-application meeting"],
    },
    {
      gateNumber: 2,
      name: "Lodgement",
      description: "Submit DA to EPSDD",
      requiredConditions: ["DA form completed", "All documents uploaded", "Application fees paid"],
      autoTasks: ["Complete DA form", "Pay application fees", "Lodge via ACT Planning portal"],
    },
    {
      gateNumber: 3,
      name: "Assessment",
      description: "EPSDD assessment and public notification",
      requiredConditions: ["All RFIs responded to", "Public notification period completed", "Entity referrals completed"],
      autoTasks: ["Monitor portal for updates", "Respond to RFIs", "Review public submissions"],
    },
    {
      gateNumber: 4,
      name: "Determination",
      description: "DA decision issued",
      requiredConditions: ["Decision notice received", "Conditions reviewed"],
      autoTasks: ["Review decision notice", "Extract conditions", "Note reconsideration deadline"],
    },
    {
      gateNumber: 5,
      name: "Building Approval",
      description: "Obtain Building Approval from certifier",
      requiredConditions: ["BA application lodged", "BA issued", "Pre-commencement conditions satisfied"],
      autoTasks: ["Apply for Building Approval", "Satisfy pre-commencement conditions", "Obtain BA"],
    },
    {
      gateNumber: 6,
      name: "Construction",
      description: "Construction phase with inspections",
      requiredConditions: ["All inspections passed", "Certificate of Occupancy/Use obtained"],
      autoTasks: ["Schedule inspections", "Apply for Certificate of Use", "Final inspection"],
    },
  ],
};

export default function ApprovalsWorkflow() {
  const [, params] = useRoute("/approvals/projects/:id/workflow");
  const [, navigate] = useLocation();
  const projectId = Number(params?.id);

  const { data: project } = trpc.approvals.projects.get.useQuery({ id: projectId });
  const { data: tasks } = trpc.approvals.tasks.list.useQuery({ projectId });
  const utils = trpc.useUtils();

  const advanceGate = trpc.approvals.projects.update.useMutation({
    onSuccess: () => {
      toast.success("Gate advanced");
      utils.approvals.projects.get.invalidate({ id: projectId });
      utils.approvals.tasks.list.invalidate({ projectId });
    },
    onError: (err) => toast.error(err.message),
  });

  const generateTasks = trpc.approvals.tasks.generateFromGate.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} tasks generated`);
      utils.approvals.tasks.list.invalidate({ projectId });
    },
    onError: (err) => toast.error(err.message),
  });

  const currentGate = project?.currentGate || 1;
  const pathway = project?.recommendedPathway || "NSW_DA";
  const gates = DEFAULT_GATES[pathway] || DEFAULT_GATES["NSW_DA"];

  // Check if current gate conditions are met
  const currentGateDef = gates.find((g) => g.gateNumber === currentGate);
  const gateTasks = (tasks || []).filter((t: any) => t.gateNumber === currentGate);
  const completedGateTasks = gateTasks.filter((t: any) => t.status === "completed");
  const gateProgress = gateTasks.length > 0 ? (completedGateTasks.length / gateTasks.length) * 100 : 0;
  const canAdvance = gateTasks.length > 0 && completedGateTasks.length === gateTasks.length;

  const handleAdvanceGate = () => {
    if (!canAdvance) {
      toast.error("All tasks in the current gate must be completed before advancing");
      return;
    }
    advanceGate.mutate({
      id: projectId,
      data: { currentGate: currentGate + 1 },
    });
  };

  const handleGenerateTasks = (gateNumber: number) => {
    const gateDef = gates.find((g) => g.gateNumber === gateNumber);
    if (!gateDef) return;
    generateTasks.mutate({
      projectId,
      gateNumber,
      tasks: gateDef.autoTasks.map((title) => ({
        title,
        taskType: "gate_check" as const,
        gateNumber,
      })),
    });
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Button variant="ghost" onClick={() => navigate(`/approvals/projects/${projectId}`)} className="mb-4">
        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Project
      </Button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Workflow Engine</h1>
          <p className="text-muted-foreground">
            {project?.name || "Loading..."} — {pathway.replace(/_/g, " ")}
          </p>
        </div>
        <Badge variant="outline" className="text-sm">
          Gate {currentGate} of {gates.length}
        </Badge>
      </div>

      {/* Gate Timeline */}
      <div className="relative mb-8">
        <div className="flex items-center justify-between">
          {gates.map((gate, i) => {
            const isCompleted = gate.gateNumber < currentGate;
            const isCurrent = gate.gateNumber === currentGate;
            const isLocked = gate.gateNumber > currentGate;

            return (
              <div key={gate.gateNumber} className="flex flex-col items-center flex-1">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                  isCompleted ? "bg-green-500 border-green-500 text-white" :
                  isCurrent ? "bg-primary border-primary text-primary-foreground" :
                  "bg-muted border-muted-foreground/30 text-muted-foreground"
                }`}>
                  {isCompleted ? <CheckCircle2 className="h-5 w-5" /> :
                   isLocked ? <Lock className="h-4 w-4" /> :
                   <span className="text-sm font-bold">{gate.gateNumber}</span>}
                </div>
                <span className={`text-xs mt-1 text-center max-w-[80px] ${isCurrent ? "font-semibold" : "text-muted-foreground"}`}>
                  {gate.name}
                </span>
                {i < gates.length - 1 && (
                  <div className={`absolute h-0.5 top-5 ${isCompleted ? "bg-green-500" : "bg-muted"}`}
                    style={{ left: `${(i + 0.5) * (100 / gates.length)}%`, width: `${100 / gates.length}%` }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Current Gate Detail */}
      {currentGateDef && (
        <Card className="mb-6 border-primary/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Unlock className="h-5 w-5 text-primary" />
                  Gate {currentGate}: {currentGateDef.name}
                </CardTitle>
                <CardDescription>{currentGateDef.description}</CardDescription>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">{Math.round(gateProgress)}% Complete</p>
                <p className="text-xs text-muted-foreground">{completedGateTasks.length}/{gateTasks.length} tasks</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Progress bar */}
            <div className="w-full bg-muted rounded-full h-2">
              <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${gateProgress}%` }} />
            </div>

            {/* Required conditions */}
            <div>
              <h4 className="text-sm font-semibold mb-2">Gate Conditions (must be satisfied to advance)</h4>
              <div className="space-y-1">
                {currentGateDef.requiredConditions.map((cond, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    <span>{cond}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tasks for this gate */}
            {gateTasks.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-3">No tasks generated for this gate yet.</p>
                <Button onClick={() => handleGenerateTasks(currentGate)} disabled={generateTasks.isPending}>
                  <Plus className="h-4 w-4 mr-1" />
                  {generateTasks.isPending ? "Generating..." : "Generate Tasks from Template"}
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Tasks</h4>
                {gateTasks.map((task: any) => (
                  <div key={task.id} className="flex items-center gap-2 p-2 rounded border">
                    {task.status === "completed" ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    ) : (
                      <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span className={`text-sm flex-1 ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                      {task.title}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {task.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {/* Advance button */}
            <div className="flex justify-end pt-4 border-t">
              <Button
                onClick={handleAdvanceGate}
                disabled={!canAdvance || advanceGate.isPending || currentGate >= gates.length}
              >
                {advanceGate.isPending ? "Advancing..." : canAdvance ? (
                  <>Advance to Gate {currentGate + 1} <ArrowRight className="h-4 w-4 ml-1" /></>
                ) : (
                  <>Complete all tasks to advance <Lock className="h-4 w-4 ml-1" /></>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Gates Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" /> All Gates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {gates.map((gate) => {
              const isCompleted = gate.gateNumber < currentGate;
              const isCurrent = gate.gateNumber === currentGate;
              const gTasks = (tasks || []).filter((t: any) => t.gateNumber === gate.gateNumber);
              const gCompleted = gTasks.filter((t: any) => t.status === "completed");

              return (
                <div key={gate.gateNumber} className={`p-3 rounded-lg border ${isCurrent ? "border-primary bg-primary/5" : isCompleted ? "border-green-200 bg-green-50" : "border-muted"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isCompleted ? <CheckCircle2 className="h-4 w-4 text-green-500" /> :
                       isCurrent ? <Unlock className="h-4 w-4 text-primary" /> :
                       <Lock className="h-4 w-4 text-muted-foreground" />}
                      <span className="font-medium text-sm">Gate {gate.gateNumber}: {gate.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {gTasks.length > 0 && (
                        <span className="text-xs text-muted-foreground">{gCompleted.length}/{gTasks.length}</span>
                      )}
                      {!isCompleted && !isCurrent && gTasks.length === 0 && (
                        <Button variant="ghost" size="sm" className="text-xs" onClick={() => handleGenerateTasks(gate.gateNumber)}>
                          Generate Tasks
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 ml-6">{gate.description}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
