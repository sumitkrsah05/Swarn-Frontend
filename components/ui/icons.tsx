/**
 * Inline SVG icon set (24×24, stroke-based, currentColor). Icons are drawn
 * with `stroke` so they inherit text colour and weight from their context;
 * every one is decorative by default and hidden from assistive tech unless a
 * `title` is supplied.
 *
 * Chart-kind, column-type and thread row icons are drawn here as simple
 * monochrome line art so nothing is copied from another product.
 */

import type { SVGProps } from "react";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  /** pixel size for both width and height (default 16) */
  size?: number;
  /** accessible name; without it the icon is aria-hidden */
  title?: string;
}

function Svg({ size = 16, title, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
      {...rest}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

// ------------------------------------------------------------ navigation

export const MenuIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 6h16M4 12h16M4 18h16" /></Svg>
);
export const CloseIcon = (p: IconProps) => (
  <Svg {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>
);
export const ChatIcon = (p: IconProps) => (
  <Svg {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></Svg>
);
export const PlayIcon = (p: IconProps) => (
  <Svg {...p}><path d="M6 4.5v15l13-7.5z" /></Svg>
);
export const ListIcon = (p: IconProps) => (
  <Svg {...p}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></Svg>
);
export const HistoryIcon = (p: IconProps) => (
  <Svg {...p}><path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" /><path d="M12 7v5l3.5 2" /></Svg>
);
export const TreeIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="6" cy="19" r="2.5" /><circle cx="18" cy="19" r="2.5" /><circle cx="12" cy="5" r="2.5" /><path d="M12 7.5v3.5a2 2 0 0 1-2 2H8a2 2 0 0 0-2 2v1.5M12 7.5v3.5a2 2 0 0 0 2 2h2a2 2 0 0 1 2 2v1.5" /></Svg>
);
export const BeakerIcon = (p: IconProps) => (
  <Svg {...p}><path d="M9 3h6M10 3v6.2L4.6 18.9A2 2 0 0 0 6.3 22h11.4a2 2 0 0 0 1.7-3.1L14 9.2V3M7.5 15h9" /></Svg>
);
export const FolderIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9l-.81-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></Svg>
);
export const BookIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 7v14" /><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" /></Svg>
);
export const SunIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>
);
export const MoonIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 3a6.4 6.4 0 0 0 9 9 9 9 0 1 1-9-9Z" /></Svg>
);
export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}><path d="m9 18 6-6-6-6" /></Svg>
);
export const ChevronLeftIcon = (p: IconProps) => (
  <Svg {...p}><path d="m15 18-6-6 6-6" /></Svg>
);
export const ChevronDownIcon = (p: IconProps) => (
  <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>
);
export const ChevronUpIcon = (p: IconProps) => (
  <Svg {...p}><path d="m6 15 6-6 6 6" /></Svg>
);
export const SearchIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" /></Svg>
);
export const UploadIcon = (p: IconProps) => (
  <Svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></Svg>
);
export const DownloadIcon = (p: IconProps) => (
  <Svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></Svg>
);
export const CopyIcon = (p: IconProps) => (
  <Svg {...p}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Svg>
);
export const CheckIcon = (p: IconProps) => (
  <Svg {...p}><path d="M20 6 9 17l-5-5" /></Svg>
);
export const TrashIcon = (p: IconProps) => (
  <Svg {...p}><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></Svg>
);
export const RefreshIcon = (p: IconProps) => (
  <Svg {...p}><path d="M3 12a9 9 0 0 1 15.7-6L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15.7 6L3 16" /><path d="M3 21v-5h5" /></Svg>
);
export const ExternalIcon = (p: IconProps) => (
  <Svg {...p}><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></Svg>
);
export const AlertIcon = (p: IconProps) => (
  <Svg {...p}><path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z" /><path d="M12 9v4M12 17h.01" /></Svg>
);
export const InfoIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></Svg>
);
export const PaperclipIcon = (p: IconProps) => (
  <Svg {...p}><path d="m21.4 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" /></Svg>
);
export const StopIcon = (p: IconProps) => (
  <Svg {...p}><rect x="6" y="6" width="12" height="12" rx="1.5" /></Svg>
);
export const SendIcon = (p: IconProps) => (
  <Svg {...p}><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></Svg>
);
export const PlusIcon = (p: IconProps) => (
  <Svg {...p}><path d="M5 12h14M12 5v14" /></Svg>
);
export const FileIcon = (p: IconProps) => (
  <Svg {...p}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v5h5" /></Svg>
);
export const ImageIcon = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="1.6" /><path d="m21 15-4.35-4.35a2 2 0 0 0-2.83 0L6 19" /></Svg>
);
export const ArrowLeftIcon = (p: IconProps) => (
  <Svg {...p}><path d="M19 12H5M12 19l-7-7 7-7" /></Svg>
);
export const ArrowRightIcon = (p: IconProps) => (
  <Svg {...p}><path d="M5 12h14M12 5l7 7-7 7" /></Svg>
);
export const ArrowUpIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 19V5M5 12l7-7 7 7" /></Svg>
);
export const MoreIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="5" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="19" r="1.2" fill="currentColor" /></Svg>
);
export const MoreHorizontalIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="5" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="19" cy="12" r="1.2" fill="currentColor" /></Svg>
);

