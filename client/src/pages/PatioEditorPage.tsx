import { useState, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Save, Loader2, FlipHorizontal2 } from "lucide-react";
import { OnboardingTour, TourHelpButton, isTourCompleted } from "@/components/OnboardingTour";
import { patioDesignerTour, TOUR_IDS } from "@/lib/tours";
import { toast } from "sonner";
import PatioCanvasEditor from "@/components/PatioCanvasEditor";
import PatioColourPicker from "@/components/PatioColourPicker";
import PatioElementLibrary, { type PatioElement } from "@/components/PatioElementLibrary";
import PatioPlacedElements from "@/components/PatioPlacedElements";
import PatioMaterialsList from "@/components/PatioMaterialsList";
import { PatioValidationPanel } from "@/components/PatioValidationPanel";
import { PatioPresentationExport } from "@/components/PatioPresentationExport";
import { PatioPhotoGuide } from "@/components/PatioPhotoGuide";
import { PatioAIRender } from "@/components/PatioAIRender";
import type { CalibrationData } from "@/components/PhotoCalibrationTool";
import type { RoofStyle, StructureType } from "@/components/PatioStructureOverlay";
import type { ColorbondColour } from "@/lib/colorbondColours";
import type {
  WindRegion,
  EnclosureCondition,
  BeamSize,
  BeamType,
  PostSize,
} from "../../../shared/rb100-validation";

