export type SpecFieldType = "num" | "text" | "json" | "computed";

export interface SpecFieldDefinition {
  value: string;
  label: string;
  type: SpecFieldType;
  section: string;
}

export interface SpecDefinedTerm {
  term: string;
  fieldName: string;
  section: string;
  type: SpecFieldType;
  formulaExamples: string[];
  productMatchField?: string;
  notes: string;
}

export const SPEC_FIELDS: SpecFieldDefinition[] = [
  { value: "specWidth", label: "Width (m)", type: "num", section: "Dimensions & Structure" },
  { value: "specLength", label: "Length (m)", type: "num", section: "Dimensions & Structure" },
  { value: "specFloorHeight", label: "Floor Height", type: "num", section: "Dimensions & Structure" },
  { value: "specRoofToFloor", label: "Under Eave to Floor", type: "num", section: "Dimensions & Structure" },
  { value: "specFloorToGround", label: "Floor to Ground", type: "num", section: "Dimensions & Structure" },
  { value: "specHouseEave", label: "House Eave", type: "num", section: "Dimensions & Structure" },
  { value: "specCutBackEave", label: "Cut Back Eave", type: "text", section: "Dimensions & Structure" },
  { value: "specJobEave", label: "Job Eave", type: "num", section: "Dimensions & Structure" },
  { value: "specWindCat", label: "Wind Category", type: "text", section: "Dimensions & Structure" },
  { value: "specCpn", label: "CPN", type: "text", section: "Dimensions & Structure" },
  { value: "specFall", label: "Fall", type: "num", section: "Dimensions & Structure" },
  { value: "specFallDirection", label: "Fall Direction", type: "text", section: "Dimensions & Structure" },
  { value: "specHouseWalls", label: "House Walls", type: "text", section: "Dimensions & Structure" },
  { value: "specRoofShape", label: "Roof Shape", type: "text", section: "Dimensions & Structure" },
  { value: "specColourGroup", label: "Colour Group", type: "text", section: "Dimensions & Structure" },
  { value: "specHouseRoofType", label: "Existing Roof Type of house", type: "text", section: "Dimensions & Structure" },
  { value: "specHouseWallType", label: "Existing House Wall", type: "text", section: "Dimensions & Structure" },
  { value: "specGroundLevel", label: "Ground Level", type: "text", section: "Dimensions & Structure" },
  { value: "specFallOnGround", label: "Fall on Ground", type: "num", section: "Dimensions & Structure" },
  { value: "specRoofOverhang", label: "Roof Overhang", type: "num", section: "Dimensions & Structure" },
  { value: "specPostSpacing", label: "Post Spacing", type: "num", section: "Dimensions & Structure" },
  { value: "specSiteAccess", label: "Site: Difficult Access", type: "text", section: "Site Details" },
  { value: "specSiteRestricted", label: "Site: Restricted Work Times", type: "text", section: "Site Details" },
  { value: "specSiteConditions", label: "Site: Conditions", type: "text", section: "Site Details" },
  { value: "specSiteOther", label: "Site: Other", type: "text", section: "Site Details" },
  { value: "specSiteMixed", label: "Site: Mixed Materials/Angles", type: "text", section: "Site Details" },
  { value: "specSiteNotes", label: "Site: Notes", type: "text", section: "Site Details" },
  { value: "specBracketsType", label: "Brackets Type", type: "text", section: "Attachment & Brackets" },
  { value: "specAttachmentMethod", label: "No. of Attached Side", type: "text", section: "Attachment & Brackets" },
  { value: "specBracketAttachmentMethod", label: "Attachment Method", type: "text", section: "Attachment & Brackets" },
  { value: "specNumberOfBrackets", label: "Number of Brackets", type: "num", section: "Attachment & Brackets" },
  { value: "specFasciaBrackets", label: "Fascia Brackets", type: "num", section: "Attachment & Brackets" },
  { value: "specExtendaBrackets", label: "Extenda Brackets", type: "num", section: "Attachment & Brackets" },
  { value: "specGableBrackets", label: "Gable Brackets", type: "num", section: "Attachment & Brackets" },
  { value: "specOversizedDGutter", label: "Oversized D Gutter", type: "text", section: "Attachment & Brackets" },
  { value: "specBracketCover", label: "Bracket Cover", type: "text", section: "Attachment & Brackets" },
  { value: "specBracketColour", label: "Bracket Colour", type: "text", section: "Attachment & Brackets" },
  { value: "specPopupBrackets", label: "Pop-up Brackets", type: "num", section: "Attachment & Brackets" },
  { value: "specPopupColour", label: "Pop-up Colour", type: "text", section: "Attachment & Brackets" },
  { value: "specBracketInfillType", label: "Bracket Infill Type", type: "text", section: "Attachment & Brackets" },
  { value: "specBracketInfillLength", label: "Bracket Infill Length (mm)", type: "num", section: "Attachment & Brackets" },
  { value: "specBracketInfillColour", label: "Bracket Infill Colour", type: "text", section: "Attachment & Brackets" },
  { value: "specFreeStanding", label: "Free Standing", type: "text", section: "Attachment & Brackets" },
  { value: "specWallFixingBeam", label: "Wall Fixing Beam", type: "text", section: "Attachment & Brackets" },
  { value: "specWallFixingBracket", label: "Wall Fixing Bracket", type: "text", section: "Attachment & Brackets" },
  { value: "specFoamCut", label: "Foam Cut", type: "text", section: "Attachment & Brackets" },
  { value: "specPostsNumber", label: "Number of Posts", type: "num", section: "Posts" },
  { value: "specPostsType", label: "Post Type", type: "text", section: "Posts" },
  { value: "specPostsColour", label: "Post Colour", type: "text", section: "Posts" },
  { value: "specPostsFixing", label: "Post Fixing", type: "text", section: "Posts" },
  { value: "specPostPositions", label: "Post Positions (layout)", type: "text", section: "Posts" },
  { value: "specPostSize", label: "Post Size", type: "text", section: "Posts" },
  { value: "specGutterType", label: "Gutter Type", type: "text", section: "Gutters & Downpipes" },
  { value: "specGutterColour", label: "Gutter Colour", type: "text", section: "Gutters & Downpipes" },
  { value: "specGutterSides", label: "Gutter Sides", type: "text", section: "Gutters & Downpipes" },
  { value: "specGutterSideCount", label: "Gutter Side Count", type: "computed", section: "Gutters & Downpipes" },
  { value: "specBoxGutter", label: "Total Gutter Length (mm)", type: "num", section: "Gutters & Downpipes" },
  { value: "specTotalGutterLength", label: "Total Gutter Length (mm)", type: "computed", section: "Gutters & Downpipes" },
  { value: "specOverflow", label: "Overflow", type: "text", section: "Gutters & Downpipes" },
  { value: "specDownpipeType", label: "Downpipe Type", type: "text", section: "Gutters & Downpipes" },
  { value: "specDownpipeColour", label: "Downpipe Colour", type: "text", section: "Gutters & Downpipes" },
  { value: "specDownpipeLocation", label: "Downpipe Location", type: "text", section: "Gutters & Downpipes" },
  { value: "specDownpipeMarkers", label: "Downpipe Markers", type: "text", section: "Gutters & Downpipes" },
  { value: "specDownpipeCount", label: "Downpipe Count", type: "computed", section: "Gutters & Downpipes" },
  { value: "specBeamSize", label: "Beam Size", type: "text", section: "Beams & Rafters" },
  { value: "specBeamColour", label: "Beam Colour", type: "text", section: "Beams & Rafters" },
  { value: "specBeamEntries", label: "Beam Entries (JSON)", type: "json", section: "Beams & Rafters" },
  { value: "specBeamPositions", label: "Beam Positions", type: "text", section: "Beams & Rafters" },
  { value: "specRafterSize", label: "Rafter Size", type: "text", section: "Beams & Rafters" },
  { value: "specRafterMaterial", label: "Rafter Material", type: "text", section: "Beams & Rafters" },
  { value: "specRoofType", label: "Roof Type", type: "text", section: "Roof & Finish" },
  { value: "specRoofTopColour", label: "Roof Top Colour", type: "text", section: "Roof & Finish" },
  { value: "specRoofBottomColour", label: "Roof Bottom Colour", type: "text", section: "Roof & Finish" },
  { value: "specFinishType", label: "Finish Type", type: "text", section: "Roof & Finish" },
  { value: "specAngleCutting", label: "Angle Cutting", type: "text", section: "Roof & Finish" },
  { value: "specAngleCuttingMetres", label: "Angle Cutting Metres", type: "num", section: "Roof & Finish" },
  { value: "specSpanlitesType", label: "Spanlites Type", type: "text", section: "Roof & Finish" },
  { value: "specSpanlitesFinish", label: "Spanlites Finish", type: "text", section: "Roof & Finish" },
  { value: "specSkylightType", label: "Skylight Type", type: "text", section: "Roof & Finish" },
  { value: "specSkylightFinish", label: "Skylight Finish", type: "text", section: "Roof & Finish" },
  { value: "specSkylightLm", label: "Skylight LM", type: "num", section: "Roof & Finish" },
  { value: "specSkylightQty", label: "Skylight Qty", type: "num", section: "Roof & Finish" },
  { value: "specPolyType", label: "Polycarbonate Type", type: "text", section: "Roof & Finish" },
  { value: "specPolyRafters", label: "Polycarbonate Rafters", type: "text", section: "Roof & Finish" },
  { value: "specBackChannelType", label: "Back Channel Type", type: "text", section: "Channels & Flashings" },
  { value: "specBackChannelLength", label: "Back Channel Length (mm)", type: "num", section: "Channels & Flashings" },
  { value: "specSideChannelsType", label: "Side Channels Type", type: "text", section: "Channels & Flashings" },
  { value: "specSideChannelsLength", label: "Side Channels Length (mm)", type: "num", section: "Channels & Flashings" },
  { value: "specFlashingsType", label: "Flashings Type", type: "text", section: "Channels & Flashings" },
  { value: "specFlashingsLength", label: "Flashings Length (mm)", type: "num", section: "Channels & Flashings" },
  { value: "specFlashingsQty", label: "Flashings Qty", type: "num", section: "Channels & Flashings" },
  { value: "specBackChannelColour", label: "Back Channel Colour", type: "text", section: "Channels & Flashings" },
  { value: "specSideChannelsColour", label: "Side Channels Colour", type: "text", section: "Channels & Flashings" },
  { value: "specFlashingsColour", label: "Flashings Colour", type: "text", section: "Channels & Flashings" },
  { value: "specTwinwallColour", label: "Twinwall Colour (legacy)", type: "text", section: "Channels & Flashings" },
  { value: "specGableStyle", label: "Gable Style", type: "text", section: "Gable" },
  { value: "specGableInfill", label: "Gable Infill", type: "text", section: "Gable" },
  { value: "specWindowType", label: "Window Type", type: "text", section: "Windows" },
  { value: "specWindowsFrameColour", label: "Windows Frame Colour", type: "text", section: "Windows" },
  { value: "specWindowsTint", label: "Windows Tint", type: "text", section: "Windows" },
  { value: "specWindowGlassType", label: "Window Glass Type", type: "text", section: "Windows" },
  { value: "specWindowEntries", label: "Window Entries (JSON)", type: "json", section: "Windows" },
  { value: "specDoorType", label: "Door Type", type: "text", section: "Doors" },
  { value: "specDoorsFrameColour", label: "Doors Frame Colour", type: "text", section: "Doors" },
  { value: "specDoorsTint", label: "Doors Tint", type: "text", section: "Doors" },
  { value: "specDoorGlassType", label: "Door Glass Type", type: "text", section: "Doors" },
  { value: "specDoorEntries", label: "Door Entries (JSON)", type: "json", section: "Doors" },
  { value: "specScreenType", label: "Screen Type", type: "text", section: "Screens" },
  { value: "specGlassWindows", label: "Glass Windows", type: "text", section: "Glass Options" },
  { value: "specGlassDoors", label: "Glass Doors", type: "text", section: "Glass Options" },
  { value: "specGlassTint", label: "Glass Tint", type: "text", section: "Glass Options" },
  { value: "specGlassToning", label: "Glass Toning", type: "text", section: "Glass Options" },
  { value: "specGlassObscurity", label: "Glass Obscurity", type: "text", section: "Glass Options" },
  { value: "specGlassEtched", label: "Glass Etched", type: "text", section: "Glass Options" },
  { value: "specGlassScreens", label: "Glass Screens", type: "text", section: "Glass Options" },
  { value: "specGlassPetDoor", label: "Pet Door", type: "text", section: "Glass Options" },
  { value: "specGlassNotes", label: "Glass Notes", type: "text", section: "Glass Options" },
  { value: "specIwpColour", label: "IWP Colour", type: "text", section: "IWP & Ceiling" },
  { value: "specIwpFinish", label: "IWP Finish", type: "text", section: "IWP & Ceiling" },
  { value: "specIwpEntries", label: "IWP Entries (JSON)", type: "json", section: "IWP & Ceiling" },
  { value: "specCeilingColour", label: "Ceiling Colour", type: "text", section: "IWP & Ceiling" },
  { value: "specCeilingFinish", label: "Ceiling Finish", type: "text", section: "IWP & Ceiling" },
  { value: "specWallType", label: "Wall Type", type: "text", section: "Walls" },
  { value: "specWallColour", label: "Wall Colour", type: "text", section: "Walls" },
  { value: "specWallPanels", label: "Wall Panels", type: "num", section: "Walls" },
  { value: "specWallLM", label: "Wall LM", type: "num", section: "Walls" },
  { value: "specWallWorkItems", label: "Wall Work Items (JSON)", type: "json", section: "Walls" },
  { value: "specWallNotes", label: "Wall Notes", type: "text", section: "Walls" },
  { value: "specBalustradeType", label: "Balustrade Type", type: "text", section: "Balustrade" },
  { value: "specBalustradeGlass", label: "Balustrade Glass", type: "text", section: "Balustrade" },
  { value: "specBalustradeTubular", label: "Balustrade Tubular", type: "text", section: "Balustrade" },
  { value: "specBalustradeWire", label: "Balustrade Wire", type: "text", section: "Balustrade" },
  { value: "specBalustradeHeight", label: "Balustrade Height", type: "num", section: "Balustrade" },
  { value: "specBalustradeLM", label: "Balustrade LM", type: "num", section: "Balustrade" },
  { value: "specBalustradeCompliance", label: "Balustrade Compliance", type: "text", section: "Balustrade" },
  { value: "specBalustradePosts", label: "Balustrade Posts", type: "num", section: "Balustrade" },
  { value: "specBalustradePrivacy", label: "Balustrade Privacy", type: "text", section: "Balustrade" },
  { value: "specBalustradeRails", label: "Balustrade Rails", type: "text", section: "Balustrade" },
  { value: "specBalGlassType", label: "Bal Glass Type", type: "text", section: "Balustrade" },
  { value: "specBalGlassTint", label: "Bal Glass Tint", type: "text", section: "Balustrade" },
  { value: "specBalGlassSpigots", label: "Bal Glass Spigots", type: "num", section: "Balustrade" },
  { value: "specBalGlassStairs", label: "Bal Glass Stairs", type: "text", section: "Balustrade" },
  { value: "specBalPostType", label: "Bal Post Type", type: "text", section: "Balustrade" },
  { value: "specBalPostColour", label: "Bal Post Colour", type: "text", section: "Balustrade" },
  { value: "specBalPostMount", label: "Bal Post Mount", type: "text", section: "Balustrade" },
  { value: "specBalRailTopStyle", label: "Bal Rail Top Style", type: "text", section: "Balustrade" },
  { value: "specBalRailTopColour", label: "Bal Rail Top Colour", type: "text", section: "Balustrade" },
  { value: "specBalRailBottomStyle", label: "Bal Rail Bottom Style", type: "text", section: "Balustrade" },
  { value: "specBalRailBottomColour", label: "Bal Rail Bottom Colour", type: "text", section: "Balustrade" },
  { value: "specBalTubularVertical", label: "Bal Tubular Vertical", type: "text", section: "Balustrade" },
  { value: "specBalTubularVertSlat", label: "Bal Tubular Vert Slat", type: "text", section: "Balustrade" },
  { value: "specBalTubularHorizSlat", label: "Bal Tubular Horiz Slat", type: "text", section: "Balustrade" },
  { value: "specBalTubularStairs", label: "Bal Tubular Stairs", type: "text", section: "Balustrade" },
  { value: "specBalWireType", label: "Bal Wire Type", type: "text", section: "Balustrade" },
  { value: "specBalWireFrame", label: "Bal Wire Frame", type: "text", section: "Balustrade" },
  { value: "specBalWireFinish", label: "Bal Wire Finish", type: "text", section: "Balustrade" },
  { value: "specBalWireStairs", label: "Bal Wire Stairs", type: "text", section: "Balustrade" },
  { value: "specBalPrivacy", label: "Bal Privacy", type: "text", section: "Balustrade" },
  { value: "specBalCertification", label: "Bal Certification", type: "text", section: "Balustrade" },
  { value: "specBalustradeNotes", label: "Balustrade Notes", type: "text", section: "Balustrade" },
  { value: "specElecLights", label: "Elec Lights Qty", type: "num", section: "Electrical" },
  { value: "specElecLightType", label: "Elec Light Type (text)", type: "text", section: "Electrical" },
  { value: "specElecLightTypes", label: "Elec Light Types (JSON)", type: "json", section: "Electrical" },
  { value: "specElecFan", label: "Elec Fan", type: "num", section: "Electrical" },
  { value: "specElecPowerPoints", label: "Elec Power Points", type: "num", section: "Electrical" },
  { value: "specElecGpos", label: "Elec GPOs", type: "num", section: "Electrical" },
  { value: "specElecSwitches", label: "Elec Switches", type: "num", section: "Electrical" },
  { value: "specElecSwitchOneWay", label: "Elec Switch One-Way", type: "num", section: "Electrical" },
  { value: "specElecSwitchTwoWay", label: "Elec Switch Two-Way", type: "num", section: "Electrical" },
  { value: "specElecSwitchDimmer", label: "Elec Switch Dimmer", type: "num", section: "Electrical" },
  { value: "specElecCabling", label: "Elec Cabling", type: "text", section: "Electrical" },
  { value: "specElecCablingOptions", label: "Elec Cabling Options", type: "text", section: "Electrical" },
  { value: "specElecFrameType", label: "Elec Frame Type", type: "text", section: "Electrical" },
  { value: "specElecRemoveReinstall", label: "Elec Remove/Reinstall", type: "text", section: "Electrical" },
  { value: "specElecExtraWork", label: "Elec Extra Work", type: "text", section: "Electrical" },
  { value: "specElecNotes", label: "Elec Notes", type: "text", section: "Electrical" },
  { value: "specFlooringType", label: "Flooring Type", type: "text", section: "Flooring" },
  { value: "specFloorFinish", label: "Floor Finish", type: "text", section: "Flooring" },
  { value: "specFloorPrep", label: "Floor Prep", type: "text", section: "Flooring" },
  { value: "specFloorFrame", label: "Floor Frame", type: "text", section: "Flooring" },
  { value: "specSubfloorM2", label: "Subfloor Area (m2)", type: "num", section: "Flooring" },
  { value: "specFloorWorkItems", label: "Floor Work Items (JSON)", type: "json", section: "Flooring" },
  { value: "specFloorNotes", label: "Floor Notes", type: "text", section: "Flooring" },
  { value: "specConcreteType", label: "Concrete Type (Patio/Enclosure/Topper/Stamped)", type: "text", section: "Concrete" },
  { value: "specConcreteFinish", label: "Concrete Finish", type: "text", section: "Concrete" },
  { value: "specConcreteColour", label: "Concrete Colour", type: "text", section: "Concrete" },
  { value: "specConcreteThickness", label: "Concrete Thickness", type: "num", section: "Concrete" },
  { value: "specConcreteArea", label: "Concrete Area (m2)", type: "num", section: "Concrete" },
  { value: "specConcretePolished", label: "Concrete Polished", type: "text", section: "Concrete" },
  { value: "specConcreteExtras", label: "Concrete Extras", type: "text", section: "Concrete" },
  { value: "specConcreteChecks", label: "Concrete Checks", type: "text", section: "Concrete" },
  { value: "specConcreteItemChecks", label: "Concrete Checklist (JSON)", type: "json", section: "Concrete" },
  { value: "specConcreteNotes", label: "Concrete Notes", type: "text", section: "Concrete" },
  { value: "specPlumbType", label: "Plumbing Type", type: "text", section: "Plumbing & Drainage" },
  { value: "specPlumbChecks", label: "Plumbing Checklist (JSON)", type: "json", section: "Plumbing & Drainage" },
  { value: "specPlumbStormwater", label: "Plumb Stormwater", type: "text", section: "Plumbing & Drainage" },
  { value: "specPlumbPipes", label: "Plumb Pipes", type: "num", section: "Plumbing & Drainage" },
  { value: "specPlumbFitoffs", label: "Plumb Fitoffs", type: "num", section: "Plumbing & Drainage" },
  { value: "specPlumbGas", label: "Plumb Gas", type: "text", section: "Plumbing & Drainage" },
  { value: "specPlumbNotes", label: "Plumbing Notes", type: "text", section: "Plumbing & Drainage" },
  { value: "specStairsType", label: "Stairs Type", type: "text", section: "Stairs" },
  { value: "specStairsSteps", label: "Stairs Steps", type: "num", section: "Stairs" },
  { value: "specStairsRiser", label: "Stairs Riser", type: "num", section: "Stairs" },
  { value: "specStairsTreads", label: "Stairs Treads", type: "text", section: "Stairs" },
  { value: "specStairsStringer", label: "Stairs Stringer", type: "text", section: "Stairs" },
  { value: "specStairsGate", label: "Stairs Gate", type: "text", section: "Stairs" },
  { value: "specStairsChecks", label: "Stairs Checklist (JSON)", type: "json", section: "Stairs" },
  { value: "specStairsNotes", label: "Stairs Notes", type: "text", section: "Stairs" },
  { value: "specExistingEave", label: "Existing Eave", type: "text", section: "Existing Structure" },
  { value: "specExistingFascia", label: "Existing Fascia", type: "text", section: "Existing Structure" },
  { value: "specExistingWalls", label: "Existing Walls", type: "text", section: "Existing Structure" },
  { value: "specExistingBeams", label: "Existing Beams", type: "text", section: "Existing Structure" },
  { value: "specExistingDemo", label: "Existing Demo", type: "text", section: "Existing Structure" },
  { value: "specRemoveGutterFlash", label: "Remove Gutter/Flash", type: "text", section: "Existing Structure" },
  { value: "specExistingChecks", label: "Existing Checklist (JSON)", type: "json", section: "Existing Structure" },
  { value: "specExistingNotes", label: "Existing Notes", type: "text", section: "Existing Structure" },
  { value: "specDemolitionWorkItems", label: "Demolition Work Items (JSON)", type: "json", section: "Demolition" },
  { value: "specDemolitionNotes", label: "Demolition Notes", type: "text", section: "Demolition" },
  { value: "specSetbackFront", label: "Setback Front", type: "num", section: "Site Plan & Setbacks" },
  { value: "specSetbackRear", label: "Setback Rear", type: "num", section: "Site Plan & Setbacks" },
  { value: "specSetbackLeft", label: "Setback Left", type: "num", section: "Site Plan & Setbacks" },
  { value: "specSetbackRight", label: "Setback Right", type: "num", section: "Site Plan & Setbacks" },
  { value: "specSetbackColor", label: "Setback Display Colour", type: "text", section: "Site Plan & Setbacks" },
  { value: "specStructurePosX", label: "Structure Position X", type: "num", section: "Site Plan & Setbacks" },
  { value: "specStructurePosY", label: "Structure Position Y", type: "num", section: "Site Plan & Setbacks" },
  { value: "specStructureRotation", label: "Structure Rotation", type: "num", section: "Site Plan & Setbacks" },
  { value: "specDiagramAnnotations", label: "Diagram Annotations (JSON)", type: "json", section: "Site Plan & Setbacks" },
  { value: "specClientName", label: "Client Name", type: "text", section: "Other" },
  { value: "specQuoteNumber", label: "Quote Number", type: "text", section: "Other" },
  { value: "specDesignAdviser", label: "Design Adviser", type: "text", section: "Other" },
  { value: "specNotes", label: "General Notes", type: "text", section: "Other" },
  { value: "specProgressPayments", label: "Progress Payments (JSON)", type: "json", section: "Other" },
  { value: "specChecklistSelections", label: "Checklist Selections (JSON)", type: "json", section: "Other" },
  { value: "specColourGroupOverrides", label: "Colour Group Overrides (JSON)", type: "json", section: "Other" },
  { value: "specSectionPrefs", label: "Section Preferences (JSON)", type: "json", section: "Other" },
  { value: "specArea", label: "Area (W x L)", type: "computed", section: "Computed" },
  { value: "specPerimeter", label: "Perimeter (2 x (W+L))", type: "computed", section: "Computed" },
  { value: "specRoofArea", label: "Roof Area (pitch-adjusted)", type: "computed", section: "Computed" },
  { value: "specRoofRunWidth", label: "Roof Run Width", type: "computed", section: "Computed" },
  { value: "specRoofSheetLength", label: "Roof Sheet Length", type: "computed", section: "Computed" },
  { value: "specRoofSheetQty", label: "Roof Sheet Qty", type: "computed", section: "Computed" },
  { value: "wasteFactor", label: "Waste Factor (from master data)", type: "computed", section: "Computed" },
  { value: "roofSheetLM", label: "Roof Sheet LM", type: "computed", section: "Computed" },
  { value: "roofSheetQty", label: "Roof Sheet Qty", type: "computed", section: "Computed" },
  { value: "productCover", label: "Product Cover Width", type: "computed", section: "Computed" },
];

