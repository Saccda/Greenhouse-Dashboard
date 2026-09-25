"use client";
/**
 * HMI › 3D Model — the operator view's landing page.
 *
 * This is what /hmi opens on, because it is what the operator view is FOR at
 * campus: the model is the thing people come to look at, and making them
 * click past a schematic to reach it was a hop with no purpose.
 *
 * The P&ID has not gone anywhere — it is one tab across, at /hmi/process. The
 * two answer different questions: the schematic says what connects to what and
 * what is running, the model says what it physically looks like and where a
 * given part is. Each is better with the whole width than both sharing it.
 *
 * Worth noting for anyone who knows the standards: a plant HMI would
 * conventionally land on the process overview, not a 3D render. This is a
 * teaching rig, where seeing the real geometry is most of the point, so the
 * order is deliberate rather than an oversight.
 *
 * The viewer itself is untouched, channel binding and preview controls
 * included.
 */
import CampusModelViewer from "@/components/site/CampusModelViewer";

export default function HmiLanding() {
  return (
    <div className="h-full min-h-0 p-2">
      <CampusModelViewer farm="campus" />
    </div>
  );
}