export default function PatioEditorPage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);
  const [, navigate] = useLocation();
  const [tourActive, setTourActive] = useState(!isTourCompleted(TOUR_IDS.patioDesigner));

  const { data: project, isLoading, refetch } = trpc.patioPlanner.get.useQuery({ id: projectId });
  const updateProject = trpc.patioPlanner.update.useMutation({
    onSuccess: () => {
      toast.success("Saved");
      refetch();
    },
  });

  // Local state (synced from server)
  const [overlayState, setOverlayState] = useState({
    x: 50, y: 50, scale: 1, rotation: 0, opacity: 0.6,
  });
  const [structureType, setStructureType] = useState<StructureType>("patio");
  const [flipped, setFlipped] = useState(false);
  const [gutterStyle, setGutterStyle] = useState<"none" | "quad" | "half-round" | "fascia">("quad");
  const [downpipeStyle, setDownpipeStyle] = useState<"none" | "round" | "square">("round");
  const [roofPanel, setRoofPanel] = useState<string>("double-u");
  const [connectionType, setConnectionType] = useState<string>("flyover-bracket");
  const [calibrationData, setCalibrationData] = useState<CalibrationData | null>(null);
  const [structureState, setStructureState] = useState({
    roofStyle: "flyover" as RoofStyle,
    width: 6000,
    projection: 4000,
    roofPitch: 5,
    beamHeight: 2700,
    postHeight: 2400,
    floorToGround: 150,
    postCount: 2,
  });
  const [colours, setColours] = useState<{
    roof: ColorbondColour;
    beam: ColorbondColour;
    post: ColorbondColour;
    gutter: ColorbondColour;
    fascia: ColorbondColour;
  }>({
    roof: "Surfmist",
    beam: "Surfmist",
    post: "Surfmist",
    gutter: "Surfmist",
    fascia: "Surfmist",
  });
  const [placedElements, setPlacedElements] = useState<PatioElement[]>([]);

  // Engineering validation state
  const [windRegion, setWindRegion] = useState<WindRegion>("N2");
  const [enclosure, setEnclosure] = useState<EnclosureCondition>("open3-single");
  const [beamSize, setBeamSize] = useState<BeamSize>("150x60");
  const [beamType, setBeamType] = useState<BeamType>("edge-single");
  const [postSize, setPostSize] = useState<PostSize>("65x65x2.0");
  const [engineeringLocked, setEngineeringLocked] = useState(false);
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState<string | null>(null);

  // Sync from server data
  useEffect(() => {
    if (!project) return;
    setCurrentPhotoUrl((project.photoUrl as string | null) || null);
    setOverlayState({
      x: Number(project.overlayX) || 50,
      y: Number(project.overlayY) || 50,
      scale: Number(project.overlayScale) || 1,
      rotation: Number(project.overlayRotation) || 0,
      opacity: Number(project.overlayOpacity) || 0.6,
    });
    setStructureType((project.structureType as StructureType) || "patio");
    setFlipped(!!project.flipped);
    setGutterStyle((project.gutterStyle as any) || "quad");
    setDownpipeStyle((project.downpipeStyle as any) || "round");
    setRoofPanel((project.roofPanel as string) || "double-u");
    setConnectionType((project.connectionType as string) || "flyover-bracket");
    // Load calibration data from JSON
    if (project.calibrationData) {
      try {
        const cal = typeof project.calibrationData === "string"
          ? JSON.parse(project.calibrationData)
          : project.calibrationData;
        setCalibrationData(cal);
      } catch { /* ignore parse errors */ }
    }
    setStructureState({
      roofStyle: (project.roofStyle as RoofStyle) || "flyover",
      width: Number(project.structureWidth) || 6000,
      projection: Number(project.structureProjection) || 4000,
      roofPitch: Number(project.roofPitch) || 5,
      beamHeight: Number(project.beamHeight) || 2700,
      postHeight: Number(project.postHeight) || 2400,
      floorToGround: Number(project.floorToGround) || 150,
      postCount: project.postCount || 2,
    });
    setColours({
      roof: (project.roofColour as ColorbondColour) || "Surfmist",
      beam: (project.beamColour as ColorbondColour) || "Surfmist",
      post: (project.postColour as ColorbondColour) || "Surfmist",
      gutter: (project.gutterColour as ColorbondColour) || "Surfmist",
      fascia: (project.fasciaColour as ColorbondColour) || "Surfmist",
    });
    // Load placed elements from JSON
    if (project.windowsDoors) {
      try {
        const parsed = typeof project.windowsDoors === "string"
          ? JSON.parse(project.windowsDoors)
          : project.windowsDoors;
        if (Array.isArray(parsed)) setPlacedElements(parsed);
      } catch { /* ignore parse errors */ }
    }
    // Load engineering state from JSON
    if (project.engineeringData) {
      try {
        const eng = typeof project.engineeringData === "string"
          ? JSON.parse(project.engineeringData)
          : project.engineeringData;
        if (eng.windRegion) setWindRegion(eng.windRegion);
        if (eng.enclosure) setEnclosure(eng.enclosure);
        if (eng.beamSize) setBeamSize(eng.beamSize);
        if (eng.beamType) setBeamType(eng.beamType);
        if (eng.postSize) setPostSize(eng.postSize);
        if (eng.locked) setEngineeringLocked(true);
      } catch { /* ignore parse errors */ }
    }
  }, [project]);

  // Add element from library
  const handleAddElement = useCallback((element: Omit<PatioElement, "id" | "x" | "y">) => {
    const newElement: PatioElement = {
      ...element,
      id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      x: 50, // center of canvas
      y: 50,
    };
    setPlacedElements((prev) => [...prev, newElement]);
    toast.success(`${element.label} added — drag to position`);
  }, []);

  // Compute beam span from width and post count
  const beamSpan = structureState.postCount > 1
    ? Math.round(structureState.width / (structureState.postCount - 1))
    : structureState.width;

  const handlePhotoUploaded = useCallback((url: string) => {
    setCurrentPhotoUrl(url);
    void refetch();
  }, [refetch]);

  // Save all state
  const handleSave = useCallback(() => {
    updateProject.mutate({
      id: projectId,
      data: {
        overlayX: overlayState.x.toString(),
        overlayY: overlayState.y.toString(),
        overlayScale: overlayState.scale.toString(),
        overlayRotation: overlayState.rotation.toString(),
        overlayOpacity: overlayState.opacity.toString(),
        roofStyle: structureState.roofStyle,
        structureWidth: structureState.width.toString(),
        structureProjection: structureState.projection.toString(),
        roofPitch: structureState.roofPitch.toString(),
        beamHeight: structureState.beamHeight.toString(),
        postHeight: structureState.postHeight.toString(),
        floorToGround: structureState.floorToGround.toString(),
        postCount: structureState.postCount,
        roofColour: colours.roof,
        beamColour: colours.beam,
        postColour: colours.post,
        gutterColour: colours.gutter,
        fasciaColour: colours.fascia,
        structureType,
        flipped,
        gutterStyle,
        downpipeStyle,
        roofPanel,
        connectionType,
        windowsDoors: JSON.stringify(placedElements),
        engineeringData: JSON.stringify({ windRegion, enclosure, beamSize, beamType, postSize, locked: engineeringLocked }),
        calibrationData: calibrationData ? JSON.stringify(calibrationData) : null,
      },
    });
  }, [projectId, overlayState, structureState, structureType, flipped, gutterStyle, downpipeStyle, roofPanel, connectionType, colours, placedElements, windRegion, enclosure, beamSize, beamType, postSize, engineeringLocked, calibrationData, updateProject]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 text-center">
        <p>Project not found</p>
        <Button variant="link" onClick={() => navigate("/patio-planner")}>Back to list</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <OnboardingTour
        tourId={TOUR_IDS.patioDesigner}
        steps={patioDesignerTour}
        active={tourActive}
        onComplete={() => setTourActive(false)}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 sm:p-3 border-b bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="sm" className="shrink-0 h-8 px-2" onClick={() => navigate("/patio-planner")}>
            <ArrowLeft className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Back</span>
          </Button>
          <h1 className="font-semibold text-sm truncate flex-1">{project.name}</h1>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto shrink-0">
          <TourHelpButton onClick={() => setTourActive(true)} label="Tour" />
          <span data-tour="patio-photo-guide"><PatioPhotoGuide /></span>
          <span data-tour="patio-export"><PatioPresentationExport
             projectName={project.name}
             photoUrl={currentPhotoUrl}
             structureState={structureState}
             colours={colours}
             placedElements={placedElements}
             gutterStyle={gutterStyle}
             downpipeStyle={downpipeStyle}
             renderHistory={project.renderHistory ? (typeof project.renderHistory === 'string' ? JSON.parse(project.renderHistory) : project.renderHistory) : undefined}
           /></span>
          <Button size="sm" className="shrink-0 h-8" onClick={handleSave} disabled={updateProject.isPending}>
            {updateProject.isPending ? <Loader2 className="h-4 w-4 animate-spin sm:mr-1" /> : <Save className="h-4 w-4 sm:mr-1" />}
            <span className="hidden sm:inline">Save</span>
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
        {/* Canvas */}
        <div className="flex-1 p-3 overflow-auto" data-tour="patio-canvas">
          <PatioCanvasEditor
            projectId={projectId}
            photoUrl={currentPhotoUrl}
            overlayState={overlayState}
            structureState={structureState}
            colours={colours}
            flipped={flipped}
            structureType={structureType}
            gutterStyle={gutterStyle}
            downpipeStyle={downpipeStyle}
            calibrationData={calibrationData}
            onCalibrationChange={setCalibrationData}
            onOverlayChange={setOverlayState}
            onStructureChange={setStructureState}
            onColoursChange={setColours}
            onPhotoUploaded={handlePhotoUploaded}
          >
            <PatioPlacedElements
              elements={placedElements}
              onChange={setPlacedElements}
              structureWidth={structureState.width}
              structureHeight={structureState.beamHeight}
            />
          </PatioCanvasEditor>
        </div>

        {/* Controls Panel */}
        <div className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l overflow-y-auto p-2 sm:p-3 bg-muted/30">
          <Tabs defaultValue="structure" className="w-full">
            <TabsList className="w-full grid grid-cols-3 sm:grid-cols-6 h-auto" data-tour="patio-tabs">
              <TabsTrigger value="structure" className="text-[10px] sm:text-xs">Structure</TabsTrigger>
              <TabsTrigger value="colours" className="text-[10px] sm:text-xs">Colours</TabsTrigger>
              <TabsTrigger value="elements" className="text-[10px] sm:text-xs">Elements</TabsTrigger>
              <TabsTrigger value="engineering" className="text-[10px] sm:text-xs">RB100</TabsTrigger>
              <TabsTrigger value="materials" className="text-[10px] sm:text-xs">Materials</TabsTrigger>
              <TabsTrigger value="ai-render" className="text-[10px] sm:text-xs">AI Render</TabsTrigger>
            </TabsList>

            <TabsContent value="structure" className="space-y-4 mt-3" data-tour="patio-structure">
              {/* Structure Type & Flip */}
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label className="text-xs font-semibold">Structure Type</Label>
                  <Select
                    value={structureType}
                    onValueChange={(v) => setStructureType(v as StructureType)}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="patio">Patio</SelectItem>
                      <SelectItem value="carport">Carport</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant={flipped ? "default" : "outline"}
                  size="sm"
                  className="h-9 gap-1.5"
                  onClick={() => setFlipped(!flipped)}
                  title="Flip structure left/right"
                >
                  <FlipHorizontal2 className="w-4 h-4" />
                  <span className="text-xs">Flip</span>
                </Button>
              </div>

              {/* Roof Style */}
              <div>
                <Label className="text-xs font-semibold">Roof Style</Label>
                <Select
                  value={structureState.roofStyle}
                  onValueChange={(v) => setStructureState({ ...structureState, roofStyle: v as RoofStyle })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flyover">Flyover</SelectItem>
                    <SelectItem value="popup-skillion">Pop-up Skillion</SelectItem>
                    <SelectItem value="gable">Gable</SelectItem>
                    <SelectItem value="hip">Hip</SelectItem>
                    <SelectItem value="flat-eave">Flat (3°) Attached to Eave</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Gutter & Downpipe */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Gutter Style</Label>
                  <Select value={gutterStyle} onValueChange={(v) => setGutterStyle(v as any)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="quad">Quad Gutter</SelectItem>
                      <SelectItem value="half-round">Half Round</SelectItem>
                      <SelectItem value="fascia">Fascia Gutter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold">Downpipe</Label>
                  <Select value={downpipeStyle} onValueChange={(v) => setDownpipeStyle(v as any)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="round">90mm Round</SelectItem>
                      <SelectItem value="square">100mm Square</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Roof Panel & Connection Type */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Roof Panel</Label>
                  <Select value={roofPanel} onValueChange={(v) => setRoofPanel(v)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="double-u">Double-U</SelectItem>
                      <SelectItem value="slendek">Slendek</SelectItem>
                      <SelectItem value="wavetek">Wavetek</SelectItem>
                      <SelectItem value="climatek-v">Climatek V</SelectItem>
                      <SelectItem value="ambitek">Ambitek</SelectItem>
                      <SelectItem value="ceiltek">Ceiltek</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold">Connection</Label>
                  <Select value={connectionType} onValueChange={(v) => setConnectionType(v)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="flyover-bracket">Flyover Bracket</SelectItem>
                      <SelectItem value="through-eave">Through Eave</SelectItem>
                      <SelectItem value="back-channel">Back Channel</SelectItem>
                      <SelectItem value="crank-post">Crank Post</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Dimensions */}
              <Card>
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-xs">Dimensions (mm)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 px-3 pb-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px]">Width</Label>
                      <Input
                        type="number"
                        value={structureState.width}
                        onChange={(e) => setStructureState({ ...structureState, width: Number(e.target.value) })}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">Projection</Label>
                      <Input
                        type="number"
                        value={structureState.projection}
                        onChange={(e) => setStructureState({ ...structureState, projection: Number(e.target.value) })}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px]">Beam Height</Label>
                      <Input
                        type="number"
                        value={structureState.beamHeight}
                        onChange={(e) => setStructureState({ ...structureState, beamHeight: Number(e.target.value) })}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">Post Height</Label>
                      <Input
                        type="number"
                        value={structureState.postHeight}
                        onChange={(e) => setStructureState({ ...structureState, postHeight: Number(e.target.value) })}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px]">Floor to Ground</Label>
                      <Input
                        type="number"
                        value={structureState.floorToGround}
                        onChange={(e) => setStructureState({ ...structureState, floorToGround: Number(e.target.value) })}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">Post Count</Label>
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        value={structureState.postCount}
                        onChange={(e) => setStructureState({ ...structureState, postCount: Number(e.target.value) })}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Roof Pitch */}
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Roof Pitch</Label>
                  <span className="text-xs font-mono">{structureState.roofPitch}°</span>
                </div>
                <Slider
                  value={[structureState.roofPitch]}
                  onValueChange={([v]) => setStructureState({ ...structureState, roofPitch: v })}
                  min={1}
                  max={25}
                  step={0.5}
                  className="mt-2"
                />
              </div>
            </TabsContent>

            <TabsContent value="colours" className="mt-3">
              <PatioColourPicker colours={colours} onChange={setColours} />
            </TabsContent>

            <TabsContent value="elements" className="mt-3">
              <PatioElementLibrary onAddElement={handleAddElement} />
              {/* Placed elements summary */}
              {placedElements.length > 0 && (
                <Card className="mt-3">
                  <CardHeader className="py-2 px-3">
                    <CardTitle className="text-xs">Placed ({placedElements.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-2">
                    <div className="space-y-1">
                      {placedElements.map((el) => (
                        <div key={el.id} className="flex items-center justify-between text-[10px] py-0.5">
                          <span className="font-medium">{el.label}</span>
                          <span className="text-muted-foreground">{el.width}×{el.height} {el.screen !== "N/A" ? `(${el.screen})` : ""}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="engineering" className="mt-3" data-tour="patio-engineering">
              <PatioValidationPanel
                structureWidth={structureState.width}
                roofProjection={structureState.projection}
                postHeight={structureState.postHeight}
                postCount={structureState.postCount}
                beamSpan={beamSpan}
                windRegion={windRegion}
                enclosure={enclosure}
                beamSize={beamSize}
                beamType={beamType}
                postSize={postSize}
                isLocked={engineeringLocked}
                onLockChange={setEngineeringLocked}
                onWindRegionChange={setWindRegion}
                onEnclosureChange={setEnclosure}
                onBeamSizeChange={setBeamSize}
                onBeamTypeChange={setBeamType}
                onPostSizeChange={setPostSize}
              />
            </TabsContent>

            <TabsContent value="materials" className="mt-3">
              <PatioMaterialsList
                structureState={structureState}
                colours={colours}
                elements={placedElements}
                gutterStyle={gutterStyle}
                downpipeStyle={downpipeStyle}
                projectName={project.name}
              />
            </TabsContent>

            <TabsContent value="ai-render" className="mt-3" data-tour="patio-ai-render">
              <PatioAIRender
                projectId={projectId}
                hasPhoto={!!currentPhotoUrl}
                photoUrl={currentPhotoUrl}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