export const LEGACY_SPEC_FIELD_ALIASES: Record<string, string> = {
  specRoofSheetType: "specRoofType",
  specRoofColourTop: "specRoofTopColour",
  specRoofColourBottom: "specRoofBottomColour",
  specRoofFinishTop: "specFinishType",
  specRoofFinishBottom: "specFinishType",
  specDownpipes: "specDownpipeCount",
  specTotalGutterLength: "specBoxGutter",
  specElecFans: "specElecFan",
  specBalustradeLm: "specBalustradeLM",
  specSpanliteType: "specSpanlitesType",
  specSpanliteColour: "specSpanlitesFinish",
  specSpanliteEntries: "specSpanlitesType",
  specSkylightType: "specSpanlitesType",
  specSkylightFinish: "specSpanlitesFinish",
  specFlooringColour: "specFloorFinish",
};

export const FORMULA_ONLY_SPEC_VALUES = [
  "width",
  "length",
  "area",
  "perimeter",
  "roofRunWidth",
  "roofSheetLength",
  "roofSheetQty",
  "roofSheetLM",
  "productCover",
] as const;

export const VALID_SPEC_FIELD_VALUES = Array.from(new Set([
  ...SPEC_FIELDS.map((field) => field.value),
  ...Object.keys(LEGACY_SPEC_FIELD_ALIASES),
]));

