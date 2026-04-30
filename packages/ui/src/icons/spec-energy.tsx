import type {SVGAttributes} from "react";

/**
 * Stacked chevrons (energy efficiency triangle). Used for energy class /
 * efficiency rating specs. Editorial outline aesthetic.
 */
export function SpecEnergyIcon(props: SVGAttributes<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M5 9 12 4l7 5" />
      <path d="M5 14 12 9l7 5" />
      <path d="M5 19 12 14l7 5" />
    </svg>
  );
}

export default SpecEnergyIcon;
