import { useState, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowLeft, ArrowRight, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";

// ─── Pathway Rules Engine ───────────────────────────────────────────────────
// This is a deterministic rules engine that evaluates answers to produce a pathway recommendation.
// Rules are structured as decision trees per jurisdiction.

interface Question {
  id: string;
  text: string;
  helpText?: string;
  type: "select" | "radio" | "multi";
  options: { value: string; label: string }[];
  condition?: (answers: Record<string, string>) => boolean;
}

interface PathwayResult {
  pathway: string;
  label: string;
  confidence: "high" | "medium" | "low";
  reasoning: string;
  requiredDocuments: string[];
  estimatedTimeline: string;
  estimatedFees: string;
  gates: string[];
}

const NSW_QUESTIONS: Question[] = [
  {
    id: "development_type",
    text: "What type of development is proposed?",
    type: "select",
    options: [
      { value: "new_dwelling", label: "New Dwelling" },
      { value: "addition_alteration", label: "Addition/Alteration to Existing" },
      { value: "outbuilding", label: "Outbuilding (Shed, Garage, Carport)" },
      { value: "pool", label: "Swimming Pool" },
      { value: "deck_pergola", label: "Deck/Pergola/Patio" },
      { value: "retaining_wall", label: "Retaining Wall" },
      { value: "subdivision", label: "Subdivision" },
      { value: "commercial", label: "Commercial/Industrial" },
      { value: "change_of_use", label: "Change of Use" },
    ],
  },
  {
    id: "heritage_listed",
    text: "Is the property heritage listed or in a heritage conservation area?",
    type: "radio",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
      { value: "unknown", label: "Unknown / Need to check" },
    ],
  },
  {
    id: "bushfire_zone",
    text: "Is the property in a bushfire prone area?",
    type: "radio",
    options: [
      { value: "bal_low", label: "BAL-LOW (not affected)" },
      { value: "bal_12_5", label: "BAL-12.5" },
      { value: "bal_19", label: "BAL-19" },
      { value: "bal_29", label: "BAL-29" },
      { value: "bal_40", label: "BAL-40" },
      { value: "bal_fx", label: "BAL-FZ (Flame Zone)" },
      { value: "unknown", label: "Unknown / Need to check" },
    ],
  },
  {
    id: "flood_zone",
    text: "Is the property in a flood planning area?",
    type: "radio",
    options: [
      { value: "no", label: "No" },
      { value: "low_risk", label: "Low Risk" },
      { value: "medium_risk", label: "Medium Risk" },
      { value: "high_risk", label: "High Risk / Floodway" },
      { value: "unknown", label: "Unknown / Need to check" },
    ],
  },
  {
    id: "lot_size",
    text: "What is the approximate lot size?",
    type: "select",
    options: [
      { value: "under_450", label: "Under 450m²" },
      { value: "450_900", label: "450m² - 900m²" },
      { value: "900_1500", label: "900m² - 1,500m²" },
      { value: "over_1500", label: "Over 1,500m²" },
    ],
  },
  {
    id: "complying_dev_eligible",
    text: "Does the proposal meet all Complying Development standards (SEPP Codes)?",
    helpText: "CDC requires compliance with ALL standards in the relevant SEPP. If any standard is not met, a DA is required.",
    type: "radio",
    options: [
      { value: "yes", label: "Yes - all standards met" },
      { value: "no", label: "No - one or more standards not met" },
      { value: "unsure", label: "Unsure - needs further assessment" },
    ],
    condition: (answers) => answers.heritage_listed !== "yes" && !["bal_40", "bal_fx"].includes(answers.bushfire_zone || ""),
  },
  {
    id: "estimated_cost",
    text: "What is the estimated cost of works?",
    type: "select",
    options: [
      { value: "under_50k", label: "Under $50,000" },
      { value: "50k_250k", label: "$50,000 - $250,000" },
      { value: "250k_1m", label: "$250,000 - $1,000,000" },
      { value: "over_1m", label: "Over $1,000,000" },
    ],
  },
  {
    id: "tree_removal",
    text: "Does the proposal require tree removal?",
    type: "radio",
    options: [
      { value: "no", label: "No" },
      { value: "yes_minor", label: "Yes - minor (under 5m height)" },
      { value: "yes_significant", label: "Yes - significant trees" },
    ],
  },
];