export const VALID_SPEC_FORMULA_VARIABLES = Array.from(new Set([
  ...VALID_SPEC_FIELD_VALUES,
  ...FORMULA_ONLY_SPEC_VALUES,
]));

const SPEC_TERM_OVERRIDES: Record<string, Partial<SpecDefinedTerm>> = {
  specWidth: {
    term: "Structure width",
    formulaExamples: ["specWidth", "specWidth * specLength"],
    notes: "Primary structure width in metres. Useful for area, perimeter, beam, or capping formulas.",
  },
  specLength: {
    term: "Structure length",
    formulaExamples: ["specLength", "specWidth * specLength"],
    notes: "Primary structure length in metres. Use with width for area or with side-based products.",
  },
  specArea: {
    term: "Structure area",
    formulaExamples: ["specArea", "specWidth * specLength"],
    notes: "Computed square metres from width and length.",
  },
  area: {
    term: "Area formula alias",
    formulaExamples: ["area", "area * (1 + wasteFactor / 100)"],
    notes: "Formula-only alias for computed area.",
  },
  specPerimeter: {
    term: "Structure perimeter",
    formulaExamples: ["specPerimeter", "(specWidth + specLength) * 2"],
    notes: "Computed perimeter in metres.",
  },
  perimeter: {
    term: "Perimeter formula alias",
    formulaExamples: ["perimeter"],
    notes: "Formula-only alias for computed perimeter.",
  },
  specRoofArea: {
    term: "Roof area",
    formulaExamples: ["specRoofArea", "specRoofArea * (1 + wasteFactor / 100)"],
    notes: "Pitch-adjusted roof area in square metres.",
  },
  specRoofRunWidth: {
    term: "Roof run width",
    formulaExamples: ["specRoofRunWidth", "roofSheetQty"],
    notes: "Computed dimension perpendicular to roof sheet fall direction.",
  },
  roofRunWidth: {
    term: "Roof run width formula alias",
    formulaExamples: ["roofRunWidth", "roofSheetQty"],
    notes: "Formula-only alias for the roof run width.",
  },
  specRoofSheetLength: {
    term: "Roof sheet length",
    formulaExamples: ["specRoofSheetLength", "roofSheetLM"],
    notes: "Computed dimension parallel to fall direction.",
  },
  roofSheetLength: {
    term: "Roof sheet length formula alias",
    formulaExamples: ["roofSheetLength", "roofSheetLM"],
    notes: "Formula-only alias for the computed sheet length.",
  },
  specRoofSheetQty: {
    term: "Roof sheet quantity",
    formulaExamples: ["specRoofSheetQty", "roofSheetQty"],
    notes: "Computed sheet count from roof sheet LM divided by sheet length. Use for display/takeoff, not LM pricing.",
  },
  roofSheetQty: {
    term: "Roof sheet quantity formula alias",
    formulaExamples: ["roofSheetQty"],
    notes: "Formula-only alias for the computed sheet count. Use for display/takeoff or per-sheet products, not LM pricing.",
  },
  roofSheetLM: {
    term: "Roof sheet linear metres",
    formulaExamples: ["roofSheetLM", "specRoofArea / (productCover / 1000)", "roofSheetLM * (1 + wasteFactor / 100)"],
    notes: "Pricing quantity for roof sheets. It equals pitch-adjusted roof area divided by the matched product cover width.",
  },
  productCover: {
    term: "Product cover width",
    formulaExamples: ["specRoofArea / (productCover / 1000)", "roofSheetLM"],
    notes: "Coverage width in millimetres from the matched product. Only available when a product with coverage is matched.",
  },
  wasteFactor: {
    term: "Waste factor",
    formulaExamples: ["roofSheetLM * (1 + wasteFactor / 100)", "specArea * (1 + wasteFactor / 100)"],
    notes: "Waste percentage from master data.",
  },
  specRoofType: {
    term: "Roof product type",
    formulaExamples: ["roofSheetLM", "roofSheetQty * roofSheetLength"],
    productMatchField: "specRoofType",
    notes: "Use as the trigger and product match for roof sheet products such as Climatek or Slendek.",
  },
  specRoofTopColour: {
    term: "Roof top colour",
    formulaExamples: ["roofSheetLM"],
    notes: "Use as the colour field for roof sheet, capping, and flashing mappings.",
  },
  specRoofBottomColour: {
    term: "Roof bottom colour",
    formulaExamples: ["roofSheetLM"],
    notes: "Use as the bottom colour field for roof sheet products that have separate underside colour.",
  },
  specSpanlitesType: {
    term: "Skylight product type",
    formulaExamples: ["specSkylightQty", "specSkylightQty * specSkylightLm"],
    productMatchField: "specSpanlitesType",
    notes: "Current specsheet field for the selected skylight/spanlite product. Use this as the product match field so the generated quote item uses the selected skylight name and rates.",
  },
  specSpanlitesFinish: {
    term: "Skylight finish",
    formulaExamples: ["specSkylightQty", "specSkylightQty * specSkylightLm"],
    notes: "Current specsheet field for skylight/spanlite finish. Use as the colour field only when the finish should appear on the generated quote item.",
  },
  specSkylightQty: {
    term: "Skylight quantity",
    formulaExamples: ["specSkylightQty", "specSkylightQty * specSkylightLm"],
    notes: "Number of skylight units. Multiply by skylight LM when the product is costed by lineal metre.",
  },
  specSkylightLm: {
    term: "Skylight linear metres",
    formulaExamples: ["specSkylightLm", "specSkylightQty * specSkylightLm"],
    notes: "Lineal metres per skylight entry.",
  },
  specSkylightType: {
    term: "Skylight product type legacy alias",
    formulaExamples: ["specSkylightQty", "specSkylightQty * specSkylightLm"],
    productMatchField: "specSpanlitesType",
    notes: "Compatibility alias populated from specSpanlitesType when blank. Prefer specSpanlitesType for new mappings.",
  },
  specSkylightFinish: {
    term: "Skylight finish legacy alias",
    formulaExamples: ["specSkylightQty", "specSkylightQty * specSkylightLm"],
    notes: "Compatibility alias populated from specSpanlitesFinish when blank. Prefer specSpanlitesFinish for new mappings.",
  },
  specBoxGutter: {
    term: "Total gutter length",
    formulaExamples: ["specBoxGutter / 1000", "specTotalGutterLength / 1000"],
    productMatchField: "specGutterType",
    notes: "Stored in millimetres. Divide by 1000 for LM pricing.",
  },
  specTotalGutterLength: {
    term: "Total gutter length alias",
    formulaExamples: ["specTotalGutterLength / 1000"],
    productMatchField: "specGutterType",
    notes: "Alias for specBoxGutter. Stored in millimetres, so divide by 1000 for lineal metres.",
  },
  specGutterType: {
    term: "Gutter product type",
    formulaExamples: ["specBoxGutter / 1000", "specTotalGutterLength / 1000"],
    productMatchField: "specGutterType",
    notes: "Use as the trigger/product match. Do not multiply this text field by the length.",
  },
  specGutterSideCount: {
    term: "Gutter side count",
    formulaExamples: ["specGutterSideCount"],
    productMatchField: "specGutterType",
    notes: "Computed count from selected gutter sides.",
  },
  specDownpipeCount: {
    term: "Downpipe count",
    formulaExamples: ["Math.max(1, specDownpipeCount)"],
    productMatchField: "specDownpipeType",
    notes: "Computed from downpipe markers/locations.",
  },
  specNumberOfBrackets: {
    term: "Bracket quantity",
    formulaExamples: ["specNumberOfBrackets"],
    productMatchField: "specBracketAttachmentMethod",
    notes: "Number of brackets selected in Attachment & Brackets. Use with specBracketAttachmentMethod as the product match so one selected method produces one priced bracket line.",
  },
  specBracketAttachmentMethod: {
    term: "Attachment method",
    formulaExamples: ["specNumberOfBrackets"],
    productMatchField: "specBracketAttachmentMethod",
    notes: "Use as product match for fascia, gable, popup, wall, or other bracket method selections. Avoid also activating method-specific bracket quantity mappings unless they are separate add-on products.",
  },
  specBeamSize: {
    term: "Beam size",
    formulaExamples: ["specWidth", "roofRunWidth"],
    productMatchField: "specBeamSize",
    notes: "Use as product match for beam products. Quantity usually comes from the relevant beam span or entries.",
  },
  specBeamEntries: {
    term: "Beam entries",
    formulaExamples: ["sum(lm by material and size)"],
    productMatchField: "specBeamSize",
    notes: "JSON entries from the beam section. The spec engine expands these into one LM line per material and beam size, summing repeated entry lengths. Beam LM is derived from the beam position plan: horizontal beams use width, vertical beams use projection/length.",
  },
  specBackChannelType: {
    term: "Back channel product type",
    formulaExamples: ["specBackChannelLength / 1000"],
    productMatchField: "specBackChannelType",
    notes: "Product selected for the back channel. Use with specBackChannelLength in millimetres to price LM.",
  },
  specBackChannelLength: {
    term: "Back channel length",
    formulaExamples: ["specBackChannelLength / 1000"],
    productMatchField: "specBackChannelType",
    notes: "Back channel length entered in millimetres. Divide by 1000 for LM pricing.",
  },
  specSideChannelsType: {
    term: "Side channels product type",
    formulaExamples: ["specSideChannelsLength / 1000"],
    productMatchField: "specSideChannelsType",
    notes: "Product selected for side channels. Use with specSideChannelsLength in millimetres to price LM.",
  },
  specSideChannelsLength: {
    term: "Side channels length",
    formulaExamples: ["specSideChannelsLength / 1000"],
    productMatchField: "specSideChannelsType",
    notes: "Combined side channel length entered in millimetres. Divide by 1000 for LM pricing.",
  },
  specFlashingsType: {
    term: "Flashings product type",
    formulaExamples: ["(specFlashingsLength / 1000) * Math.max(1, specFlashingsQty)", "specFlashingsLength / 1000"],
    productMatchField: "specFlashingsType",
    notes: "Use as the trigger/product match for flashing products. Quantity now comes from the entered flashing length in millimetres, optionally multiplied by the flashing quantity.",
  },
  specFlashingsLength: {
    term: "Flashings length",
    formulaExamples: ["(specFlashingsLength / 1000) * Math.max(1, specFlashingsQty)", "specFlashingsLength / 1000"],
    productMatchField: "specFlashingsType",
    notes: "Flashing length entered in millimetres. Divide by 1000 for LM pricing.",
  },
  specFlashingsQty: {
    term: "Flashings quantity",
    formulaExamples: ["(specFlashingsLength / 1000) * Math.max(1, specFlashingsQty)", "specFlashingsQty"],
    productMatchField: "specFlashingsType",
    notes: "Number of flashing runs or sets. Use Math.max(1, specFlashingsQty) when a blank value should still price one run.",
  },
  specBracketInfillType: {
    term: "Bracket infill product type",
    formulaExamples: ["specBracketInfillLength / 1000"],
    productMatchField: "specBracketInfillType",
    notes: "Glass or twinwall infill selected under Attachment & Brackets for gable or pop-up bracket methods.",
  },
  specBracketInfillLength: {
    term: "Bracket infill length",
    formulaExamples: ["specBracketInfillLength / 1000"],
    productMatchField: "specBracketInfillType",
    notes: "Infill measure entered in millimetres. Divide by 1000 for LM pricing.",
  },
  specPostsNumber: {
    term: "Post quantity",
    formulaExamples: ["specPostsNumber"],
    productMatchField: "specPostsType",
    notes: "Number of posts to generate.",
  },
  specPostsFixing: {
    term: "Post fixing method",
    formulaExamples: ["specPostsNumber"],
    productMatchField: "specPostsFixing",
    notes: "Hard-coded specsheet option: Footing, Internal Bracket, or Welded Base Plate. It is not populated from product catalogue tabs.",
  },
  specConcreteArea: {
    term: "Concrete area",
    formulaExamples: ["specConcreteArea", "specArea"],
    productMatchField: "specConcreteType",
    notes: "Concrete square metres. Use specArea as fallback only when concrete area is blank and the slab matches the structure area.",
  },
  specWallPanels: {
    term: "Wall panel quantity",
    formulaExamples: ["specWallPanels"],
    productMatchField: "specWallType",
    notes: "Number of insulated wall panels.",
  },
  specWallLM: {
    term: "Wall lineal metres",
    formulaExamples: ["specWallLM"],
    productMatchField: "specWallType",
    notes: "Lineal metres of walling.",
  },
  specElecLights: {
    term: "Electrical light quantity",
    formulaExamples: ["specElecLights"],
    productMatchField: "specElecLightType",
    notes: "Number of light fittings.",
  },
  specElecFan: {
    term: "Fan quantity",
    formulaExamples: ["specElecFan"],
    notes: "Number of ceiling fans.",
  },
  specPlumbFitoffs: {
    term: "Plumbing fitoff quantity",
    formulaExamples: ["specPlumbFitoffs"],
    notes: "Number of plumbing fitoffs.",
  },
  specBalustradeLM: {
    term: "Balustrade lineal metres",
    formulaExamples: ["specBalustradeLM"],
    productMatchField: "specBalustradeType",
    notes: "Lineal metres of balustrade.",
  },
};

