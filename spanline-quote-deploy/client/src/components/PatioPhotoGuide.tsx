import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, CheckCircle2, XCircle, Info, Download } from "lucide-react";

export function PatioPhotoGuide() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Camera className="h-4 w-4" />
          Photo Guide
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" />
              Site Photo Guide for Patio Planner
            </DialogTitle>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                const printWindow = window.open("", "_blank");
                if (!printWindow) return;
                printWindow.document.write(`
                  <html>
                  <head>
                    <title>Site Photo Guide - Patio Planner</title>
                    <style>
                      * { box-sizing: border-box; margin: 0; padding: 0; }
                      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; font-size: 12px; line-height: 1.5; color: #1a1a1a; }
                      h1 { font-size: 20px; margin-bottom: 4px; }
                      h2 { font-size: 14px; margin-top: 16px; margin-bottom: 6px; border-bottom: 1px solid #e5e5e5; padding-bottom: 3px; }
                      .subtitle { color: #666; font-size: 11px; margin-bottom: 16px; }
                      .info-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 10px; margin-bottom: 12px; }
                      .info-box p { color: #1e40af; }
                      .item { display: flex; gap: 8px; margin-bottom: 6px; }
                      .icon-good { color: #16a34a; font-weight: bold; }
                      .icon-bad { color: #dc2626; font-weight: bold; }
                      .icon-info { color: #2563eb; font-weight: bold; }
                      .grid-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: #f5f5f5; border-radius: 6px; padding: 10px; margin-bottom: 8px; }
                      .grid-2col ul { padding-left: 16px; font-size: 11px; color: #555; }
                      .grid-2col p { font-size: 11px; font-weight: 600; margin-bottom: 4px; }
                      .mistakes { border: 1px solid #e5e5e5; border-radius: 6px; overflow: hidden; }
                      .mistake-item { padding: 8px 10px; border-bottom: 1px solid #e5e5e5; }
                      .mistake-item:last-child { border-bottom: none; }
                      .mistake-item .title { font-weight: 600; font-size: 12px; }
                      .mistake-item .desc { font-size: 11px; color: #666; }
                      .checklist { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 10px; }
                      .checklist-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
                      .checklist-item { display: flex; align-items: center; gap: 6px; font-size: 11px; }
                      .checklist-item::before { content: '☐'; font-size: 14px; }
                      .connection-types { border: 1px solid #e5e5e5; border-radius: 6px; overflow: hidden; }
                      .connection-item { padding: 8px 10px; border-bottom: 1px solid #e5e5e5; }
                      .connection-item:last-child { border-bottom: none; }
                      .connection-item .title { font-weight: 600; font-size: 12px; }
                      .connection-item .desc { font-size: 11px; color: #555; margin-top: 3px; }
                      .pro-tips p { margin-bottom: 6px; }
                      .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e5e5e5; font-size: 10px; color: #999; text-align: center; }
                      @media print { body { padding: 12px; } }
                    </style>
                  </head>
                  <body>
                    <h1>📷 Site Photo Guide</h1>
                    <p class="subtitle">Patio Planner — Printable Reference</p>

                    <div class="info-box">
                      <p>ℹ️ The quality of your site photo directly affects how realistic the overlay looks. Follow these guidelines to capture the best photo for the Patio Planner tool.</p>
                    </div>

                    <h2>Camera Position & Angle</h2>
                    <div class="item"><span class="icon-good">✓</span><p><strong>Stand back 8–12 metres</strong> from the house wall where the patio will attach.</p></div>
                    <div class="item"><span class="icon-good">✓</span><p><strong>Hold the camera at chest height</strong> (approx. 1.2–1.5m).</p></div>
                    <div class="item"><span class="icon-good">✓</span><p><strong>Face the wall squarely</strong> — stand directly perpendicular to the house wall.</p></div>
                    <div class="item"><span class="icon-bad">✗</span><p><strong>Avoid extreme angles</strong> — shooting from the corner creates perspective distortion.</p></div>

                    <h2>What to Include in Frame</h2>
                    <div class="grid-2col">
                      <div><p style="color:#15803d">Must Include:</p><ul><li>Full width of the attachment wall</li><li>Roof edge / eave / fascia line</li><li>Ground level at the post line</li><li>At least 1m of roof above the eave</li><li>At least 1m of ground beyond post line</li></ul></div>
                      <div><p style="color:#b45309">Nice to Have:</p><ul><li>Existing downpipes visible</li><li>Fence lines for context</li><li>Neighbouring structures</li><li>Garden beds / landscaping</li><li>Any obstacles (trees, A/C units)</li></ul></div>
                    </div>
                    <div class="item"><span class="icon-good">✓</span><p><strong>Leave space above the roof</strong> — include 1–2m of sky above the existing roof line.</p></div>
                    <div class="item"><span class="icon-good">✓</span><p><strong>Capture the full width</strong> — show the entire span where the patio will be built.</p></div>

                    <h2>Photo Orientation</h2>
                    <div class="item"><span class="icon-good">✓</span><p><strong>Landscape orientation preferred</strong> — hold your phone sideways.</p></div>
                    <div class="item"><span class="icon-bad">✗</span><p><strong>Portrait photos</strong> can work for narrow structures but leave wasted space.</p></div>

                    <h2>Lighting Conditions</h2>
                    <div class="item"><span class="icon-good">✓</span><p><strong>Overcast days are ideal</strong> — even lighting with no harsh shadows.</p></div>
                    <div class="item"><span class="icon-good">✓</span><p><strong>Morning or late afternoon</strong> — sun behind you illuminating the wall face.</p></div>
                    <div class="item"><span class="icon-bad">✗</span><p><strong>Avoid midday sun</strong> — strong overhead sun creates dark shadows under the eave.</p></div>

                    <h2>Common Mistakes</h2>
                    <div class="mistakes">
                      <div class="mistake-item"><span class="icon-bad">✗</span> <span class="title">Too close to the wall</span><br/><span class="desc">Creates barrel distortion. Step back further.</span></div>
                      <div class="mistake-item"><span class="icon-bad">✗</span> <span class="title">Roof cut off at the top</span><br/><span class="desc">Always include the full eave and some roof above.</span></div>
                      <div class="mistake-item"><span class="icon-bad">✗</span> <span class="title">Shooting at 45° angle</span><br/><span class="desc">The cross-section is a flat side elevation. Angled photos look skewed.</span></div>
                      <div class="mistake-item"><span class="icon-bad">✗</span> <span class="title">Obstructions in the way</span><br/><span class="desc">Move cars, bins, or furniture, or shoot from the other side.</span></div>
                      <div class="mistake-item"><span class="icon-bad">✗</span> <span class="title">Ground not visible</span><br/><span class="desc">The overlay needs to show post footings at ground level.</span></div>
                    </div>

                    <h2>Quick Checklist Before You Shoot</h2>
                    <div class="checklist">
                      <div class="checklist-grid">
                        <div class="checklist-item">Phone in landscape mode</div>
                        <div class="checklist-item">8–12m back from wall</div>
                        <div class="checklist-item">Facing wall squarely</div>
                        <div class="checklist-item">Full wall width visible</div>
                        <div class="checklist-item">Roof/eave line visible</div>
                        <div class="checklist-item">Ground level visible</div>
                        <div class="checklist-item">Sky above roof (1–2m space)</div>
                        <div class="checklist-item">No obstructions blocking view</div>
                      </div>
                    </div>

                    <h2>Connection Type Photography Tips</h2>
                    <div class="connection-types">
                      <div class="connection-item"><span class="title">Flyover Bracket</span><p class="desc">Capture the full existing roof ridge and at least 300mm above it. Include the roof sheeting profile clearly.</p></div>
                      <div class="connection-item"><span class="title">Through Eave</span><p class="desc">Focus on the eave/fascia junction and soffit area. Show the eave width, fascia board, and any existing guttering.</p></div>
                      <div class="connection-item"><span class="title">Back Channel (Fascia Mount)</span><p class="desc">Photograph the fascia board and wall junction clearly. Show the fascia material, its height, and any existing guttering.</p></div>
                      <div class="connection-item"><span class="title">Crank Post</span><p class="desc">Show the wall face and ground level at the wall line. Capture any obstructions (windows, doors, A/C units, meters).</p></div>
                    </div>

                    <h2>Existing Roof Detail</h2>
                    <div class="item"><span class="icon-good">✓</span><p>Photograph the <strong>roof sheeting profile close-up</strong> for matching.</p></div>
                    <div class="item"><span class="icon-good">✓</span><p>Note the <strong>existing gutter type</strong> — quad, half-round, or fascia gutter.</p></div>

                    <h2>Pro Tips</h2>
                    <div class="pro-tips">
                      <p><strong>Take multiple shots</strong> — capture 3–4 photos from slightly different positions.</p>
                      <p><strong>Include a reference object</strong> — a person or measuring tape helps calibrate scale.</p>
                      <p><strong>Note the measurements</strong> — wall height to eave, ground fall, and any step-downs.</p>
                      <p><strong>Second angle for front elevation</strong> — take a photo from the side for the depth/projection view.</p>
                    </div>

                    <div class="footer">Spanline Patio Planner — Site Photo Guide</div>
                  </body>
                  </html>
                `);
                printWindow.document.close();
                printWindow.focus();
                setTimeout(() => { printWindow.print(); }, 300);
              }}
            >
              <Download className="h-4 w-4" />
              Print / PDF
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6 text-sm">
          {/* Introduction */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <p className="text-blue-800">
                The quality of your site photo directly affects how realistic the overlay looks.
                Follow these guidelines to capture the best photo for the Patio Planner tool.
              </p>
            </div>
          </div>

          {/* Camera Position */}
          <section>
            <h3 className="font-semibold text-base mb-2">Camera Position & Angle</h3>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <p><strong>Stand back 8–12 metres</strong> from the house wall where the patio will attach. This gives enough perspective to show the full structure width.</p>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <p><strong>Hold the camera at chest height</strong> (approximately 1.2–1.5m). This matches the natural viewing angle and aligns with the cross-section diagram perspective.</p>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <p><strong>Face the wall squarely</strong> — stand directly perpendicular to the house wall, not at an angle. The overlay works best with a flat, front-on view.</p>
              </div>
              <div className="flex items-start gap-2">
                <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <p><strong>Avoid extreme angles</strong> — shooting from the corner of the house creates perspective distortion that makes the overlay look unrealistic.</p>
              </div>
            </div>
          </section>

          {/* Framing */}
          <section>
            <h3 className="font-semibold text-base mb-2">What to Include in Frame</h3>
            <div className="bg-muted/50 rounded-lg p-3 mb-3">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="space-y-1">
                  <p className="font-semibold text-green-700">Must Include:</p>
                  <ul className="space-y-0.5 list-disc list-inside text-muted-foreground">
                    <li>Full width of the attachment wall</li>
                    <li>Roof edge / eave / fascia line</li>
                    <li>Ground level at the post line</li>
                    <li>At least 1m of roof above the eave</li>
                    <li>At least 1m of ground beyond post line</li>
                  </ul>
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-amber-700">Nice to Have:</p>
                  <ul className="space-y-0.5 list-disc list-inside text-muted-foreground">
                    <li>Existing downpipes visible</li>
                    <li>Fence lines for context</li>
                    <li>Neighbouring structures</li>
                    <li>Garden beds / landscaping</li>
                    <li>Any obstacles (trees, A/C units)</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
              <p><strong>Leave space above the roof</strong> — include at least 1–2 metres of sky above the existing roof line. The patio roof overlay needs this space to show the flyover or pop-up connection.</p>
            </div>
            <div className="flex items-start gap-2 mt-2">
              <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
              <p><strong>Capture the full width</strong> — the photo should show the entire span where the patio will be built. If the patio is 8m wide, make sure both ends of that 8m are visible.</p>
            </div>
          </section>

          {/* Orientation */}
          <section>
            <h3 className="font-semibold text-base mb-2">Photo Orientation</h3>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
              <p><strong>Landscape orientation preferred</strong> — hold your phone sideways. This gives the best width-to-height ratio for overlaying the cross-section diagram.</p>
            </div>
            <div className="flex items-start gap-2 mt-2">
              <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <p><strong>Portrait photos</strong> can work for narrow structures but will leave wasted space on either side of the overlay.</p>
            </div>
          </section>

          {/* Lighting */}
          <section>
            <h3 className="font-semibold text-base mb-2">Lighting Conditions</h3>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <p><strong>Overcast days are ideal</strong> — even lighting with no harsh shadows gives the cleanest result for colour matching.</p>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <p><strong>Morning or late afternoon</strong> — if sunny, shoot when the sun is behind you (illuminating the wall face) rather than backlighting it.</p>
              </div>
              <div className="flex items-start gap-2">
                <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <p><strong>Avoid midday sun</strong> — strong overhead sun creates dark shadows under the eave that obscure the attachment detail.</p>
              </div>
            </div>
          </section>

          {/* Common Mistakes */}
          <section>
            <h3 className="font-semibold text-base mb-2">Common Mistakes</h3>
            <div className="border rounded-lg divide-y">
              <div className="p-2.5 flex items-start gap-2">
                <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Too close to the wall</p>
                  <p className="text-muted-foreground text-xs">Creates barrel distortion and doesn't show enough context. Step back further.</p>
                </div>
              </div>
              <div className="p-2.5 flex items-start gap-2">
                <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Roof cut off at the top</p>
                  <p className="text-muted-foreground text-xs">The overlay needs to show where the patio attaches to the existing roof. Always include the full eave and some roof above.</p>
                </div>
              </div>
              <div className="p-2.5 flex items-start gap-2">
                <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Shooting at 45° angle</p>
                  <p className="text-muted-foreground text-xs">The cross-section diagram is a flat side elevation. Angled photos make the overlay look skewed and unrealistic.</p>
                </div>
              </div>
              <div className="p-2.5 flex items-start gap-2">
                <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Obstructions in the way</p>
                  <p className="text-muted-foreground text-xs">Cars, bins, or garden furniture blocking the view. Move them or shoot from the other side.</p>
                </div>
              </div>
              <div className="p-2.5 flex items-start gap-2">
                <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Ground not visible</p>
                  <p className="text-muted-foreground text-xs">The overlay needs to show post footings at ground level. Make sure the ground where posts will go is in frame.</p>
                </div>
              </div>
            </div>
          </section>

          {/* Quick Checklist */}
          <section>
            <h3 className="font-semibold text-base mb-2">Quick Checklist Before You Shoot</h3>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" className="rounded" />
                  <span>Phone in landscape mode</span>
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" className="rounded" />
                  <span>8–12m back from wall</span>
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" className="rounded" />
                  <span>Facing wall squarely (not angled)</span>
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" className="rounded" />
                  <span>Full wall width visible</span>
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" className="rounded" />
                  <span>Roof/eave line visible</span>
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" className="rounded" />
                  <span>Ground level visible</span>
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" className="rounded" />
                  <span>Sky above roof (1–2m space)</span>
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" className="rounded" />
                  <span>No obstructions blocking view</span>
                </label>
              </div>
            </div>
          </section>

          {/* Connection-Type-Specific Guidance */}
          <section>
            <h3 className="font-semibold text-base mb-2">Connection Type Photography Tips</h3>
            <p className="text-muted-foreground mb-3">The connection method between the patio and your house affects what the AI needs to see. Focus your photo on the relevant area:</p>
            <div className="border rounded-lg divide-y">
              <div className="p-2.5">
                <p className="font-medium text-sm">Flyover Bracket</p>
                <div className="flex items-start gap-2 mt-1">
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">Capture the <strong>full existing roof ridge and at least 300mm above it</strong>. The patio roof flies over the house roof, so the AI needs to see where the extenda brackets will sit. Include the roof sheeting profile clearly.</p>
                </div>
              </div>
              <div className="p-2.5">
                <p className="font-medium text-sm">Through Eave</p>
                <div className="flex items-start gap-2 mt-1">
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">Focus on the <strong>eave/fascia junction and soffit area</strong>. The back channel bolts through the eave lining into the rafter. Show the eave width, fascia board, and any existing guttering clearly. Note if the eave is lined or open.</p>
                </div>
              </div>
              <div className="p-2.5">
                <p className="font-medium text-sm">Back Channel (Fascia Mount)</p>
                <div className="flex items-start gap-2 mt-1">
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">Photograph the <strong>fascia board and wall junction</strong> clearly. The back channel mounts directly to the fascia or wall plate. Show the fascia material (timber/metal), its height, and any existing guttering that may need to be relocated.</p>
                </div>
              </div>
              <div className="p-2.5">
                <p className="font-medium text-sm">Crank Post</p>
                <div className="flex items-start gap-2 mt-1">
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">Show the <strong>wall face and ground level at the wall line</strong>. Cranked posts mount at ground level and angle up to the beam height. Capture any obstructions along the wall (windows, doors, A/C units, meters) that affect post placement. Show the wall cladding material (brick, weatherboard, render).</p>
                </div>
              </div>
            </div>
          </section>

          {/* Roof Panel Photography Tips */}
          <section>
            <h3 className="font-semibold text-base mb-2">Existing Roof Detail</h3>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <p>If the patio connects to an existing roof (flyover or through-eave), <strong>photograph the roof sheeting profile close-up</strong> — this helps match the new patio panels to the existing roof for a seamless look.</p>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <p><strong>Note the existing gutter type</strong> — quad, half-round, or fascia gutter. The AI render will match the selected gutter style, so knowing what's already there helps with consistency.</p>
              </div>
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                <p className="text-muted-foreground">If you're unsure about the connection type, take photos from multiple angles — the AI assistant can help identify the best approach based on the site conditions.</p>
              </div>
            </div>
          </section>

          {/* Pro Tips */}
          <section>
            <h3 className="font-semibold text-base mb-2">Pro Tips</h3>
            <div className="space-y-2 text-muted-foreground">
              <p><strong className="text-foreground">Take multiple shots</strong> — capture 3–4 photos from slightly different positions. You can choose the best one later in the editor.</p>
              <p><strong className="text-foreground">Include a reference object</strong> — a person standing at the post line or a measuring tape on the wall helps calibrate the overlay scale more accurately.</p>
              <p><strong className="text-foreground">Note the measurements</strong> — while on site, measure the wall height to eave, ground fall, and any step-downs. Enter these in the Structure tab for accurate overlay scaling.</p>
              <p><strong className="text-foreground">Second angle for front elevation</strong> — if you want to use the Front Elevation overlay too, take a second photo from the side (perpendicular to the first) showing the depth/projection view.</p>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
