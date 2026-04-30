import type {SVGAttributes} from "react";

/**
 * Curved counter-clockwise arrow ("undo"). Used for return/refund trust
 * marks. Editorial outline aesthetic.
 */
export function TrustReturnIcon(props: SVGAttributes<SVGSVGElement>) {
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
      <path d="M4 8h10a6 6 0 0 1 0 12H8" />
      <path d="m8 4-4 4 4 4" />
    </svg>
  );
}

export default TrustReturnIcon;
