import { IBM_Plex_Sans, IBM_Plex_Serif, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const sans = IBM_Plex_Sans({ weight: ["400", "500", "600"], subsets: ["latin"], variable: "--font-sans" });
const serif = IBM_Plex_Serif({ weight: ["600", "700"], subsets: ["latin"], variable: "--font-serif" });
const mono = IBM_Plex_Mono({ weight: ["400", "500", "600"], subsets: ["latin"], variable: "--font-mono" });

export const metadata = {
  title: "Vynbill: prompt-first AI invoice generator",
  description:
    "Describe what you're billing in plain English and Vynbill drafts the invoice live. Built for freelancers and small businesses, in USD and Malaysian Ringgit.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