// ---------------------------------------------------------- thread rows

export const PersonIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Svg>
);
export const RobotIcon = (p: IconProps) => (
  <Svg {...p}><rect x="4" y="8" width="16" height="12" rx="3" /><path d="M12 8V4M9 4h6" /><circle cx="9" cy="14" r="1.2" fill="currentColor" /><circle cx="15" cy="14" r="1.2" fill="currentColor" /><path d="M2 13v3M22 13v3" /></Svg>
);
export const TableIcon = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 4v16M15 4v16" /></Svg>
);
export const DocumentIcon = (p: IconProps) => (
  <Svg {...p}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v5h5M8 13h8M8 17h6" /></Svg>
);
export const SparkleIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M12 8a4 4 0 0 0 4 4 4 4 0 0 0-4 4 4 4 0 0 0-4-4 4 4 0 0 0 4-4Z" /></Svg>
);
export const TerminalIcon = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m7 9 3 3-3 3M12 15h5" /></Svg>
);
export const ErrorIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="m15 9-6 6M9 9l6 6" /></Svg>
);
export const WarningIcon = AlertIcon;
export const MergeIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="6" cy="5" r="2.2" /><circle cx="6" cy="19" r="2.2" /><circle cx="18" cy="12" r="2.2" /><path d="M6 7.2v9.6M8 6l7.6 5M8 18l7.6-5" /></Svg>
);
export const BranchIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="6" cy="5" r="2.2" /><circle cx="6" cy="19" r="2.2" /><circle cx="18" cy="8" r="2.2" /><path d="M6 7.2v9.6M18 10.2c0 4-12 2-12 6.6" /></Svg>
);
export const ReferenceIcon = (p: IconProps) => (
  <Svg {...p}><path d="M9 8a5 5 0 0 1 5-5h1a5 5 0 0 1 0 10h-1M15 16a5 5 0 0 1-5 5H9A5 5 0 0 1 9 11h1" /></Svg>
);
export const ClockIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>
);
export const QuestionIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01" /></Svg>
);
export const StarIcon = (p: IconProps) => (
  <Svg {...p}><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" /></Svg>
);
export const BugIcon = (p: IconProps) => (
  <Svg {...p}><path d="M8 9a4 4 0 0 1 8 0v6a4 4 0 0 1-8 0Z" /><path d="M12 13v6M3 13h5M16 13h5M5 7l3 2M19 7l-3 2M5 19l3-2M19 19l-3-2M9 5l1 2M15 5l-1 2" /></Svg>
);

// ----------------------------------------------------------- chart kinds

export const BarChartIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 20V10M10 20V4M16 20v-8M22 20H2" /></Svg>
);
export const LineChartIcon = (p: IconProps) => (
  <Svg {...p}><path d="M3 20h18M3 16l5-6 4 3 5-7 4 4" /></Svg>
);
export const ScatterIcon = (p: IconProps) => (
  <Svg {...p}><path d="M3 20h18M3 4v16" /><circle cx="8" cy="15" r="1.4" fill="currentColor" /><circle cx="12" cy="10" r="1.4" fill="currentColor" /><circle cx="16" cy="12" r="1.4" fill="currentColor" /><circle cx="18" cy="6" r="1.4" fill="currentColor" /><circle cx="10" cy="7" r="1.4" fill="currentColor" /></Svg>
);
export const GridIcon = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></Svg>
);
export const PieIcon = (p: IconProps) => (
  <Svg {...p}><path d="M21 12A9 9 0 1 1 12 3v9Z" /><path d="M12 3a9 9 0 0 1 9 9h-9Z" /></Svg>
);
export const AreaChartIcon = (p: IconProps) => (
  <Svg {...p}><path d="M3 20h18" /><path d="M3 17 8 9l4 4 5-7 4 5v6H3Z" /></Svg>
);
export const BoxPlotIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 3v4M12 17v4M7 7h10M7 21h10" /><rect x="6" y="7" width="12" height="10" rx="1" /><path d="M6 12h12" /></Svg>
);
export const HistogramIcon = (p: IconProps) => (
  <Svg {...p}><path d="M3 20h18M4 20v-4h3v4M8 20V8h3v12M12 20V4h3v16M16 20v-9h3v9" /></Svg>
);
export const ChartIcon = BarChartIcon;

