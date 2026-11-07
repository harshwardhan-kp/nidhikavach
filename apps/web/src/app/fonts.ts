import localFont from "next/font/local";

export const schibsted = localFont({
  variable: "--font-schibsted",
  display: "swap",
  src: [
    { path: "../../public/assets/schibsted-grotesk-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../public/assets/schibsted-grotesk-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
});

export const geistMono = localFont({
  variable: "--font-geist-mono",
  display: "swap",
  src: [{ path: "../../public/assets/geist-mono-latin-400-normal.woff2", weight: "400", style: "normal" }],
});

export const instrument = localFont({
  variable: "--font-instrument",
  display: "swap",
  src: [
    { path: "../../public/assets/instrument-serif-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../public/assets/instrument-serif-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
});
