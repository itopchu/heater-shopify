import type {SVGAttributes} from "react";

/**
 * Side-view delivery truck. Used for shipping/delivery trust marks.
 * Editorial outline aesthetic.
 */
export function TrustDeliveryIcon(props: SVGAttributes<SVGSVGElement>) {
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
      <path d="M2 6h11v10H2z" />
      <path d="M13 9h5l3 3v4h-8z" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  );
}

export default TrustDeliveryIcon;
