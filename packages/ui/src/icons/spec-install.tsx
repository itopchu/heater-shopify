import type {SVGAttributes} from "react";

/**
 * Wrench. Used for installation / fitting specs.
 * Editorial outline aesthetic.
 */
export function SpecInstallIcon(props: SVGAttributes<SVGSVGElement>) {
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
      <path d="M15 3a5 5 0 0 0-4 8L3 19l2 2 8-8a5 5 0 0 0 6-7l-3 3-3-1-1-3 3-3a5 5 0 0 0-3 1Z" />
    </svg>
  );
}

export default SpecInstallIcon;
