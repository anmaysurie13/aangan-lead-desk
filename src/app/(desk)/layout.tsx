// Fonts are bundled from npm (@fontsource), same approach as the root layout: no build-time Google Fonts fetch.
import "@fontsource/fraunces/latin-300.css";
import "@fontsource/fraunces/latin-400.css";
import "@fontsource/fraunces/latin-300-italic.css";
import "@fontsource/fraunces/latin-400-italic.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/manrope/latin-800.css";
import "./desk.css";

export default function DeskLayout({ children }: { children: React.ReactNode }) {
  return <div className="desk">{children}</div>;
}
