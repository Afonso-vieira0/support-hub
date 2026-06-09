export type TicketCategory =
  | "hardware"
  | "software"
  | "networks"
  | "printers"
  | "operating_systems"
  | "mobile_devices"
  | "others";

export const CATEGORIES: { value: TicketCategory; label: string; icon: string }[] = [
  { value: "hardware", label: "Hardware", icon: "🔧" },
  { value: "software", label: "Software", icon: "💾" },
  { value: "networks", label: "Redes", icon: "🌐" },
  { value: "printers", label: "Impressoras", icon: "🖨️" },
  { value: "operating_systems", label: "Sistemas Operativos", icon: "🖥️" },
  { value: "mobile_devices", label: "Dispositivos Móveis", icon: "📱" },
  { value: "others", label: "Outros", icon: "❓" },
];

export const categoryLabel = (c: TicketCategory) =>
  CATEGORIES.find((x) => x.value === c)?.label ?? c;

export const categoryIcon = (c: TicketCategory) =>
  CATEGORIES.find((x) => x.value === c)?.icon ?? "❓";