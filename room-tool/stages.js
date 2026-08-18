/* Villa El Rehab — JOOD design & staging transformation.
   Plain global (no Babel) so it can load as a normal <script>. */
window.ROOM_STAGES = [
  {
    key: "current",
    n: "01",
    name: "As Assessed",
    tag: "Day 0 · Walkthrough",
    state: "before",
    blurb:
      "The unit as JOOD found it on the property assessment — sound bones and good light, but a long-term-let palette that won't command a nightly rate. This is our baseline.",
    items: [
      { name: "Footprint", spec: "4.8 × 5.4 m · south-facing bay" },
      { name: "Condition", spec: "scored 6.2 / 10 · 40-point rubric" },
      { name: "To address", spec: "carpet · beige walls · dark units" },
    ],
  },
  {
    key: "cleared",
    n: "02",
    name: "Cleared",
    tag: "Week 1 · Set-up",
    state: "work",
    blurb:
      "Existing furniture removed, floors protected, dust screens to the hall. A blank canvas to execute the signed design plan against.",
    items: [
      { name: "Clearance", spec: "full furniture removal & disposal" },
      { name: "Protection", spec: "breathable hardboard floor cover" },
      { name: "Site setup", spec: "dust screens to hallway" },
    ],
  },
  {
    key: "paint",
    n: "03",
    name: "Repaint Walls",
    tag: "Week 2 · Colour",
    state: "work",
    blurb:
      "A soft, warm envelope that photographs beautifully under daylight. Walls in a chalky greige, woodwork a half-tone lighter, ceiling a clean flat white.",
    items: [
      { name: "Walls", spec: "chalky greige · estate emulsion" },
      { name: "Woodwork", spec: "warm white · eggshell" },
      { name: "Bay accent", spec: "terracotta · feature reveal" },
    ],
  },
  {
    key: "furniture",
    n: "04",
    name: "FF&E & Lighting",
    tag: "Week 3 · Fit-out",
    state: "work",
    blurb:
      "Furniture and light go in together. A deep modular sofa, leather armchairs, and travertine table land on a hand-knotted rug — lit by recessed LEDs, a plaster pendant, and brass sconces on dimmers.",
    items: [
      { name: "Sofa", spec: "3.5-seat modular · bouclé · oatmeal" },
      { name: "Armchairs", spec: "pair · walnut & tan leather" },
      { name: "Ambient", spec: "recessed LED · 2700K · dimmable" },
      { name: "Statement", spec: "plaster dome pendant" },
      { name: "Rug", spec: "hand-knotted wool · 3 × 4 m" },
    ],
  },
  {
    key: "styling",
    n: "05",
    name: "Styling",
    tag: "Week 3 · The finish",
    state: "work",
    blurb:
      "Art, texture and greenery bring the room to life for the shoot — linen cushions, a wool throw, ceramics, books, and an olive tree by the bay.",
    items: [
      { name: "Art", spec: "framed triptych over sofa" },
      { name: "Soft", spec: "linen cushions & wool throw" },
      { name: "Greenery", spec: "olive tree + trailing planters" },
      { name: "Window", spec: "linen roman blinds + sheers" },
    ],
  },
];