function defaultFormulaExamples(field: SpecFieldDefinition): string[] {
  if (field.type === "num" || field.type === "computed") return [field.value];
  return ["1"];
}

function defaultNotes(field: SpecFieldDefinition): string {
  if (field.type === "text") return "Use as a trigger, condition, product match, colour field, or one-off allowance. Text fields are not numeric quantities.";
  if (field.type === "json") return "Structured specsheet data. Use as a trigger or condition unless a dedicated parser exists for the selected mapping.";
  if (field.type === "computed") return "Computed value available to quantity formulas.";
  return "Numeric specsheet value available to quantity formulas.";
}

function buildDefinedTerm(field: SpecFieldDefinition): SpecDefinedTerm {
  const override = SPEC_TERM_OVERRIDES[field.value] ?? {};
  return {
    term: override.term ?? field.label,
    fieldName: field.value,
    section: field.section,
    type: field.type,
    formulaExamples: override.formulaExamples ?? defaultFormulaExamples(field),
    productMatchField: override.productMatchField,
    notes: override.notes ?? defaultNotes(field),
  };
}

const SPEC_FIELD_NAMES = new Set(SPEC_FIELDS.map((field) => field.value));
const FORMULA_ALIAS_TERMS: SpecDefinedTerm[] = FORMULA_ONLY_SPEC_VALUES
  .filter((value) => !SPEC_FIELD_NAMES.has(value))
  .map((value) => buildDefinedTerm({
    value,
    label: value,
    type: "computed",
    section: "Computed Formula Aliases",
  }));

