import type {SVGAttributes} from "react";

/**
 * Ruler with tick marks. Used for width × height × depth specs.
 * Editorial outline aesthetic.
 */
export function SpecDimensionsIcon(props: SVGAttributes<SVGSVGElement>) {
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
      <rect x="2" y="9" width="20" height="6" rx="1" />
      <path d="M6 9v3" />
      <path d="M10 9v3" />
      <path d="M14 9v3" />
      <path d="M18 9v3" />
    </svg>
  );
}

export default SpecDimensionsIcon;