const ACT_QUESTIONS: Question[] = [
  {
    id: "development_type",
    text: "What type of development is proposed?",
    type: "select",
    options: [
      { value: "new_dwelling", label: "New Dwelling" },
      { value: "addition_alteration", label: "Addition/Alteration to Existing" },
      { value: "outbuilding", label: "Outbuilding (Shed, Garage, Carport)" },
      { value: "pool", label: "Swimming Pool" },
      { value: "deck_pergola", label: "Deck/Pergola/Patio" },
      { value: "commercial", label: "Commercial/Industrial" },
    ],
  },
  {
    id: "exempt_development",
    text: "Does the proposal qualify as Exempt Development under the Planning and Development Act?",
    type: "radio",
    options: [
      { value: "yes", label: "Yes - exempt" },
      { value: "no", label: "No - requires DA" },
      { value: "unsure", label: "Unsure" },
    ],
  },
  {
    id: "lease_variation",
    text: "Does the proposal require a lease variation?",
    type: "radio",
    options: [
      { value: "no", label: "No" },
      { value: "yes", label: "Yes" },
      { value: "unknown", label: "Unknown" },
    ],
  },
  {
    id: "impact_track",
    text: "What assessment track is likely?",
    helpText: "Merit track is most common for residential. Impact track is for larger or more complex proposals.",
    type: "radio",
    options: [
      { value: "code", label: "Code Track (minor, compliant)" },
      { value: "merit", label: "Merit Track (standard)" },
      { value: "impact", label: "Impact Track (significant)" },
    ],
  },
  {
    id: "estimated_cost",
    text: "What is the estimated cost of works?",
    type: "select",
    options: [
      { value: "under_50k", label: "Under $50,000" },
      { value: "50k_250k", label: "$50,000 - $250,000" },
      { value: "250k_1m", label: "$250,000 - $1,000,000" },
      { value: "over_1m", label: "Over $1,000,000" },
    ],
  },
];

function evaluateNSWPathway(answers: Record<string, string>): PathwayResult {
  // Heritage listed → must be DA
  if (answers.heritage_listed === "yes") {
    return {
      pathway: "NSW_DA",
      label: "Development Application (DA)",
      confidence: "high",
      reasoning: "Heritage listed properties or properties in heritage conservation areas cannot use Complying Development and must lodge a DA with Council.",
      requiredDocuments: ["architectural_plans", "heritage_impact_statement", "survey", "statement_of_environmental_effects", "owner_consent"],
      estimatedTimeline: "40-60 business days (assessment) + 28 days notification",
      estimatedFees: "Varies by Council - typically $1,500 - $15,000+",
      gates: ["Pre-lodgement", "Lodgement", "Assessment", "Determination", "Post-consent", "Construction"],
    };
  }

  // BAL-40 or FZ → must be DA
  if (["bal_40", "bal_fx"].includes(answers.bushfire_zone || "")) {
    return {
      pathway: "NSW_DA",
      label: "Development Application (DA)",
      confidence: "high",
      reasoning: "Properties in BAL-40 or Flame Zone cannot use Complying Development pathway. A DA with a Bushfire Assessment Report is required.",
      requiredDocuments: ["architectural_plans", "bushfire_report", "survey", "statement_of_environmental_effects", "owner_consent"],
      estimatedTimeline: "40-60 business days + RFS referral (21 days)",
      estimatedFees: "Varies by Council - typically $1,500 - $15,000+",
      gates: ["Pre-lodgement", "Lodgement", "RFS Referral", "Assessment", "Determination", "Post-consent"],
    };
  }

  // CDC eligible
  if (answers.complying_dev_eligible === "yes") {
    return {
      pathway: "NSW_CDC",
      label: "Complying Development Certificate (CDC)",
      confidence: "high",
      reasoning: "The proposal meets all Complying Development standards. A CDC can be issued by an Accredited Certifier, typically faster and more predictable than a DA.",
      requiredDocuments: ["architectural_plans", "survey", "basix_certificate", "structural_plans"],
      estimatedTimeline: "10-20 business days",
      estimatedFees: "Certifier fees: $2,000 - $8,000 + Council notification fee",
      gates: ["Pre-lodgement", "Lodgement", "Assessment", "Determination", "Construction"],
    };
  }

  // Default to DA
  return {
    pathway: "NSW_DA",
    label: "Development Application (DA)",
    confidence: answers.complying_dev_eligible === "unsure" ? "medium" : "high",
    reasoning: answers.complying_dev_eligible === "unsure"
      ? "Further assessment needed to determine if CDC standards can be met. Defaulting to DA pathway as the safe option."
      : "One or more Complying Development standards are not met. A Development Application to Council is required.",
    requiredDocuments: ["architectural_plans", "survey", "statement_of_environmental_effects", "owner_consent", "basix_certificate"],
    estimatedTimeline: "40-60 business days",
    estimatedFees: "Varies by Council - typically $1,500 - $15,000+",
    gates: ["Pre-lodgement", "Lodgement", "Assessment", "Determination", "Post-consent", "Construction"],
  };
}

