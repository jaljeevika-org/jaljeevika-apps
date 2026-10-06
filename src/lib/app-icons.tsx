import {
  AppWindow, Map, MapPinned, Globe, Earth, Droplet, Droplets, WavesHorizontal, Fish, Sprout, Leaf, Wheat,
  Tractor, Users, ChartColumn, ChartPie, ChartLine, FileText, FileSpreadsheet, ClipboardList, LayoutDashboard,
  Settings, ShieldCheck, Database, Layers, BookOpen, GraduationCap, CalendarDays, Briefcase, Building,
  HandCoins, Wallet, IndianRupee, MessageSquare, Mail, Camera, Smartphone, Truck, Package, Store, Warehouse,
  Landmark, Mountain, TreePine, CloudRain, Sun, Recycle, HeartHandshake, Compass, Route, Satellite,
  Microscope, FlaskConical, Gauge, Activity, Target, Lightbulb, Rocket, Boxes, Presentation, ListChecks,
  type LucideIcon,
} from "lucide-react";

/** Built-in icons an application can use instead of an uploaded logo. */
export const APP_ICONS: Record<string, { label: string; Icon: LucideIcon }> = {
  "app-window": { label: "Application", Icon: AppWindow },
  map: { label: "Map", Icon: Map },
  "map-pinned": { label: "Map pins", Icon: MapPinned },
  globe: { label: "Globe", Icon: Globe },
  earth: { label: "Earth", Icon: Earth },
  satellite: { label: "Satellite", Icon: Satellite },
  droplet: { label: "Water drop", Icon: Droplet },
  droplets: { label: "Water", Icon: Droplets },
  waves: { label: "Water body", Icon: WavesHorizontal },
  "cloud-rain": { label: "Rainfall", Icon: CloudRain },
  fish: { label: "Fisheries", Icon: Fish },
  sprout: { label: "Sprout", Icon: Sprout },
  leaf: { label: "Leaf", Icon: Leaf },
  wheat: { label: "Crops", Icon: Wheat },
  tractor: { label: "Farming", Icon: Tractor },
  "tree-pine": { label: "Forest", Icon: TreePine },
  mountain: { label: "Landscape", Icon: Mountain },
  sun: { label: "Climate", Icon: Sun },
  recycle: { label: "Recycle", Icon: Recycle },
  users: { label: "People", Icon: Users },
  "heart-handshake": { label: "Community", Icon: HeartHandshake },
  "chart-column": { label: "Bar chart", Icon: ChartColumn },
  "chart-pie": { label: "Pie chart", Icon: ChartPie },
  "chart-line": { label: "Trends", Icon: ChartLine },
  gauge: { label: "Gauge", Icon: Gauge },
  activity: { label: "Activity", Icon: Activity },
  "layout-dashboard": { label: "Dashboard", Icon: LayoutDashboard },
  presentation: { label: "Presentation", Icon: Presentation },
  "file-text": { label: "Document", Icon: FileText },
  "file-spreadsheet": { label: "Spreadsheet", Icon: FileSpreadsheet },
  "clipboard-list": { label: "Survey", Icon: ClipboardList },
  "list-checks": { label: "Tasks", Icon: ListChecks },
  database: { label: "Database", Icon: Database },
  layers: { label: "Layers", Icon: Layers },
  "book-open": { label: "Library", Icon: BookOpen },
  "graduation-cap": { label: "Training", Icon: GraduationCap },
  "calendar-days": { label: "Calendar", Icon: CalendarDays },
  briefcase: { label: "Projects", Icon: Briefcase },
  building: { label: "Organisation", Icon: Building },
  landmark: { label: "Government", Icon: Landmark },
  "hand-coins": { label: "Finance", Icon: HandCoins },
  wallet: { label: "Wallet", Icon: Wallet },
  "indian-rupee": { label: "Rupee", Icon: IndianRupee },
  store: { label: "Market", Icon: Store },
  warehouse: { label: "Warehouse", Icon: Warehouse },
  package: { label: "Inventory", Icon: Package },
  boxes: { label: "Stock", Icon: Boxes },
  truck: { label: "Logistics", Icon: Truck },
  route: { label: "Route", Icon: Route },
  compass: { label: "Explore", Icon: Compass },
  "message-square": { label: "Messages", Icon: MessageSquare },
  mail: { label: "Mail", Icon: Mail },
  camera: { label: "Photos", Icon: Camera },
  smartphone: { label: "Mobile", Icon: Smartphone },
  microscope: { label: "Research", Icon: Microscope },
  "flask-conical": { label: "Lab", Icon: FlaskConical },
  target: { label: "Goals", Icon: Target },
  lightbulb: { label: "Ideas", Icon: Lightbulb },
  rocket: { label: "Launch", Icon: Rocket },
  "shield-check": { label: "Admin", Icon: ShieldCheck },
  settings: { label: "Settings", Icon: Settings },
};

export const DEFAULT_APP_ICON = "app-window";

export function appIcon(key: string | null | undefined): LucideIcon {
  return (key && APP_ICONS[key]?.Icon) || AppWindow;
}

/** Tile colours for icon-based applications (full class names so Tailwind keeps them). */
export const ACCENT_COLORS: Record<string, { label: string; tile: string; swatch: string }> = {
  indigo: { label: "Indigo", tile: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300", swatch: "bg-indigo-500" },
  blue: { label: "Blue", tile: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300", swatch: "bg-blue-500" },
  sky: { label: "Sky", tile: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300", swatch: "bg-sky-500" },
  teal: { label: "Teal", tile: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300", swatch: "bg-teal-500" },
  emerald: { label: "Emerald", tile: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", swatch: "bg-emerald-500" },
  lime: { label: "Lime", tile: "bg-lime-100 text-lime-700 dark:bg-lime-500/15 dark:text-lime-300", swatch: "bg-lime-500" },
  amber: { label: "Amber", tile: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300", swatch: "bg-amber-500" },
  orange: { label: "Orange", tile: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300", swatch: "bg-orange-500" },
  rose: { label: "Rose", tile: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300", swatch: "bg-rose-500" },
  violet: { label: "Violet", tile: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300", swatch: "bg-violet-500" },
  slate: { label: "Slate", tile: "bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300", swatch: "bg-slate-500" },
};

export const DEFAULT_ACCENT = "indigo";

export function accentTile(key: string | null | undefined): string {
  return (key && ACCENT_COLORS[key]?.tile) || ACCENT_COLORS.indigo.tile;
}