export const SPEC_DEFINED_TERMS: SpecDefinedTerm[] = [
  ...SPEC_FIELDS.map(buildDefinedTerm),
  ...FORMULA_ALIAS_TERMS,
];

function countCsv(value: unknown): number {
  if (Array.isArray(value)) return value.filter(Boolean).length;
  return String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && part.toLowerCase() !== "no" && part !== "-")
    .length;
}

const BRACKET_METHOD_QUANTITY_FIELDS = [
  { method: "Fascia brackets", field: "specFasciaBrackets" },
  { method: "Extenda brackets", field: "specExtendaBrackets" },
  { method: "Gable brackets", field: "specGableBrackets" },
  { method: "popup brackets", field: "specPopupBrackets" },
  { method: "wall brackets", field: "specWallFixingBracket" },
];

function numericSpecValue(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;
  return parseFloat(String(value)) || 0;
}

export function enrichDerivedSpecValues<T extends Record<string, any>>(values: T): T {
  const target = values as Record<string, any>;
  const gutterSideCount = countCsv(target.specGutterSides);
  const downpipeMarkerCount = countCsv(target.specDownpipeMarkers);
  const downpipeLocationCount = countCsv(target.specDownpipeLocation);

  target.specGutterSideCount = gutterSideCount;
  target.specDownpipeCount = Math.max(downpipeMarkerCount, downpipeLocationCount);

  for (const [legacyField, currentField] of Object.entries(LEGACY_SPEC_FIELD_ALIASES)) {
    if (target[legacyField] === undefined || target[legacyField] === null || target[legacyField] === "") {
      target[legacyField] = target[currentField];
    }
  }

  const bracketMethod = String(target.specBracketAttachmentMethod || "").trim();
  const bracketQty = numericSpecValue(target.specNumberOfBrackets);
  const inferredBracket = BRACKET_METHOD_QUANTITY_FIELDS.find(({ field }) => numericSpecValue(target[field]) > 0);
  if (!bracketMethod && inferredBracket) {
    target.specBracketAttachmentMethod = inferredBracket.method;
  }
  if (bracketQty <= 0 && inferredBracket) {
    target.specNumberOfBrackets = numericSpecValue(target[inferredBracket.field]);
  }

  return values;
}