// --------------------------------------------------------- column types

export const TypeNumberIcon = (p: IconProps) => (
  <Svg {...p}><path d="M9 4 7 20M17 4l-2 16M4 9h16M3 15h16" /></Svg>
);
export const TypeTextIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 18 9 6l5 12M5.8 14h6.4M15 12c1.5-1 4-1 4 1v5M19 15c0 2-4 3-4 1s2-2 4-2" /></Svg>
);
export const TypeDateIcon = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Svg>
);
export const TypeBoolIcon = (p: IconProps) => (
  <Svg {...p}><rect x="2" y="7" width="20" height="10" rx="5" /><circle cx="15" cy="12" r="3" /></Svg>
);
export const TypeOtherIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 7h16M4 12h10M4 17h13" /></Svg>
);

// ------------------------------------------------------------ toolbars

export const BoltIcon = (p: IconProps) => (
  <Svg {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></Svg>
);
export const BulbIcon = (p: IconProps) => (
  <Svg {...p}><path d="M9 18h6M10 21h4M8.5 14.5A6 6 0 1 1 15.5 14.5c-.6.6-1 1.4-1 2.5h-5c0-1.1-.4-1.9-1-2.5Z" /></Svg>
);
export const PencilIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" /><path d="m13.5 6.5 3 3" /></Svg>
);
export const DatabaseIcon = (p: IconProps) => (
  <Svg {...p}><ellipse cx="12" cy="5.5" rx="8" ry="3" /><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></Svg>
);
export const LayersIcon = (p: IconProps) => (
  <Svg {...p}><path d="m12 3 9 5-9 5-9-5Z" /><path d="m3 13 9 5 9-5M3 17.5l9 5 9-5" /></Svg>
);
export const ZoomIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6M8 11h6M11 8v6" /></Svg>
);
export const MaximizeIcon = (p: IconProps) => (
  <Svg {...p}><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></Svg>
);
export const MinimizeIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" /></Svg>
);
export const FilterIcon = (p: IconProps) => (
  <Svg {...p}><path d="M3 5h18l-7 8v6l-4 2v-8Z" /></Svg>
);
export const SortIcon = (p: IconProps) => (
  <Svg {...p}><path d="m8 9 4-4 4 4M8 15l4 4 4-4" /></Svg>
);
export const SortAscIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 20V4M5 11l7-7 7 7" /></Svg>
);
export const SortDescIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 4v16M5 13l7 7 7-7" /></Svg>
);
export const CodeIcon = (p: IconProps) => (
  <Svg {...p}><path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 4l-4 16" /></Svg>
);
export const LogIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 5h16M4 10h10M4 15h13M4 20h7" /></Svg>
);
export const SettingsIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></Svg>
);
export const DragIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="9" cy="6" r="1.2" fill="currentColor" /><circle cx="15" cy="6" r="1.2" fill="currentColor" /><circle cx="9" cy="12" r="1.2" fill="currentColor" /><circle cx="15" cy="12" r="1.2" fill="currentColor" /><circle cx="9" cy="18" r="1.2" fill="currentColor" /><circle cx="15" cy="18" r="1.2" fill="currentColor" /></Svg>
);
export const PinIcon = (p: IconProps) => (
  <Svg {...p}><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3ZM12 14v7" /></Svg>
);
export const EyeIcon = (p: IconProps) => (
  <Svg {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></Svg>
);
export const LinkIcon = ReferenceIcon;
export const ImportIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 3v12M7 10l5 5 5-5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></Svg>
);
export const HomeIcon = (p: IconProps) => (
  <Svg {...p}><path d="m3 11 9-8 9 8v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2Z" /></Svg>
);
export const DotIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" /></Svg>
);
export const CircleIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="6" /></Svg>
);
export const SpinnerIcon = (p: IconProps) => (
  <Svg {...p} className={`animate-spin motion-reduce:animate-none ${p.className ?? ""}`}><path d="M12 3a9 9 0 1 0 9 9" /></Svg>
);

/** The swarn mark: three linked nodes — data, a step, a result. Ours, not borrowed. */
export const SwarnMark = ({ size = 22, className = "" }: { size?: number; className?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden
    focusable="false"
    className={className}
  >
    <path d="M6 6.5 12 4l6 2.5v4.5L12 20 6 11Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M6 6.5 12 9l6-2.5M12 9v11" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <circle cx="12" cy="9" r="1.7" fill="currentColor" />
  </svg>
);
