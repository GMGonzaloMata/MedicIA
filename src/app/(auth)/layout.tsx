import localFont from "next/font/local";
import "./account.css";

const literata = localFont({
  src: [
    { path: "./sign-in/fonts/literata-latin.woff2", weight: "200 900", style: "normal" },
    { path: "./sign-in/fonts/literata-latin-italic.woff2", weight: "200 900", style: "italic" },
  ],
  display: "swap",
  fallback: ["Georgia", "serif"],
  variable: "--font-literata",
});

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return <main className={literata.variable}>{children}</main>;
}