function evaluateACTPathway(answers: Record<string, string>): PathwayResult {
  if (answers.exempt_development === "yes") {
    return {
      pathway: "ACT_EXEMPT",
      label: "Exempt Development (No DA Required)",
      confidence: "high",
      reasoning: "The proposal qualifies as exempt development under the Planning and Development Act. No development application is required, but a Building Approval may still be needed.",
      requiredDocuments: ["architectural_plans", "structural_plans"],
      estimatedTimeline: "N/A for DA. Building Approval: 10-20 business days",
      estimatedFees: "Building Approval fees only: $1,000 - $5,000",
      gates: ["Building Approval", "Construction"],
    };
  }

  if (answers.impact_track === "impact") {
    return {
      pathway: "ACT_DA_IMPACT",
      label: "Development Application - Impact Track",
      confidence: "high",
      reasoning: "The proposal requires Impact Track assessment due to its scale or complexity. This involves public notification and potentially longer assessment times.",
      requiredDocuments: ["architectural_plans", "survey", "statement_of_environmental_effects", "landscape_plans", "traffic_report"],
      estimatedTimeline: "60-90 business days",
      estimatedFees: "$5,000 - $20,000+",
      gates: ["Pre-lodgement", "Lodgement", "Public Notification", "Assessment", "Determination", "Building Approval", "Construction"],
    };
  }

  if (answers.impact_track === "code") {
    return {
      pathway: "ACT_DA_CODE",
      label: "Development Application - Code Track",
      confidence: "high",
      reasoning: "The proposal qualifies for Code Track assessment. This is the fastest DA pathway for compliant proposals.",
      requiredDocuments: ["architectural_plans", "survey"],
      estimatedTimeline: "20-30 business days",
      estimatedFees: "$1,500 - $5,000",
      gates: ["Lodgement", "Assessment", "Determination", "Building Approval", "Construction"],
    };
  }

  // Default merit track
  return {
    pathway: "ACT_DA_MERIT",
    label: "Development Application - Merit Track",
    confidence: answers.impact_track ? "high" : "medium",
    reasoning: "The proposal requires Merit Track assessment. This is the standard pathway for most residential development in the ACT.",
    requiredDocuments: ["architectural_plans", "survey", "statement_of_environmental_effects", "landscape_plans"],
    estimatedTimeline: "30-45 business days",
    estimatedFees: "$2,000 - $10,000",
    gates: ["Pre-lodgement", "Lodgement", "Assessment", "Determination", "Building Approval", "Construction"],
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ApprovalsPathwayAssessment() {
  const [, params] = useRoute("/approvals/projects/:id/pathway");
  const [, navigate] = useLocation();
  const projectId = Number(params?.id);

  const [jurisdiction, setJurisdiction] = useState<"NSW" | "ACT" | "">("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentStep, setCurrentStep] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [notes, setNotes] = useState("");

  const { data: project } = trpc.approvals.projects.get.useQuery({ id: projectId });

  const saveAssessment = trpc.approvals.pathwayAssessments.create.useMutation({
    onSuccess: () => {
      toast.success("Pathway assessment saved");
      navigate(`/approvals/projects/${projectId}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const questions = useMemo(() => {
    if (jurisdiction === "NSW") return NSW_QUESTIONS;
    if (jurisdiction === "ACT") return ACT_QUESTIONS;
    return [];
  }, [jurisdiction]);

  const visibleQuestions = useMemo(() => {
    return questions.filter((q) => !q.condition || q.condition(answers));
  }, [questions, answers]);

  const result = useMemo(() => {
    if (!showResult || !jurisdiction) return null;
    if (jurisdiction === "NSW") return evaluateNSWPathway(answers);
    return evaluateACTPathway(answers);
  }, [showResult, jurisdiction, answers]);

  const handleAnswer = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSave = () => {
    if (!result) return;
    saveAssessment.mutate({
      projectId,
      checklistResponses: { jurisdiction, answers },
      recommendedPathway: result.pathway,
      confidence: result.confidence,
      assumptions: result.reasoning,
      notes,
    });
  };

  if (!jurisdiction) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Button variant="ghost" onClick={() => navigate(`/approvals/projects/${projectId}`)} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Project
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Pathway Assessment</CardTitle>
            <CardDescription>
              Select the jurisdiction to begin the guided assessment. The rules engine will recommend the appropriate approval pathway based on your answers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-base font-semibold">Jurisdiction</Label>
              <div className="grid grid-cols-2 gap-4 mt-3">
                <Button variant="outline" className="h-20 text-lg" onClick={() => setJurisdiction("NSW")}>
                  NSW
                  <span className="block text-xs text-muted-foreground mt-1">New South Wales</span>
                </Button>
                <Button variant="outline" className="h-20 text-lg" onClick={() => setJurisdiction("ACT")}>
                  ACT
                  <span className="block text-xs text-muted-foreground mt-1">Australian Capital Territory</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showResult && result) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <Button variant="ghost" onClick={() => setShowResult(false)} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Questions
        </Button>
        <Card className="border-2 border-primary/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl">Pathway Recommendation</CardTitle>
              <Badge variant={result.confidence === "high" ? "default" : result.confidence === "medium" ? "secondary" : "destructive"}>
                {result.confidence} confidence
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-primary/5 rounded-lg p-4">
              <h3 className="text-2xl font-bold text-primary">{result.label}</h3>
              <p className="text-sm text-muted-foreground mt-1">{result.pathway}</p>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Reasoning</h4>
              <p className="text-sm text-muted-foreground">{result.reasoning}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="font-semibold mb-2">Estimated Timeline</h4>
                <p className="text-sm">{result.estimatedTimeline}</p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Estimated Fees</h4>
                <p className="text-sm">{result.estimatedFees}</p>
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Workflow Gates</h4>
              <div className="flex flex-wrap gap-2">
                {result.gates.map((gate, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {i + 1}. {gate}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Required Documents</h4>
              <div className="grid grid-cols-2 gap-1">
                {result.requiredDocuments.map((doc) => (
                  <div key={doc} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                    {doc.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label>Notes / Assumptions</Label>
              <Textarea
                placeholder="Record any assumptions, caveats, or additional notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="mt-2"
              />
            </div>

            <div className="flex gap-3">
              <Button onClick={handleSave} disabled={saveAssessment.isPending} className="flex-1">
                {saveAssessment.isPending ? "Saving..." : "Save Assessment & Apply Pathway"}
              </Button>
              <Button variant="outline" onClick={() => setShowResult(false)}>
                Revise Answers
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentQuestion = visibleQuestions[currentStep];

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Button variant="ghost" onClick={() => navigate(`/approvals/projects/${projectId}`)} className="mb-4">
        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Project
      </Button>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Pathway Assessment — {jurisdiction}</h2>
          <span className="text-sm text-muted-foreground">
            Question {currentStep + 1} of {visibleQuestions.length}
          </span>
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <div
            className="bg-primary h-2 rounded-full transition-all"
            style={{ width: `${((currentStep + 1) / visibleQuestions.length) * 100}%` }}
          />
        </div>
      </div>

      {currentQuestion && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div>
              <Label className="text-base font-semibold">{currentQuestion.text}</Label>
              {currentQuestion.helpText && (
                <p className="text-sm text-muted-foreground mt-1 flex items-start gap-1">
                  <Info className="h-4 w-4 shrink-0 mt-0.5" />
                  {currentQuestion.helpText}
                </p>
              )}
            </div>

            {currentQuestion.type === "select" ? (
              <Select
                value={answers[currentQuestion.id] || ""}
                onValueChange={(v) => handleAnswer(currentQuestion.id, v)}
              >
                <SelectTrigger><SelectValue placeholder="Select an option" /></SelectTrigger>
                <SelectContent>
                  {currentQuestion.options.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <RadioGroup
                value={answers[currentQuestion.id] || ""}
                onValueChange={(v) => handleAnswer(currentQuestion.id, v)}
                className="space-y-2"
              >
                {currentQuestion.options.map((opt) => (
                  <div key={opt.value} className="flex items-center space-x-2 p-3 rounded-lg border hover:bg-accent/50 cursor-pointer">
                    <RadioGroupItem value={opt.value} id={`${currentQuestion.id}-${opt.value}`} />
                    <Label htmlFor={`${currentQuestion.id}-${opt.value}`} className="cursor-pointer flex-1">
                      {opt.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            )}

            <div className="flex justify-between pt-4">
              <Button
                variant="outline"
                onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                disabled={currentStep === 0}
              >
                <ArrowLeft className="h-4 w-4 mr-1" /> Previous
              </Button>
              {currentStep < visibleQuestions.length - 1 ? (
                <Button
                  onClick={() => setCurrentStep(currentStep + 1)}
                  disabled={!answers[currentQuestion.id]}
                >
                  Next <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={() => setShowResult(true)}
                  disabled={!answers[currentQuestion.id]}
                >
                  Get Recommendation <CheckCircle2 className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
