const icons = {
  home: <path d="m3 11 9-7 9 7M5.5 10v10h4.25v-5.5h4.5V20h4.25V10" />,
  studies: (
    <>
      <path d="M6 3.5h8l4 4v13H6zM14 3.5v4h4" />
      <path d="M8.5 14h2l1.5-3 1.5 5 1-2H16" />
    </>
  ),
  patients: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.75" />
      <path d="M6 15.5a3 3 0 0 1 6 0M15 10h3m-3 4h3" />
    </>
  ),
  switch: <path d="M4 8h15m-3-3 3 3-3 3M20 16H5m3-3-3 3 3 3" />,
  clinic: <path d="M4 20h16M6 20V5h12v15m-8 0v-4h4v4m-2-12v5m-2.5-2.5h5" />,
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5m0-8.25v.01" />
    </>
  ),
  arrow: <path d="M4.5 12h14m-5-5 5 5-5 5" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15 15 5 5" />
    </>
  ),
};

export function ClinicalIcon({ name }: { name: keyof typeof icons }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className="clinical-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {icons[name]}
    </svg>
  );
}
